import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

declare const process: {
  env: Record<string, string | undefined>
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        // 主控制台
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // Agent 进化与实战区域（游戏世界，独立入口，经 iframe 嵌入或直开 /game/）
        game: fileURLToPath(new URL('./game/index.html', import.meta.url)),
        // 浏览器插件 MCP 工具联调静态页（系统全能设置入口直开 /extension-test/）
        extensionTest: fileURLToPath(new URL('./extension-test/index.html', import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    // Scope dependency scanning to the console entry. Without this Vite also
    // crawls game/index.html and prebundles `phaser` (a ~1MB game engine) on
    // every console startup — pure cost when you're only opening the chat UI.
    // Phaser is still optimized on-demand the first time /game/ is opened.
    entries: ['index.html'],
    // Pin the always-needed deps so the prebundle is deterministic and a stray
    // late-discovered import doesn't trigger a full re-optimize + page reload.
    include: ['vue', 'socket.io-client'],
  },
  server: {
    host: '0.0.0.0',
    port: 58150,
    // Pre-transform the console entry + chat view on boot so the first time a
    // conversation record is opened it isn't paying Vite's on-demand compile
    // cost for the whole chat module graph (the main cause of the ~5s first load).
    warmup: {
      clientFiles: [
        './src/main.ts',
        './src/App.vue',
        './src/components/chat/*.vue',
        './src/composables/useMessage.ts',
      ],
    },
    proxy: {
      '/api': {
        target: process.env.SERVER_URL || 'http://localhost:3000',
        // Keep the browser-facing Host. Auth responses use it to tell desktop
        // and extension agents where their public Socket.IO endpoint lives.
        changeOrigin: false,
        xfwd: true,
      },
      '/socket.io': {
        target: process.env.SERVER_URL || 'http://localhost:3000',
        ws: true,
        changeOrigin: false,
        xfwd: true,
      },
      '/avatars': {
        target: process.env.SERVER_URL || 'http://localhost:3000',
        changeOrigin: true
      },
      '/tmp-images': {
        target: process.env.SERVER_URL || 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
