# SkillHub

一个用于管理和发布 Skill 的 Web 应用，支持 AI 自动生成、多渠道发布、ZIP 导入导出等功能。

## 功能特性

- **用户认证**: JWT 登录认证，支持管理员和普通用户两种角色
- **用户管理**: 管理员可创建、编辑、删除用户，重置密码
- **Skill 管理**: 创建、编辑、删除、搜索 Skill
- **分页显示**: 支持 10/50/100 条每页的分页浏览
- **ZIP 导入导出**: 一键导入/导出完整的 Skill 包
- **自定义目录**: 支持创建最多三级自定义目录，管理任意类型文件
- **文件管理**: 支持脚本(scripts)、参考资料(references)、附件(assets)的管理
- **AI 生成**: 一句话描述自动生成 Skill 内容和辅助文件
- **多渠道发布**: 支持本地、远程服务器、GitHub、SSH/SFTP 四种发布渠道
- **Markdown 预览**: 支持 SKILL.md 文件的源码和渲染预览

## 目录结构

```
skillhub/
├── client/                 # 前端项目 (React + Vite)
├── server/                 # 后端项目 (Node.js + Express)
│   ├── routes/            # API 路由
│   ├── services/          # 业务服务
│   ├── channels/          # 发布渠道实现
│   │   ├── local.js       # 本地发布
│   │   ├── remote.js      # 远程服务器发布
│   │   ├── github.js      # GitHub 发布
│   │   └── ssh.js         # SSH/SFTP 发布
│   ├── db/                # 数据库相关
│   │   └── init.sql       # MySQL 表结构初始化
│   ├── skill-creator/     # AI 生成提示词
│   └── .env               # 环境变量配置
├── skills/                 # Skill 文件缓存目录
└── published_skills/       # 本地发布输出目录
```

## Skill 目录结构

```
skills/
└── {skill-id}/
    ├── SKILL.md           # Skill 内容（YAML frontmatter + Markdown）
    ├── metadata.json      # 元数据（id, version, category, status, timestamps）
    ├── custom_dirs.json   # 自定义目录配置（不发布）
    ├── scripts/           # 脚本目录 (.py, .sh, .js 等)
    ├── references/        # 参考资料目录 (.md, .txt, .json 等)
    ├── assets/            # 附件目录（图片、PDF 等）
    └── custom-dir/        # 自定义目录（最多三级）
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

**注意**: 技能名称（name）只能包含字母、数字和连字符(-)，不能包含空格、下划线、中文或其他特殊字符。

## 快速开始

### 环境要求

- Node.js 18+
- MySQL 5.7+
- npm 或 yarn

### 安装依赖

```bash
npm install
cd client && npm install
```

### 数据库初始化

1. 创建 MySQL 数据库
2. 执行 `server/db/init.sql` 初始化表结构

```bash
mysql -u root -p < server/db/init.sql
```

### 配置环境变量

在 `server/.env` 文件中配置：

```env
# MySQL 配置
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=skill_hub

# 文件上传限制（单位：MB）
MAX_FILE_SIZE=2      # 单个文件最大 2MB
MAX_ZIP_SIZE=10      # ZIP 包最大 10MB

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
node server/index.js

# 启动前端开发服务器 (端口 3000)
cd client && npm run dev

