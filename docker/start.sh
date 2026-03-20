#!/bin/sh
set -e

echo "Starting Nginx..."
nginx

echo "Starting Node.js server..."
exec node server/index.js
