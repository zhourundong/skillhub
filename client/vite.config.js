import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 通过环境变量 BASE_URL 设置部署路径，默认为 '/'
  // 例如：BASE_URL=/skillhub/ npm run build
  base: process.env.BASE_URL || '/',
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3030',
    },
  },
});
