# CLAUDE.md

本文件为 Claude Code 提供项目开发指导。

## 常用命令

```bash
node server/index.js       # 启动后端 (3030)
cd client && npm run dev   # 启动前端 (3000)
```

## 项目架构

**后端**：Express.js + MySQL。核心：`db.js`、`routes/`、`channels/`、`middleware/auth.js`

**前端**：React + Vite。页面：SkillList、SkillDetail、Channels、Users

**存储**：MySQL（表见 `server/db/init.sql`）+ `skills/` 目录

## 环境变量

`server/.env`：`PORT`、`MYSQL_*`、`JWT_SECRET`、`AI_API_KEY`、`AI_API_BASE_URL`、`AI_MODEL`

## 权限

| 资源 | 匿名 | 用户 | 管理员 |
|------|------|------|--------|
| 技能浏览 | 只读 | 自己 | 完全 |
| 技能操作 | 无 | 自己 | 完全 |
| 渠道 | 无 | 自己 | 完全 |
| local渠道 | 无 | 禁止 | 可 |
| 用户管理 | 无 | 无 | 完全 |
| AI生成 | 无 | 可 | 可 |

## 扩展渠道

继承 `BaseChannel`，实现 `publish()`、`unpublish()`、`healthCheck()`。

有我自己来启动服务，禁止启动，每次更改代码后需要提醒我是否要重启服务
