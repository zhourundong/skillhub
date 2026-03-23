const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { executeToolCall, resetGeneratedFiles, getGeneratedFiles } = require('./toolService');

const MAX_TOOL_ITERATIONS = 15; // 防止无限循环

// 文件生成回调函数
let fileGeneratedCallback = null;

/**
 * 根据选项生成工具定义
 */
function buildTools(fileOptions) {
  const allowedTypes = [];
  if (fileOptions.scripts) allowedTypes.push('scripts');
  if (fileOptions.references) allowedTypes.push('references');
  if (fileOptions.assets) allowedTypes.push('assets');

  if (allowedTypes.length === 0) {
    return [];
  }

  return [{
    type: 'function',
    function: {
      name: 'generate_file',
      description: '生成一个辅助文件（可以多次调用）',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: allowedTypes,
            description: '文件类型'
          },
          filename: {
            type: 'string',
            description: '文件名，如 helper.py、guide.md'
          },
          content: {
            type: 'string',
            description: '文件内容（不超过 5000 字符）'
          }
        },
        required: ['type', 'filename', 'content']
      }
    }
  }];
}

/**
 * 设置文件生成回调
 */
function setFileGeneratedCallback(callback) {
  fileGeneratedCallback = callback;
}

/**
 * 触发文件生成事件
 */
function emitFileGenerated(file) {
  if (typeof fileGeneratedCallback === 'function') {
    fileGeneratedCallback(file);
  }
}

const REQUIRED_FIELDS = ['name', 'description', 'skill_content'];

const DEFAULT_SKILL = {
  name: '',
  description: '',
  skill_content: ''
};

const SKILL_CREATOR_DIR = path.join(__dirname, '..', 'skill-creator');
const SKILL_MD_PATH = path.join(SKILL_CREATOR_DIR, 'SKILL.md');
const SCHEMAS_MD_PATH = path.join(SKILL_CREATOR_DIR, 'references', 'schemas.md');

/**
 * 读取 SKILL.md 并提取正文（去除 frontmatter）
 */
function readSkillCreatorBody() {
  if (!fs.existsSync(SKILL_MD_PATH)) {
    return null;
  }
  try {
    const content = fs.readFileSync(SKILL_MD_PATH, 'utf-8');
    const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    const body = match ? match[1] : content;
    return body;
  } catch (err) {
    console.error(`[AI] Failed to read SKILL.md: ${err.message}`);
    return null;
  }
}

/**
 * 读取 schemas.md 文件
 */
function readSchemasContent() {
  if (!fs.existsSync(SCHEMAS_MD_PATH)) {
    return null;
  }
  try {
    return fs.readFileSync(SCHEMAS_MD_PATH, 'utf-8');
  } catch (err) {
    console.error(`[AI] Failed to read schemas.md: ${err.message}`);
    return null;
  }
}

/**
 * 尝试修复被截断的 JSON 字符串
 */
function repairTruncatedJson(jsonStr) {
  // 统计未闭合的括号和引号
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let lastKey = '';

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
      if (char === '"') {
        inString = true;
        // 检查是否是 key
        const prevChar = jsonStr.substring(0, i).trim().slice(-1);
        if (prevChar === ',' || prevChar === '{') {
          // 可能是 key，记录下来
          let keyEnd = jsonStr.indexOf('"', i + 1);
          if (keyEnd !== -1 && jsonStr[keyEnd + 1] === ':') {
            lastKey = jsonStr.substring(i + 1, keyEnd);
          }
        }
      }
    } else {
      if (char === '"' && jsonStr[i - 1] !== '\\') {
        inString = false;
      }
    }
  }

  // 如果字符串没有闭合，添加闭合引号
  let repaired = jsonStr;
  if (inString) {
    console.log('[AI] Repairing: closing unterminated string');
    repaired += '"';
  }

  // 闭合未完成的值
  if (lastKey && !repaired.trimEnd().endsWith('"""') && !repaired.trimEnd().endsWith('"')) {
    // 可能需要添加空值
  }

  // 闭合括号
  while (bracketCount > 0) {
    repaired += ']';
    bracketCount--;
  }
  while (braceCount > 0) {
    repaired += '}';
    braceCount--;
  }

  return repaired;
}

