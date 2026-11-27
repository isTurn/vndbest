import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      treeshake: {
        // Ionic registers elements through the used Vue wrappers. Its generated
        // component modules only prepare exported classes; unused ones can go.
        moduleSideEffects: [
          { test: /[\\/]@ionic[\\/]core[\\/]components[\\/]ion-[^\\/]+\.js$/, sideEffects: false },
        ],
      },
    },
  },
  server: {
    proxy: {
      // 代理 VNDB API 请求，解决 CORS 问题（PATCH/DELETE 方法）
      '/api/vndb': {
        target: 'https://api.vndb.org/kana',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vndb/, ''),
      },
      '/api/vndb-sandbox': {
        target: 'https://beta.vndb.org/api/kana',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vndb-sandbox/, ''),
      },
    },
  },
})
