import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // === 添加下面这一段 ===
  server: {
    host: '0.0.0.0', // 允许局域网访问
    port: 5173,      // 端口号 (默认5173，也可以改)
  },
  base: '/sgcc/', // 设置基础路径为 /sgcc/
  // ====================
})