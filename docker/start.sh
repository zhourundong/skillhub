#!/bin/sh
set -e

# 创建 nginx 运行所需的临时目录
mkdir -p /tmp/nginx/client_body /tmp/nginx/proxy /tmp/nginx/fastcgi /tmp/nginx/uwsgi /tmp/nginx/scgi

echo "Starting Nginx..."
nginx -g "daemon off; error_log /dev/stderr warn;" &
NGINX_PID=$!

echo "Starting Node.js server..."
exec node server/index.js
