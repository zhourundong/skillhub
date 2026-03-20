const path = require('path');
const env = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: path.join(__dirname, `.env.${env}`) });

// 日志输出到文件
const { overrideConsole, LOG_FILE } = require('./utils/logger');
overrideConsole();
console.log(`日志文件: ${LOG_FILE}`);

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const db = require('./db');

// 确保 data 和 skills 目录存在
const dataDir = path.join(__dirname, '..', 'data');
const skillsDir = path.join(__dirname, '..', 'skills');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

const app = express();
const PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json());

// 静态资源：skills/{id}/assets/* 可通过 /assets/{id}/* 访问
app.use('/assets', express.static(skillsDir));

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/skills', require('./routes/skills'));
app.use('/api/skills', require('./routes/publish'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/ai', require('./routes/ai'));

// 错误处理中间件
app.use((err, req, res, next) => {
  // Multer 文件大小超限错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '2', 10);
    const maxZipSize = parseInt(process.env.MAX_ZIP_SIZE || '10', 10);

    // 根据路径判断是单个文件还是zip
    const isZip = req.path.includes('import-zip') || req.path.includes('upload');
    const limit = isZip ? maxZipSize : maxFileSize;

    return res.status(400).json({
      error: `文件大小超过限制，最大允许 ${limit}MB`
    });
  }

  // Multer 其他错误
  if (err.code && err.code.startsWith('LIMIT_')) {
    return res.status(400).json({ error: err.message || '文件上传错误' });
  }

  // 其他错误
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// 生产环境下服务前端静态文件
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`SkillHub server running at http://localhost:${PORT}`);
  console.log(`Database: ${process.env.MYSQL_DATABASE || 'skillhub'} @ ${process.env.MYSQL_HOST || 'localhost'}`);
});

// 优雅关闭
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
    await db.closePool();
    console.log('Database connection pool closed.');
  } catch (err) {
    console.error('Error closing database pool:', err.message);
  }

  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // 强制退出超时
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
