import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import type { ViteSSGOptions } from 'vite-ssg'
import { getArticleRoutePaths } from './src/data/articles'

const ssgOptions: ViteSSGOptions = {
  script: 'async',
  dirStyle: 'nested',
  includedRoutes(paths) {
    const staticRoutes = paths
      .map((routePath) => routePath || '/')
      .filter((routePath) => !routePath.includes(':') && !routePath.includes('*'))

    return Array.from(new Set([...staticRoutes, ...getArticleRoutePaths()]))
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  ssgOptions
})
