const path = require('path');
const env = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: path.join(__dirname, `.env.${env}`) });
const express = require('express');
const cors = require('cors');
const fs = require('fs');

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

// API 路由
app.use('/api/skills', require('./routes/skills'));
app.use('/api/skills', require('./routes/publish'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/ai', require('./routes/ai'));

// 生产环境下服务前端静态文件
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`SkillHub server running at http://localhost:${PORT}`);
});
