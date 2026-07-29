import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** 为 .task 模型补 Content-Type，避免空 MIME 导致模型加载失败 */
function mediapipeAssetsPlugin(): Plugin {
  return {
    name: 'mediapipe-assets-mime',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0]?.endsWith('.task')) {
          res.setHeader('Content-Type', 'application/octet-stream')
        }
        next()
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), mediapipeAssetsPlugin()],
  optimizeDeps: {
    // 避免预构建改写 MediaPipe，与原生 wasm 加载路径不一致
    exclude: ['@mediapipe/tasks-vision'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
