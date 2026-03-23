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

/**
 * 创建新的文件存储（每个请求独立）
 */
function createFileStore() {
  const generatedFiles = {
    scripts: [],
    references: [],
    assets: []
  };

  return {
    reset: () => {
      generatedFiles.scripts = [];
      generatedFiles.references = [];
      generatedFiles.assets = [];
    },
    get: () => ({ ...generatedFiles }),
    add: (type, filename, content) => {
      generatedFiles[type].push({ filename, content });
      return generatedFiles[type].length;
    },
    find: (type, filename) => {
      return generatedFiles[type].find(f => f.filename === filename);
    }
  };
}

// 单个文件最大字符数
const MAX_FILE_SIZE = 5000;

/**
 * 创建工具执行器（每个请求独立）
 */
function createToolExecutor(fileStore) {
  return {
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
      const existingFile = fileStore.find(type, safeFilename);
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
      const count = fileStore.add(type, safeFilename, contentStr);

      console.log(`[Tool] Generated file: ${type}/${safeFilename} (${contentStr.length} chars)`);

      return {
        success: true,
        message: `文件 ${type}/${safeFilename} 已生成`,
        type,
        filename: safeFilename,
        size: content?.length || 0,
        totalFiles: count
      };
    }
  };
}

/**
 * 执行工具调用
 */
function executeToolCall(toolExecutors, toolName, args) {
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

// ============ 向后兼容的旧 API（已废弃，仅用于过渡） ============

// 旧的共享状态（保留用于向后兼容，但不推荐使用）
let legacyGeneratedFiles = {
  scripts: [],
  references: [],
  assets: []
};

function resetGeneratedFiles() {
  console.warn('[Tool] Warning: resetGeneratedFiles() is deprecated, use createFileStore() instead');
  legacyGeneratedFiles = {
    scripts: [],
    references: [],
    assets: []
  };
}

function getGeneratedFiles() {
  console.warn('[Tool] Warning: getGeneratedFiles() is deprecated, use fileStore.get() instead');
  return legacyGeneratedFiles;
}

const legacyToolExecutors = {
  generate_file: ({ type, filename, content }) => {
    // 验证类型
    if (!ALLOWED_FILE_TYPES.includes(type)) {
      return { success: false, error: `不支持的文件类型: ${type}` };
    }
    if (!filename || typeof filename !== 'string') {
      return { success: false, error: '文件名不能为空' };
    }
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || filename.includes('..')) {
      return { success: false, error: '文件名只能包含文件名，不能包含路径' };
    }
    const existingFile = legacyGeneratedFiles[type].find(f => f.filename === safeFilename);
    if (existingFile) {
      return { success: false, error: `文件已存在`, duplicate: true };
    }
    const contentStr = content || '';
    if (contentStr.length > MAX_FILE_SIZE) {
      return { success: false, error: `文件内容超过限制` };
    }
    legacyGeneratedFiles[type].push({ filename: safeFilename, content: contentStr });
    return { success: true, message: `文件已生成`, type, filename: safeFilename, size: contentStr.length };
  }
};

function executeToolCallLegacy(toolName, args) {
  const executor = legacyToolExecutors[toolName];
  if (!executor) {
    return Promise.resolve({ success: false, error: `未知工具: ${toolName}` });
  }
  try {
    const result = executor(args || {});
    if (result instanceof Promise) {
      return result.catch(err => ({ success: false, error: err.message }));
    }
    return Promise.resolve(result);
  } catch (err) {
    return Promise.resolve({ success: false, error: err.message });
  }
}

module.exports = {
  // 新的 API（推荐使用）
  tools,
  createFileStore,
  createToolExecutor,
  executeToolCallNew: executeToolCall,
  ALLOWED_FILE_TYPES,

  // 旧的 API（向后兼容，将在未来版本移除）
  toolExecutors: legacyToolExecutors,
  resetGeneratedFiles,
  getGeneratedFiles,
  executeToolCall: executeToolCallLegacy
};