/**
 * 修复 JSON 字符串中的常见问题（如未转义的引号）
 */
function fixJsonString(jsonStr) {
  // 尝试直接解析，如果成功就不需要修复
  try {
    JSON.parse(jsonStr);
    return jsonStr;
  } catch (e) {
    // 继续尝试修复
  }

  // 使用状态机方式重新构建 JSON
  let result = '';
  let i = 0;
  let inString = false;
  let stringStartChar = '';

  while (i < jsonStr.length) {
    const char = jsonStr[i];

    if (!inString) {
      if (char === '"') {
        inString = true;
        stringStartChar = '"';
        result += char;
      } else {
        result += char;
      }
    } else {
      if (char === '\\' && i + 1 < jsonStr.length) {
        result += char + jsonStr[i + 1];
        i++;
      } else if (char === '"') {
        const restStr = jsonStr.substring(i + 1).trimStart();
        const nextChar = restStr[0];
        if ([':', ',', '}', ']'].includes(nextChar) || restStr === '') {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
      } else {
        result += char;
      }
    }
    i++;
  }

  // 如果字符串未闭合，尝试修复
  if (inString) {
    console.log('[AI] String not closed, attempting repair');
    result = repairTruncatedJson(result);
  }

  return result;
}

function parseGeneratedSkill(rawOutput) {
  const safeOutput = typeof rawOutput === 'string' ? rawOutput : '';
  console.log(`[AI] Parsing response, length: ${safeOutput.length}, first 500 chars: ${safeOutput.substring(0, 500)}`);

  // 1. Try to extract JSON from ```json ... ``` code blocks
  let codeBlockMatch = safeOutput.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      let jsonStr = codeBlockMatch[1].trim();
      jsonStr = fixJsonString(jsonStr);
      const parsed = JSON.parse(jsonStr);
      if (isValidSkill(parsed)) {
        console.log('[AI] Parsed from json code block');
        return { success: true, skill: fillDefaults(parsed) };
      }
    } catch (e) {
      console.log(`[AI] Failed to parse json code block: ${e.message}`);
      // 尝试修复截断的 JSON
      if (e.message.includes('Unterminated')) {
        try {
          let jsonStr = repairTruncatedJson(codeBlockMatch[1].trim());
          const parsed = JSON.parse(jsonStr);
          if (isValidSkill(parsed)) {
            console.log('[AI] Parsed from repaired json code block');
            return { success: true, skill: fillDefaults(parsed) };
          }
        } catch (repairErr) {
          console.log(`[AI] Repair attempt failed: ${repairErr.message}`);
        }
      }
    }
  }

  // 2. Try to find JSON object in the response
  const jsonMatch = safeOutput.match(/\{[\s\S]*"name"[\s\S]*"description"[\s\S]*"skill_content"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      let jsonStr = jsonMatch[0];
      let braceCount = 0;
      let endIndex = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') braceCount++;
        if (jsonStr[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
      if (endIndex > 0) {
        jsonStr = jsonStr.substring(0, endIndex);
        jsonStr = fixJsonString(jsonStr);
        const parsed = JSON.parse(jsonStr);
        if (isValidSkill(parsed)) {
          console.log('[AI] Parsed from extracted JSON object');
          return { success: true, skill: fillDefaults(parsed) };
        }
      } else {
        // JSON 未闭合，尝试修复
        console.log('[AI] JSON object not properly closed, attempting repair');
        jsonStr = repairTruncatedJson(jsonMatch[0]);
        jsonStr = fixJsonString(jsonStr);
        try {
          const parsed = JSON.parse(jsonStr);
          if (isValidSkill(parsed)) {
            console.log('[AI] Parsed from repaired extracted JSON');
            return { success: true, skill: fillDefaults(parsed) };
          }
        } catch (repairErr) {
          console.log(`[AI] Repair attempt failed: ${repairErr.message}`);
        }
      }
    } catch (e) {
      console.log(`[AI] Failed to parse extracted JSON: ${e.message}`);
    }
  }

  // 3. Try to parse the raw output as bare JSON
  try {
    let jsonStr = fixJsonString(safeOutput);
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && isValidSkill(parsed)) {
      console.log('[AI] Parsed as bare JSON');
      return { success: true, skill: fillDefaults(parsed) };
    }
  } catch (_) {}

  console.log('[AI] Failed to parse as valid skill JSON');
  return { success: false, rawOutput: safeOutput };
}

