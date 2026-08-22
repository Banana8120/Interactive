import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: true,
    port: 5173
  },
  // GitHub Pages 部署：使用相对路径 base，资源以 ./assets/... 加载，
  // 部署到任意子路径（如 https://user.github.io/repo/）都能正常工作，无需硬编码仓库名。
  // 若部署到「用户/组织页」(https://user.github.io/) 或自定义域名，可改回 base: '/'，
  // 也可改为绝对路径 base: '/<你的仓库名>/'。
  base: './'
})
