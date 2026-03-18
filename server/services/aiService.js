const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const SKILL_MD_PATH = path.join(__dirname, '..', 'skill-creator', 'SKILL.md');

function loadSkillCreatorPrompt() {
  if (!fs.existsSync(SKILL_MD_PATH)) {
    throw new Error(
      `skill-creator 提示词文件不存在: ${SKILL_MD_PATH}，请确认 server/skill-creator/SKILL.md 文件已正确放置`
    );
  }
  return fs.readFileSync(SKILL_MD_PATH, 'utf-8');
}

const REQUIRED_FIELDS = ['name', 'description', 'version', 'category', 'skill_content'];

const DEFAULT_SKILL = {
  name: '',
  description: '',
  version: '1.0.0',
  category: '',
  skill_content: '',
};

function parseGeneratedSkill(rawOutput) {
  try {
    const safeOutput = typeof rawOutput === 'string' ? rawOutput : '';
    console.log(`[AI] Parsing response, first 500 chars: ${safeOutput.substring(0, 500)}`);

    // 1. Try to extract JSON from ```json ... ``` code blocks (non-greedy)
    let codeBlockMatch = safeOutput.match(/```json\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        console.log('[AI] Parsed from json code block');
        return fillDefaults(parsed);
      } catch (e) {
        console.log(`[AI] Failed to parse json code block: ${e.message}`);
      }
    }

    // 2. Try to find JSON object in the response (look for { ... })
    const jsonMatch = safeOutput.match(/\{[\s\S]*"name"[\s\S]*"description"[\s\S]*"skill_content"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        // Try to extract valid JSON by finding matching braces
        let jsonStr = jsonMatch[0];
        // Count braces to find the complete JSON
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
          const parsed = JSON.parse(jsonStr);
          console.log('[AI] Parsed from extracted JSON object');
          return fillDefaults(parsed);
        }
      } catch (e) {
        console.log(`[AI] Failed to parse extracted JSON: ${e.message}`);
      }
    }

    // 3. Try to parse the raw output as bare JSON
    try {
      const parsed = JSON.parse(safeOutput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        console.log('[AI] Parsed as bare JSON');
        return fillDefaults(parsed);
      }
    } catch (_) {}

    // 4. Fallback: return as skill_content
    console.log('[AI] Using raw output as skill_content');
    return { ...DEFAULT_SKILL, skill_content: safeOutput };
  } catch (e) {
    console.log(`[AI] Parse error: ${e.message}`);
    return { ...DEFAULT_SKILL };
  }
}

function fillDefaults(parsed) {
  const result = { ...DEFAULT_SKILL };
  for (const field of REQUIRED_FIELDS) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      result[field] = String(parsed[field]);
    }
  }
  return result;
}

async function generateSkill(userPrompt, onChunk, options = {}) {
  const baseUrl = process.env.AI_API_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!apiKey) {
    throw new Error('AI 服务未配置，请设置 AI_API_KEY 环境变量');
  }

  const skillCreatorContent = loadSkillCreatorPrompt();

  const systemPrompt = `你是一个 Skill 创建助手。请根据以下 Skill 创建指南来帮助用户创建高质量的 Skill。

${skillCreatorContent}

请根据用户的需求描述，生成一个完整的 Skill。输出必须是以下 JSON 格式：
{
  "name": "skill-name",
  "description": "Skill 功能描述（简短说明这个 Skill 的用途）",
  "version": "1.0.0",
  "category": "分类",
  "skill_content": "Markdown 格式的正文内容（不要包含 YAML frontmatter，直接写正文）"
}

注意：skill_content 只需要写 Markdown 正文，不需要包含 name、description 等 frontmatter，这些信息已经在 JSON 的其他字段中了。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  console.log(`[AI] Requesting: ${url}`);
  console.log(`[AI] Model: ${model}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
      timeout: 120000,
    });

    console.log(`[AI] Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || `AI API 请求失败 (HTTP ${response.status})`;
      throw new Error(message);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log(`[AI] Response content length: ${content.length}`);

    if (typeof onChunk === 'function') {
      onChunk(content);
    }

    const skill = parseGeneratedSkill(content);
    return { skill, abortController: new AbortController() };

  } catch (err) {
    console.error(`[AI] Error: ${err.message}`);
    throw err;
  }
}

module.exports = {
  loadSkillCreatorPrompt,
  parseGeneratedSkill,
  generateSkill,
};