function isValidSkill(parsed) {
  return parsed &&
    typeof parsed === 'object' &&
    typeof parsed.name === 'string' && parsed.name.trim() &&
    typeof parsed.description === 'string' && parsed.description.trim() &&
    typeof parsed.skill_content === 'string' && parsed.skill_content.trim();
}

/**
 * 清理文本中的过度转义字符
 */
function cleanEscapedText(text) {
  if (typeof text !== 'string') return text;

  let result = text;
  result = result.replace(/\\+"/g, '"');
  result = result.replace(/\\+'/g, "'");
  result = result.replace(/\\{4,}/g, '\\\\');
  result = result.replace(/\\\n/g, '\n');

  return result;
}

function fillDefaults(parsed) {
  const result = { ...DEFAULT_SKILL };
  for (const field of REQUIRED_FIELDS) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      let value = String(parsed[field]);
      value = cleanEscapedText(value);
      result[field] = value;
    }
  }
  return result;
}

/**
 * 流式调用 AI API
 * @returns {Promise<{content: string, reasoning: string, toolCalls: Array}>}
 */
async function streamAI(baseUrl, apiKey, model, messages, tools = [], onChunk, onReasoning) {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const requestBody = {
    model,
    messages,
    stream: true, // 启用流式
  };

  // 只有有工具时才添加
  if (tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  console.log(`[AI] Streaming request: ${url}`);
  console.log(`[AI] Model: ${model}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(requestBody),
    timeout: 300000,
  });

  console.log(`[AI] Response status: ${response.status}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `AI API 请求失败 (HTTP ${response.status})`;
    throw new Error(message);
  }

  // 处理流式响应
  let content = '';
  let reasoning = '';
  let toolCalls = [];
  let currentToolCall = null;

  const reader = response.body;
  let buffer = '';

  for await (const chunk of reader) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;

          if (!delta) continue;

          // 处理内容
          if (delta.content) {
            content += delta.content;
            if (typeof onChunk === 'function') {
              onChunk(delta.content);
            }
          }

          // 处理思考内容
          if (delta.reasoning_content) {
            reasoning += delta.reasoning_content;
            if (typeof onReasoning === 'function') {
              onReasoning(delta.reasoning_content);
            }
          }

          // 处理工具调用（流式）
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                // 确保数组有足够空间
                while (toolCalls.length <= tc.index) {
                  toolCalls.push({ id: '', type: 'function', function: { name: '', arguments: '' } });
                }
                currentToolCall = toolCalls[tc.index];

                if (tc.id) currentToolCall.id = tc.id;
                if (tc.type) currentToolCall.type = tc.type;
                if (tc.function?.name) currentToolCall.function.name = tc.function.name;
                if (tc.function?.arguments) currentToolCall.function.arguments += tc.function.arguments;
              }
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  // 过滤掉无效的工具调用
  toolCalls = toolCalls.filter(tc => tc.id && tc.function?.name);

  return { content, reasoning, toolCalls };
}

/**
 * 非流式调用 AI API（备用）
 */
