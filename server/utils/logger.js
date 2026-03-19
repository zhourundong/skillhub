const fs = require('fs');
const path = require('path');

// 日志文件路径
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 获取时间戳
function timestamp() {
  return new Date().toISOString();
}

// 格式化日志
function formatLog(level, ...args) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      return JSON.stringify(arg, null, 2);
    }
    return String(arg);
  }).join(' ');
  return `[${timestamp()}] [${level}] ${message}\n`;
}

// 写入日志文件
function writeLog(level, ...args) {
  const logLine = formatLog(level, ...args);
  fs.appendFileSync(LOG_FILE, logLine, 'utf-8');
}

// 日志对象
const logger = {
  info: (...args) => {
    console.log(...args);
    writeLog('INFO', ...args);
  },

  error: (...args) => {
    console.error(...args);
    writeLog('ERROR', ...args);
  },

  warn: (...args) => {
    console.warn(...args);
    writeLog('WARN', ...args);
  },

  debug: (...args) => {
    console.log(...args);
    writeLog('DEBUG', ...args);
  }
};

// 重写 console 方法（可选，用于捕获第三方库的日志）
function overrideConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => {
    originalLog.apply(console, args);
    writeLog('INFO', ...args);
  };

  console.error = (...args) => {
    originalError.apply(console, args);
    writeLog('ERROR', ...args);
  };

  console.warn = (...args) => {
    originalWarn.apply(console, args);
    writeLog('WARN', ...args);
  };
}

module.exports = {
  logger,
  overrideConsole,
  LOG_FILE
};
