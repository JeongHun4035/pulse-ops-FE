import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
export default defineConfig({
  cacheDir: './.vite-cache',

  plugins: [react()],

  // 경로, 조건
  resolve: {
    conditions: ['browser'],
    alias: {
    '@': path.resolve(import.meta.dirname, './src'),
    '~': path.resolve(import.meta.dirname, './src'),
    },
  },

  // 개발 환경 전용: /api 경로를 그대로 백엔드에 전달합니다.
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['axios'],
  },
})
