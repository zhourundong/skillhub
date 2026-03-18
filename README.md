# SkillHub

一个用于管理和发布 Skill 的 Web 应用。

## 功能特性

- **Skill 管理**: 创建、编辑、删除 Skill
- **文件管理**: 支持脚本、参考资料、附件的管理
- **AI 生成**: 一句话描述自动生成 Skill
- **发布管理**: 支持多渠道发布和下架
- **Markdown 预览**: 支持 SKILL.md 文件的源码和渲染预览

## 目录结构

```
skillhub/
├── client/                 # 前端项目 (React + Vite)
├── server/                 # 后端项目 (Node.js + Express)
│   ├── routes/            # API 路由
│   ├── services/          # 业务服务
│   ├── skill-creator/     # AI 生成提示词
│   └── .env               # 环境变量配置
├── skills/                 # Skill 存储目录
└── data/                   # 数据目录
```

## Skill 目录结构

```
skills/
└── {skill-id}/
    ├── SKILL.md          # Skill 内容（YAML frontmatter + Markdown）
    ├── metadata.json     # 元数据
    ├── scripts/          # 脚本目录 (.py, .sh, .js 等)
    ├── references/       # 参考资料目录 (.md, .txt, .json 等)
    └── assets/           # 附件目录
```

## SKILL.md 格式

```markdown
---
name: skill-name
description: Skill 描述
---

# 正文内容

Markdown 格式的 Skill 说明...
```

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 配置环境变量

在 `server/.env` 文件中配置：

```env
# AI 服务配置（用于自动生成 Skill）
AI_API_KEY=your-api-key
AI_API_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o

# 服务端口（默认 3030）
PORT=3030
```

### 启动服务

```bash
# 启动后端 (端口 3030)
cd server
npm start

# 启动前端 (端口 3000)
cd client
npm run dev
```

访问 http://localhost:3000 使用应用。

## API 接口

### Skills

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 获取 Skill 列表 |
| GET | `/api/skills/:id` | 获取单个 Skill |
| POST | `/api/skills` | 创建 Skill |
| PUT | `/api/skills/:id` | 更新 Skill |
| DELETE | `/api/skills/:id` | 删除 Skill |
| GET | `/api/skills/:id/raw` | 获取原始 SKILL.md 内容 |

### 文件管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills/:id/scripts` | 获取脚本列表 |
| PUT | `/api/skills/:id/scripts/:filename` | 保存脚本 |
| DELETE | `/api/skills/:id/scripts/:filename` | 删除脚本 |
| GET | `/api/skills/:id/references` | 获取参考资料列表 |
| PUT | `/api/skills/:id/references/:filename` | 保存参考资料 |
| DELETE | `/api/skills/:id/references/:filename` | 删除参考资料 |
| GET | `/api/skills/:id/assets` | 获取附件列表 |
| POST | `/api/skills/:id/assets` | 上传附件 |
| DELETE | `/api/skills/:id/assets/:filename` | 删除附件 |

### 发布管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/skills/:id/publish` | 发布 Skill |
| POST | `/api/skills/:id/unpublish` | 下架 Skill |
| GET | `/api/skills/:id/records` | 获取发布记录 |

### AI 生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate` | AI 生成 Skill |

## 支持的文件格式

### 脚本文件
`.py`, `.sh`, `.bash`, `.ps1`, `.bat`, `.js`, `.ts`, `.rb`, `.pl`, `.lua`

### 文档文件
`.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.xml`, `.html`, `.css`, `.sql`, `.ini`, `.env`

## 技术栈

- **前端**: React, React Router, Vite, Axios, React Markdown
- **后端**: Node.js, Express, Multer, dotenv
- **存储**: 本地文件系统

## License

MIT
