import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 纯前端应用：资料与计算全部留在浏览器，不依赖任何后端
export default defineConfig({
  plugins: [react()],
  server: { host: true },
});
