import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'node:fs'
import type { ViteSSGOptions } from 'vite-ssg'

const postsPath = path.resolve(__dirname, '../data/posts.json')

const normalizeBasePath = (rawBasePath?: string): string => {
  const basePath = rawBasePath?.trim()

  if (!basePath) {
    return '/'
  }

  if (/^https?:\/\//.test(basePath)) {
    return basePath.endsWith('/') ? basePath : `${basePath}/`
  }

  const basePathWithLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`
  return basePathWithLeadingSlash.endsWith('/') ? basePathWithLeadingSlash : `${basePathWithLeadingSlash}/`
}

const getArticleRoutePaths = (): string[] => {
  const posts = JSON.parse(readFileSync(postsPath, 'utf8')) as Array<{ slug?: unknown }>

  return posts
    .map((post) => post.slug)
    .filter((slug): slug is string => typeof slug === 'string' && slug.trim() !== '')
    .map((slug) => `/blog/${slug}`)
}

const ssgOptions: ViteSSGOptions = {
  script: 'async',
  dirStyle: 'nested',
  includedRoutes(paths) {
    const staticRoutes = paths
      .map((routePath) => routePath || '/')
      .filter((routePath) => !routePath.includes(':') && !routePath.includes('*'))

    // 原始路由 + getArticleRoutePaths（真实数据构建的路由）
    return Array.from(new Set([...staticRoutes, ...getArticleRoutePaths()]))
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')

  return {
    base: normalizeBasePath(env.SITE_BASE_PATH),
    plugins: [
      vue(),
      tailwindcss()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@data': path.resolve(__dirname, '../data')
      }
    },
    ssgOptions
  }
})