# 构建前端生产版本
cd client && npm run build
```

访问 http://localhost:3000 使用应用。

## 用户认证

### 默认管理员账户

系统首次启动时会自动创建默认管理员账户：
- 用户名: `admin`
- 密码: `abc123`
- 角色: 管理员

**重要**: 首次登录后请立即修改默认密码！

### 用户角色

| 角色 | 权限说明 |
|------|----------|
| admin | 拥有全部权限，可管理用户、渠道、技能 |
| user | 可登录并使用基础功能，管理技能 |

### 密码规则

- 默认密码: `abc123`
- 最小长度: 3 位
- 管理员可重置任意用户密码
- 用户可在个人设置中修改自己的密码

## 发布渠道

### 1. 本地发布 (local)

将 Skill 发布到本地目录，适合备份和离线使用。

```json
{
  "outputDir": "./published_skills"
}
```

发布后的目录名为 `{技能名}@{版本号}`，包含所有文件。

### 2. 远程服务器 (remote)

将 Skill 打包为 ZIP 并发送到远程服务器。

```json
{
  "url": "https://example.com/api/skills/publish",
  "unpublishUrl": "https://example.com/api/skills/unpublish",
  "healthCheckUrl": "https://example.com/api/health",
  "headers": {},
  "timeout": 60000
}
```

ZIP 包名为 `{技能名}@{版本号}.zip`。

### 3. GitHub 发布

将 Skill 发布到指定的 GitHub 仓库和分支。

```json
{
  "owner": "your-username",
  "repo": "your-repo",
  "branch": "main",
  "token": "ghp_xxxx",
  "basePath": "skills"
}
```

**配置说明**:
- `owner`: GitHub 用户名或组织名
- `repo`: 仓库名称
- `branch`: 分支名称（默认 main）
- `token`: GitHub Personal Access Token（需要 repo 权限）
- `basePath`: 仓库中的目标路径
- `repoUrl`: 支持直接填写完整 URL，自动解析 owner/repo

发布后的目录名为 `{技能名}@{版本号}`。

### 4. SSH/SFTP 发布

通过 SSH/SFTP 将 Skill 发布到远程服务器。

```json
{
  "host": "192.168.1.100",
  "port": 22,
  "username": "user",
  "password": "your-password",
  "privateKey": "",
  "passphrase": "",
  "basePath": "/home/user/skills"
}
```

**配置说明**:
- `host`: SSH 服务器地址（IP 或域名）
- `port`: SSH 端口（默认 22）
- `username`: SSH 登录用户名
- `password`: SSH 密码（与 privateKey 二选一）
- `privateKey`: 私钥内容或私钥文件路径
- `passphrase`: 私钥密码短语（如有）
- `basePath`: 服务器上存放技能的目录路径

发布后的目录名为 `{技能名}@{版本号}`。

## ZIP 导入

支持导入符合以下格式的 ZIP 文件：

1. ZIP 中必须包含 `SKILL.md` 文件
2. `SKILL.md` 必须有 YAML 头，包含 `name` 和 `description` 字段
3. 自动识别并注册自定义目录（非 scripts/references/assets 的目录）
4. 自动排除 `metadata.json` 和 `custom_dirs.json`

**文件大小限制**:
- 单个文件最大 2MB（可通过 `MAX_FILE_SIZE` 环境变量配置）
- ZIP 包最大 10MB（可通过 `MAX_ZIP_SIZE` 环境变量配置）
- ZIP 文件扩展名必须为 `.zip`

## 自定义目录

- 支持创建最多三级子目录
- 目录名只能包含字母、数字、下划线、中划线
- 支持上传任意类型文件（单文件最大 2MB）
- 文本文件（.txt, .md, .json, .py, .js 等）支持在线编辑
- 二进制文件（图片、PDF 等）仅支持下载

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录获取 JWT Token |
| GET | `/api/auth/me` | 获取当前登录用户信息 |
| PUT | `/api/auth/password` | 修改当前用户密码 |

### 用户管理（需要管理员权限）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 获取用户列表 |
| POST | `/api/users` | 创建新用户 |
| PUT | `/api/users/:id` | 更新用户信息 |
| DELETE | `/api/users/:id` | 删除用户 |
| PUT | `/api/users/:id/reset-password` | 重置用户密码 |

### Skills

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 获取 Skill 列表（支持分页、搜索、状态筛选） |
| GET | `/api/skills/:id` | 获取单个 Skill |
| POST | `/api/skills` | 创建 Skill |
| PUT | `/api/skills/:id` | 更新 Skill |
| DELETE | `/api/skills/:id` | 删除 Skill |
| GET | `/api/skills/:id/raw` | 获取原始 SKILL.md 内容 |
| GET | `/api/skills/:id/download` | 下载 Skill ZIP 包 |
| POST | `/api/skills/import-zip` | 导入 ZIP 创建 Skill |

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
| POST | `/api/skills/:id/assets` | 上传附件（最大 2MB） |
| DELETE | `/api/skills/:id/assets/:filename` | 删除附件 |

### 自定义目录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills/:id/custom-dirs` | 获取自定义目录列表 |
| POST | `/api/skills/:id/custom-dirs` | 创建自定义目录 |
| PUT | `/api/skills/:id/custom-dirs/:dirId` | 重命名目录 |
| DELETE | `/api/skills/:id/custom-dirs/:dirId` | 删除目录 |
| GET | `/api/skills/:id/custom-dirs/:dirPath/files` | 获取目录文件列表 |
| GET | `/api/skills/:id/custom-files/:filePath` | 获取/下载文件 |
| PUT | `/api/skills/:id/custom-files/:filePath` | 保存文件 |
| DELETE | `/api/skills/:id/custom-files/:filePath` | 删除文件 |
| POST | `/api/skills/:id/custom-dirs/:dirPath/upload` | 上传文件到目录 |

### 发布管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/skills/:id/publish` | 发布 Skill 到指定渠道 |
| POST | `/api/skills/:id/unpublish` | 下架 Skill |
| GET | `/api/skills/:id/records` | 获取发布记录 |

### 渠道管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/channels` | 获取渠道列表 |
| POST | `/api/channels` | 创建渠道 |
| PUT | `/api/channels/:id` | 更新渠道 |
| DELETE | `/api/channels/:id` | 删除渠道 |
| POST | `/api/channels/:id/test` | 测试渠道连接 |

### AI 生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate` | AI 生成 Skill（SSE 流式返回） |

## 支持的文件格式

### 可编辑的文本文件
`.txt`, `.md`, `.markdown`, `.rst`, `.adoc`, `.py`, `.js`, `.ts`, `.jsx`, `.tsx`, `.sh`, `.bash`, `.zsh`, `.ps1`, `.bat`, `.cmd`, `.rb`, `.pl`, `.lua`, `.php`, `.java`, `.c`, `.cpp`, `.h`, `.hpp`, `.cs`, `.go`, `.rs`, `.swift`, `.kt`, `.scala`, `.r`, `.sql`, `.vue`, `.svelte`, `.json`, `.yaml`, `.yml`, `.xml`, `.toml`, `.ini`, `.env`, `.cfg`, `.conf`, `.properties`, `.gitignore`, `.dockerignore`, `.editorconfig`, `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`, `.styl`, `.log`, `.csv`, `.tsv`

### 二进制文件
图片、PDF、压缩包等支持上传和下载，不支持在线编辑。

## 技术栈

- **前端**: React, React Router, Vite, Axios
- **后端**: Node.js, Express, Multer, node-fetch, bcrypt, jsonwebtoken
- **数据库**: MySQL
- **认证**: JWT (JSON Web Token)
- **存储**: MySQL（元数据） + 本地文件系统（二进制文件）
- **AI**: OpenAI 兼容 API

## 数据库表结构

| 表名 | 说明 |
|------|------|
| t_sh_users | 用户信息（用户名、密码哈希、角色等） |
| t_sh_skills | 技能元数据（名称、描述、版本、状态等） |
| t_sh_channels | 发布渠道配置 |
| t_sh_publish_records | 发布记录 |
| t_sh_custom_dirs | 自定义目录配置 |
| t_sh_skill_files | 文件追踪表 |

## License

MIT
