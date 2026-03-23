#!/bin/sh
set -e

# 创建 nginx 运行所需的临时目录
mkdir -p /tmp/nginx/client_body /tmp/nginx/proxy /tmp/nginx/fastcgi /tmp/nginx/uwsgi /tmp/nginx/scgi

# 处理 BASE_URL 配置
# BASE_URL 格式如 /skillhub/ 或 /，默认为 /
BASE_URL="${BASE_URL:-/}"

# 移除末尾斜杠用于判断
BASE_PATH="${BASE_URL%/}"
# 如果为空则设为根路径
if [ -z "$BASE_PATH" ]; then
    BASE_PATH=""
fi

NGINX_CONF="/etc/nginx/http.d/default.conf"
SUBPATH_CONF="/etc/nginx/http.d/nginx-subpath.conf"

if [ -z "$BASE_PATH" ]; then
    echo "Using root path deployment (/)"
    # 根路径模式：使用默认配置（已经是根路径配置）
else
    echo "Using subpath deployment (${BASE_URL})"
    # 子路径模式：使用子路径配置并替换 BASE_PATH 占位符
    sed "s|BASE_PATH|${BASE_PATH}|g" "$SUBPATH_CONF" > "$NGINX_CONF"
fi

echo "Starting Nginx..."
nginx -g "daemon off; error_log /dev/stderr warn;" &
NGINX_PID=$!

echo "Starting Node.js server..."
exec node server/index.js
