# 多阶段构建
# 阶段1: 构建前端
FROM --platform=linux/amd64 node:22-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 阶段2: 安装后端依赖
FROM --platform=linux/amd64 node:22-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

# 阶段3: 生产镜像
FROM --platform=linux/amd64 node:22-alpine AS production

# 安装 Nginx
RUN apk add --no-cache nginx

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# 复制后端依赖
COPY --from=backend-builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# 复制后端代码
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs server ./server

# 复制前端构建产物到 Nginx 目录
COPY --from=frontend-builder --chown=nodejs:nodejs /app/client/dist /usr/share/nginx/html

# 复制 Docker 配置文件
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# 创建必要的目录
RUN mkdir -p /app/skills /app/data /app/logs /run/nginx && \
    chown -R nodejs:nodejs /app/skills /app/data /app/logs /run/nginx

# 声明数据卷
VOLUME ["/app/skills", "/app/data", "/app/logs"]

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/api/health || exit 1

# 切换非 root 用户
USER nodejs

# 设置环境变量
ENV NODE_ENV=production

# 启动
CMD ["/usr/local/bin/start.sh"]
