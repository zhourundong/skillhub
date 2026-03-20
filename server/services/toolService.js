const path = require('path');

// 允许生成的文件类型
const ALLOWED_FILE_TYPES = ['scripts', 'references', 'assets'];

/**
 * 定义可用工具
 */
const tools = [
  {
    type: 'function',
    function: {
      name: 'generate_file',
      description: '生成一个辅助文件（脚本、参考文档或静态资源）。每次调用生成一个文件，可以多次调用。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ALLOWED_FILE_TYPES,
            description: '文件类型：scripts（脚本）、references（参考文档）、assets（静态资源）'
          },
          filename: {
            type: 'string',
            description: '文件名，如 helper.py、guide.md、template.html'
          },
          content: {
            type: 'string',
            description: '文件内容'
          }
        },
        required: ['type', 'filename', 'content']
      }
    }
  }
];

// 临时存储生成的文件
let generatedFiles = {
  scripts: [],
  references: [],
  assets: []
};

/**
 * 重置生成的文件（每次新的生成任务开始时调用）
 */
function resetGeneratedFiles() {
  generatedFiles = {
    scripts: [],
    references: [],
    assets: []
  };
}

/**
 * 获取已生成的文件
 */
function getGeneratedFiles() {
  return generatedFiles;
}

// 单个文件最大字符数
const MAX_FILE_SIZE = 5000;

/**
 * 工具执行器
 */
const toolExecutors = {
  /**
   * 生成辅助文件
   */
  generate_file: ({ type, filename, content }) => {
    // 验证类型
    if (!ALLOWED_FILE_TYPES.includes(type)) {
      return { success: false, error: `不支持的文件类型: ${type}。支持: ${ALLOWED_FILE_TYPES.join(', ')}` };
    }

    // 验证文件名
    if (!filename || typeof filename !== 'string') {
      return { success: false, error: '文件名不能为空' };
    }

    // 安全检查：防止路径遍历
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return { success: false, error: '文件名只能包含文件名，不能包含路径' };
    }

    // 检查是否已存在同名文件
    const existingFile = generatedFiles[type].find(f => f.filename === safeFilename);
    if (existingFile) {
      console.log(`[Tool] Duplicate file: ${type}/${safeFilename} already exists`);
      return {
        success: false,
        error: `文件 ${type}/${safeFilename} 已存在，请勿重复生成。`,
        duplicate: true,
        filename: safeFilename,
        existingSize: existingFile.content?.length || 0
      };
    }

    // 验证文件大小
    const contentStr = content || '';
    if (contentStr.length > MAX_FILE_SIZE) {
      return { success: false, error: `文件内容超过限制（最大 ${MAX_FILE_SIZE} 字符，当前 ${contentStr.length} 字符）` };
    }

    // 存储文件
    generatedFiles[type].push({
      filename: safeFilename,
      content: contentStr
    });

    const count = generatedFiles[type].length;
    console.log(`[Tool] Generated file: ${type}/${safeFilename} (${contentStr.length} chars)`);

    return {
      success: true,
      message: `文件 ${type}/${safeFilename} 已生成`,
      type,
      filename: safeFilename,
      size: content?.length || 0,
      totalFiles: generatedFiles[type].length
    };
  }
};

/**
 * 执行工具调用
 */
function executeToolCall(toolName, args) {
  const executor = toolExecutors[toolName];
  if (!executor) {
    return Promise.resolve({ success: false, error: `未知工具: ${toolName}` });
  }

  try {
    console.log(`[Tool] Executing: ${toolName}`, JSON.stringify(args));
    const result = executor(args || {});

    // 处理 Promise 返回
    if (result instanceof Promise) {
      return result.then((res) => {
        console.log(`[Tool] Result: ${res.success ? 'success' : 'failed'}`);
        return res;
      }).catch((err) => {
        console.error(`[Tool] Error: ${err.message}`);
        return { success: false, error: err.message };
      });
    }

    console.log(`[Tool] Result: ${result.success ? 'success' : 'failed'}`);
    return Promise.resolve(result);
  } catch (err) {
    console.error(`[Tool] Error executing ${toolName}:`, err.message);
    return Promise.resolve({ success: false, error: err.message });
  }
}

module.exports = {
  tools,
  toolExecutors,
  executeToolCall,
  ALLOWED_FILE_TYPES,
  resetGeneratedFiles,
  getGeneratedFiles
};