async function callAI(baseUrl, apiKey, model, messages, tools = []) {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const requestBody = {
    model,
    messages,
    stream: false,
  };

  if (tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  console.log(`[AI] Non-streaming request: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    timeout: 300000,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `AI API 请求失败 (HTTP ${response.status})`;
    throw new Error(message);
  }

  return await response.json();
}

/**
 * 生成技能（支持 Function Calling 和思考模式）
 * @param {string} userPrompt - 用户输入的提示
 * @param {function} onChunk - 内容回调（增量）
 * @param {function} onReasoning - 思考内容回调（增量）
 * @param {object} options - 配置选项
 */
async function generateSkill(userPrompt, onChunk, onReasoning, options = {}) {
  // 兼容旧的调用方式（没有 onReasoning）
  if (typeof onReasoning !== 'function') {
    options = onReasoning || {};
    onReasoning = null;
  }

  const baseUrl = process.env.AI_API_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o';
  const language = options.language || 'zh';
  const enableTools = options.enableTools !== false;
  const fileOptions = options.fileOptions || { scripts: false, references: true, assets: false };

  if (!apiKey) {
    throw new Error('AI 服务未配置');
  }

  // 重置生成的文件
  resetGeneratedFiles();

  const languageInstruction = language === 'en'
    ? 'Please generate the Skill content in English.'
    : '请使用中文生成 Skill 内容。';

  // 构建允许的文件类型列表
  const allowedTypes = [];
  if (fileOptions.scripts) allowedTypes.push('scripts（脚本文件）');
  if (fileOptions.references) allowedTypes.push('references（参考文档）');
  if (fileOptions.assets) allowedTypes.push('assets（静态资源）');

  const forbiddenTypes = [];
  if (!fileOptions.scripts) forbiddenTypes.push('scripts（脚本文件）');
  if (!fileOptions.references) forbiddenTypes.push('references（参考文档）');
  if (!fileOptions.assets) forbiddenTypes.push('assets（静态资源）');

  const toolAvailabilitySection = allowedTypes.length > 0
    ? `## 可用工具

\`generate_file\` - 生成辅助文件（可以多次调用）
- 参数 type: 文件类型，可选值：${allowedTypes.map(t => t.split('（')[0]).join('、')}
- 参数 filename: 文件名
- 参数 content: 文件内容（单个文件不超过 5000 字符）

当前允许生成的文件类型：${allowedTypes.join('、')}`
    : '## 可用工具\n\n无，当前未启用任何辅助文件生成功能。';

  const forbiddenSection = forbiddenTypes.length > 0
    ? `\n## 禁止生成的内容\n\n请勿生成以下类型的文件：${forbiddenTypes.join('、')}。这些文件类型已被用户禁用。\n`
    : '';

  const systemPrompt = `你是一个 Skill 创建助手。

${languageInstruction}
${forbiddenSection}
## 输出格式

当你完成所有调研并准备好创建技能时，输出 JSON 格式：
{
  "name": "skill-name",
  "description": "Skill 功能描述（简短说明这个 Skill 的用途和触发时机）",
  "skill_content": "Markdown 格式的正文内容（不要包含 YAML frontmatter，直接写正文）"
}

注意：
1. skill_content 只需要写 Markdown 正文，不需要包含 name、description 等 frontmatter
2. 辅助文件通过 \`generate_file\` 工具生成，不要包含在最终 JSON 中
3. JSON 字符串中的引号需要转义为 \\"
4. **name 字段只能包含字母、数字和连字符(-)，不能包含空格、下划线、中文或其他特殊字符**`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  console.log('[AI] File options:', JSON.stringify(fileOptions));
  console.log('[AI] Allowed types:', allowedTypes.map(t => t.split('（')[0]).join(', '));
  console.log('[AI] Forbidden types:', forbiddenTypes.map(t => t.split('（')[0]).join(', '));

  // 自动注入模拟的工具调用结果
  const skillMdBody = readSkillCreatorBody();
  const schemasContent = readSchemasContent();

  if (skillMdBody || schemasContent) {
    const fakeToolCalls = [];
    const fakeToolResults = [];

    if (skillMdBody) {
      const callId1 = 'call_preloaded_skill_creator';
      fakeToolCalls.push({
        id: callId1,
        type: 'function',
        function: {
          name: 'read_file',
          arguments: JSON.stringify({ path: 'SKILL.md' })
        }
      });
      fakeToolResults.push({
        role: 'tool',
        tool_call_id: callId1,
        content: JSON.stringify({ success: true, path: 'SKILL.md', content: skillMdBody, length: skillMdBody.length })
      });
    }

    if (schemasContent) {
      const callId2 = 'call_preloaded_schemas';
      fakeToolCalls.push({
        id: callId2,
        type: 'function',
        function: {
          name: 'read_file',
          arguments: JSON.stringify({ path: 'references/schemas.md' })
        }
      });
      fakeToolResults.push({
        role: 'tool',
        tool_call_id: callId2,
        content: JSON.stringify({ success: true, path: 'references/schemas.md', content: schemasContent, length: schemasContent.length })
      });
    }

    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: fakeToolCalls
    });

    messages.push(...fakeToolResults);

    console.log(`[AI] Preloaded ${fakeToolCalls.length} resources as simulated tool calls`);
  }

  // 构建动态工具
  const tools = buildTools(fileOptions);

  let iteration = 0;
  let lastContent = '';
  let lastReasoning = '';

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;
    console.log(`[AI] Iteration ${iteration}`);

    try {
      // 使用流式调用
      const result = await streamAI(baseUrl, apiKey, model, messages, tools, onChunk, onReasoning);

      lastContent = result.content;
      lastReasoning = result.reasoning;

      console.log(`[AI] Response content length: ${lastContent.length}`);
      if (lastReasoning) {
        console.log(`[AI] Reasoning content length: ${lastReasoning.length}`);
      }

      // 检查是否有工具调用
      if (result.toolCalls && result.toolCalls.length > 0) {
        console.log(`[AI] Tool calls count: ${result.toolCalls.length}`);

        // 添加助手消息到历史
        messages.push({
          role: 'assistant',
          content: lastContent || '',
          tool_calls: result.toolCalls
        });

        // 处理每个工具调用
        for (const toolCall of result.toolCalls) {
          const toolName = toolCall.function.name;
          let args = {};

          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            console.error(`[AI] Failed to parse tool arguments: ${e.message}`);
          }

          console.log(`[AI] Tool call: ${toolName}`, JSON.stringify(args));

          const toolResult = await executeToolCall(toolName, args);

          // 如果是文件生成工具且成功，触发回调
          if (toolName === 'generate_file' && toolResult.success) {
            emitFileGenerated({
              type: toolResult.type,
              filename: toolResult.filename,
              size: toolResult.size,
              totalFiles: toolResult.totalFiles
            });
          }

          console.log(`[AI] Tool result: ${toolResult.success ? 'success' : 'failed'}`);

          // 添加工具结果到历史
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        }

        // 继续下一轮对话
        continue;
      }

      // 没有工具调用，尝试解析最终结果
      const parseResult = parseGeneratedSkill(lastContent);
      const generatedFiles = getGeneratedFiles();

      const finalResult = {
        ...parseResult,
        iterations: iteration,
        toolCallsMade: iteration - 1,
        scripts: generatedFiles.scripts,
        references: generatedFiles.references,
        assets: generatedFiles.assets,
        reasoning: lastReasoning
      };

      if (parseResult.success) {
        finalResult.skill = {
          ...parseResult.skill,
          scripts: generatedFiles.scripts,
          references: generatedFiles.references,
          assets: generatedFiles.assets
        };
      }

      return finalResult;

    } catch (err) {
      console.error(`[AI] Error in iteration ${iteration}: ${err.message}`);

      // 如果是第一次迭代就失败，尝试重试
      if (iteration === 1) {
        console.log('[AI] Retrying without tools...');
        try {
          const data = await callAI(baseUrl, apiKey, model, messages, []);
          const content = data.choices?.[0]?.message?.content || '';
          const reasoning = data.choices?.[0]?.message?.reasoning_content || '';
          const parseResult = parseGeneratedSkill(content);
          return { ...parseResult, iterations: 1, toolCallsMade: 0, fallback: true, reasoning };
        } catch (retryErr) {
          throw retryErr;
        }
      }

      throw err;
    }
  }

  // 达到最大迭代次数，返回最后的内容
  console.log(`[AI] Max iterations reached: ${MAX_TOOL_ITERATIONS}`);
  const parseResult = parseGeneratedSkill(lastContent);
  const generatedFiles = getGeneratedFiles();

  return {
    ...parseResult,
    iterations: iteration,
    maxIterationsReached: true,
    scripts: generatedFiles.scripts,
    references: generatedFiles.references,
    assets: generatedFiles.assets,
    reasoning: lastReasoning
  };
}

module.exports = {
  parseGeneratedSkill,
  generateSkill,
  setFileGeneratedCallback,
};
