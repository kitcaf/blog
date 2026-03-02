# 前端技术栈详细文档

## 技术栈概览

```
Vue 3 (Composition API)
    ↓
TypeScript
    ↓
Vite (构建工具)
    ↓
Tailwind CSS (样式)
    ↓
Vue Router (路由)
    ↓
Pinia (状态管理)
```

## 核心技术栈

### 1. Vue 3 (v3.5+)

#### 选择理由
- **Composition API**：更好的逻辑复用和代码组织
- **性能优化**：更小的包体积，更快的渲染速度
- **TypeScript 支持**：一流的类型推导
- **生态成熟**：丰富的第三方库和工具

#### 使用方式
```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// 响应式数据
const count = ref(0)

// 计算属性
const doubleCount = computed(() => count.value * 2)

// 生命周期
onMounted(() => {
  console.log('组件已挂载')
})
</script>

<template>
  <div>{{ count }}</div>
</template>
```

#### 核心特性使用

**响应式系统**：
- `ref()`: 基本类型响应式
- `reactive()`: 对象响应式
- `computed()`: 计算属性
- `watch()` / `watchEffect()`: 侦听器

**组合式函数 (Composables)**：
```typescript
// useSearch.ts
export function useSearch() {
  const query = ref('')
  const results = ref([])
  
  const search = async () => {
    results.value = await api.search(query.value)
  }
  
  return { query, results, search }
}
```

**组件通信**：
- Props / Emit
- Provide / Inject
- Pinia Store

### 2. TypeScript (v5.9+)

#### 配置文件

**tsconfig.json**：
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "strict": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

#### 类型定义

**类型文件结构**：
```
src/types/
├── article.ts      # 文章相关类型
├── project.ts      # 项目相关类型
├── api.ts          # API 响应类型
└── index.ts        # 统一导出
```

**示例类型定义**：
```typescript
// types/article.ts
export interface Article {
  id: string
  title: string
  content: string
  summary: string
  tags: string[]
  category: string
  createdAt: string
  updatedAt: string
  published: boolean
}

export interface ArticleListParams {
  page: number
  pageSize: number
  tag?: string
  category?: string
}

export interface ArticleListResponse {
  articles: Article[]
  total: number
  page: number
  pageSize: number
}
```

### 3. Vite (v7.3+)

#### 配置文件

**vite.config.ts**：
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },
  
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'markdown': ['markdown-it', 'highlight.js']
        }
      }
    }
  }
})
```

#### 环境变量

**.env.development**：
```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_APP_TITLE=我的博客
```

**.env.production**：
```env
VITE_API_BASE_URL=https://api.example.com/api
VITE_APP_TITLE=我的博客
```

**使用方式**：
```typescript
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
```

### 4. Tailwind CSS (v3.4+)

#### 安装和配置

**安装依赖**：
```bash
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**tailwind.config.js**：
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          900: '#0c4a6e',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 
               'Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'Consolas', 'monospace']
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
  ],
}
```

**postcss.config.js**：
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**main.css**：
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100;
  }
}

@layer components {
  .btn {
    @apply px-4 py-2 rounded-lg font-medium transition-all duration-300;
  }
  
  .btn-primary {
    @apply bg-primary-500 text-white hover:bg-primary-600 active:scale-95;
  }
  
  .card {
    @apply bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md 
           hover:shadow-lg transition-all duration-300 hover:-translate-y-1;
  }
}
```

#### Tailwind 插件

**@tailwindcss/typography**：
- 用于 Markdown 内容样式
- 提供 `prose` 类

**@tailwindcss/forms**：
- 美化表单元素
- 统一跨浏览器样式

### 5. Vue Router (v4.4+)

#### 安装
```bash
pnpm add vue-router@4
```

#### 路由配置

**router/index.ts**：
```typescript
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/blog',
    name: 'Blog',
    component: () => import('@/views/Blog.vue'),
    meta: { title: '博客' }
  },
  {
    path: '/blog/:id',
    name: 'BlogDetail',
    component: () => import('@/views/BlogDetail.vue'),
    meta: { title: '文章详情' }
  },
  {
    path: '/project',
    name: 'Project',
    component: () => import('@/views/Project.vue'),
    meta: { title: '项目' }
  },
  {
    path: '/me',
    name: 'Me',
    component: () => import('@/views/Me.vue'),
    meta: { title: '关于我' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '404' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

// 路由守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  document.title = `${to.meta.title} - 我的博客`
  next()
})

export default router
```

#### 路由使用

**编程式导航**：
```typescript
import { useRouter } from 'vue-router'

const router = useRouter()

// 跳转
router.push('/blog')
router.push({ name: 'BlogDetail', params: { id: '123' } })

// 返回
router.back()
```

**声明式导航**：
```vue
<template>
  <router-link to="/blog" class="nav-link">博客</router-link>
  <router-link :to="{ name: 'BlogDetail', params: { id: article.id } }">
    {{ article.title }}
  </router-link>
</template>
```

### 6. Pinia (v2.2+)

#### 安装
```bash
pnpm add pinia
```

#### Store 配置

**stores/article.ts**：
```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Article } from '@/types'
import { articleApi } from '@/api'

export const useArticleStore = defineStore('article', () => {
  // State
  const articles = ref<Article[]>([])
  const currentArticle = ref<Article | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // Getters
  const publishedArticles = computed(() => 
    articles.value.filter(a => a.published)
  )
  
  const articlesByTag = computed(() => (tag: string) =>
    articles.value.filter(a => a.tags.includes(tag))
  )
  
  // Actions
  async function fetchArticles() {
    loading.value = true
    error.value = null
    try {
      const data = await articleApi.getList()
      articles.value = data.articles
    } catch (e) {
      error.value = '获取文章列表失败'
      console.error(e)
    } finally {
      loading.value = false
    }
  }
  
  async function fetchArticleById(id: string) {
    loading.value = true
    error.value = null
    try {
      currentArticle.value = await articleApi.getById(id)
    } catch (e) {
      error.value = '获取文章详情失败'
      console.error(e)
    } finally {
      loading.value = false
    }
  }
  
  return {
    articles,
    currentArticle,
    loading,
    error,
    publishedArticles,
    articlesByTag,
    fetchArticles,
    fetchArticleById
  }
})
```

**使用 Store**：
```vue
<script setup lang="ts">
import { useArticleStore } from '@/stores/article'

const articleStore = useArticleStore()

// 调用 action
articleStore.fetchArticles()

// 访问 state
console.log(articleStore.articles)

// 访问 getter
console.log(articleStore.publishedArticles)
</script>
```

## 辅助库

### 1. Axios (HTTP 客户端)

#### 安装
```bash
pnpm add axios
```

#### 封装

**api/request.ts**：
```typescript
import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

const instance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
instance.interceptors.request.use(
  (config) => {
    // 添加 token
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
instance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data
  },
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // 未授权，跳转登录
          break
        case 404:
          // 资源不存在
          break
        case 500:
          // 服务器错误
          break
      }
    }
    return Promise.reject(error)
  }
)

export default instance
```

**api/article.ts**：
```typescript
import request from './request'
import type { Article, ArticleListParams, ArticleListResponse } from '@/types'

export const articleApi = {
  getList(params: ArticleListParams): Promise<ArticleListResponse> {
    return request.get('/articles', { params })
  },
  
  getById(id: string): Promise<Article> {
    return request.get(`/articles/${id}`)
  },
  
  search(query: string): Promise<Article[]> {
    return request.get('/articles/search', { params: { q: query } })
  }
}
```

### 2. Markdown 渲染

#### markdown-it

**安装**：
```bash
pnpm add markdown-it
pnpm add -D @types/markdown-it
```

**配置**：
```typescript
// utils/markdown.ts
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch {}
    }
    return ''
  }
})

export function renderMarkdown(content: string): string {
  return md.render(content)
}
```

**使用**：
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{ content: string }>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <div class="prose prose-lg" v-html="html"></div>
</template>
```

### 3. 代码高亮

#### highlight.js

**安装**：
```bash
pnpm add highlight.js
```

**引入样式**：
```typescript
// main.ts
import 'highlight.js/styles/github-dark.css'
```

### 4. 图标库

#### Heroicons

**安装**：
```bash
pnpm add @heroicons/vue
```

**使用**：
```vue
<script setup lang="ts">
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
</script>

<template>
  <MagnifyingGlassIcon class="w-6 h-6 text-gray-500" />
</template>
```

### 5. 日期处理

#### Day.js

**安装**：
```bash
pnpm add dayjs
```

**使用**：
```typescript
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.locale('zh-cn')
dayjs.extend(relativeTime)

// 格式化
dayjs().format('YYYY-MM-DD')

// 相对时间
dayjs().from(dayjs('2024-01-01')) // "3 个月前"
```

### 6. 动画库

#### @vueuse/motion

**安装**：
```bash
pnpm add @vueuse/motion
```

**使用**：
```vue
<template>
  <div
    v-motion
    :initial="{ opacity: 0, y: 20 }"
    :enter="{ opacity: 1, y: 0 }"
    :delay="200"
  >
    内容
  </div>
</template>
```

## 开发工具

### 1. ESLint

**安装**：
```bash
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
pnpm add -D eslint-plugin-vue
```

**.eslintrc.cjs**：
```javascript
module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended'
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    parser: '@typescript-eslint/parser',
    sourceType: 'module'
  },
  rules: {
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-explicit-any': 'warn'
  }
}
```

### 2. Prettier

**安装**：
```bash
pnpm add -D prettier eslint-config-prettier eslint-plugin-prettier
```

**.prettierrc.json**：
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "arrowParens": "always"
}
```

### 3. Husky + lint-staged

**安装**：
```bash
pnpm add -D husky lint-staged
npx husky init
```

**package.json**：
```json
{
  "lint-staged": {
    "*.{js,ts,vue}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

## 项目结构

```
frontend/
├── public/                 # 静态资源
│   └── favicon.ico
├── src/
│   ├── api/               # API 请求
│   │   ├── request.ts     # Axios 封装
│   │   ├── article.ts     # 文章 API
│   │   └── project.ts     # 项目 API
│   ├── assets/            # 资源文件
│   │   ├── images/
│   │   └── styles/
│   │       └── main.css   # 全局样式
│   ├── components/        # 公共组件
│   │   ├── common/        # 通用组件
│   │   │   ├── SearchInput.vue
│   │   │   ├── Button.vue
│   │   │   └── Card.vue
│   │   ├── layout/        # 布局组件
│   │   │   ├── Header.vue
│   │   │   ├── Footer.vue
│   │   │   └── Sidebar.vue
│   │   └── article/       # 文章相关组件
│   │       ├── ArticleCard.vue
│   │       └── ArticleList.vue
│   ├── composables/       # 组合式函数
│   │   ├── useSearch.ts
│   │   ├── useDarkMode.ts
│   │   └── useInfiniteScroll.ts
│   ├── router/            # 路由配置
│   │   └── index.ts
│   ├── stores/            # Pinia 状态管理
│   │   ├── article.ts
│   │   ├── project.ts
│   │   └── app.ts
│   ├── types/             # TypeScript 类型
│   │   ├── article.ts
│   │   ├── project.ts
│   │   ├── api.ts
│   │   └── index.ts
│   ├── utils/             # 工具函数
│   │   ├── markdown.ts
│   │   ├── format.ts
│   │   └── storage.ts
│   ├── views/             # 页面组件
│   │   ├── Home.vue
│   │   ├── Blog.vue
│   │   ├── BlogDetail.vue
│   │   ├── Project.vue
│   │   ├── Me.vue
│   │   └── NotFound.vue
│   ├── App.vue            # 根组件
│   └── main.ts            # 入口文件
├── .env.development       # 开发环境变量
├── .env.production        # 生产环境变量
├── .eslintrc.cjs          # ESLint 配置
├── .prettierrc.json       # Prettier 配置
├── index.html             # HTML 模板
├── package.json           # 依赖管理
├── postcss.config.js      # PostCSS 配置
├── tailwind.config.js     # Tailwind 配置
├── tsconfig.json          # TypeScript 配置
└── vite.config.ts         # Vite 配置
```

## 依赖清单

### 生产依赖
```json
{
  "dependencies": {
    "vue": "^3.5.25",
    "vue-router": "^4.4.0",
    "pinia": "^2.2.0",
    "axios": "^1.7.0",
    "markdown-it": "^14.1.0",
    "highlight.js": "^11.10.0",
    "@heroicons/vue": "^2.1.0",
    "dayjs": "^1.11.0",
    "@vueuse/core": "^11.0.0",
    "@vueuse/motion": "^2.2.0"
  }
}
```

### 开发依赖
```json
{
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.2",
    "vite": "^7.3.1",
    "typescript": "~5.9.3",
    "vue-tsc": "^3.1.5",
    "@types/node": "^24.10.1",
    "@types/markdown-it": "^14.1.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@tailwindcss/typography": "^0.5.0",
    "@tailwindcss/forms": "^0.5.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "eslint-plugin-vue": "^9.0.0",
    "prettier": "^3.3.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-prettier": "^5.2.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0"
  }
}
```

## 开发流程

### 1. 初始化项目
```bash
cd frontend
pnpm install
```

### 2. 安装额外依赖
```bash
# 路由和状态管理
pnpm add vue-router pinia

# HTTP 客户端
pnpm add axios

# Markdown 和代码高亮
pnpm add markdown-it highlight.js
pnpm add -D @types/markdown-it

# Tailwind CSS
pnpm add -D tailwindcss postcss autoprefixer
pnpm add -D @tailwindcss/typography @tailwindcss/forms
npx tailwindcss init -p

# 图标和工具
pnpm add @heroicons/vue dayjs
pnpm add @vueuse/core @vueuse/motion

# 开发工具
pnpm add -D eslint prettier husky lint-staged
pnpm add -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
pnpm add -D eslint-plugin-vue eslint-config-prettier eslint-plugin-prettier
```

### 3. 启动开发服务器
```bash
pnpm dev
```

### 4. 构建生产版本
```bash
pnpm build
```

### 5. 预览生产构建
```bash
pnpm preview
```

## 性能优化策略

### 1. 代码分割
- 路由懒加载
- 组件异步加载
- 第三方库分离

### 2. 资源优化
- 图片懒加载
- 图片格式优化（WebP）
- 字体子集化

### 3. 缓存策略
- HTTP 缓存
- Service Worker
- LocalStorage / SessionStorage

### 4. 渲染优化
- 虚拟滚动（长列表）
- 防抖和节流
- 使用 `v-memo` 和 `v-once`

## 测试策略

### 单元测试
- **Vitest**：快速的单元测试框架
- **@vue/test-utils**：Vue 组件测试工具

### E2E 测试
- **Playwright**：端到端测试
- **Cypress**：交互式测试

## 部署方案

### 静态托管
- **Vercel**：零配置部署
- **Netlify**：持续部署
- **GitHub Pages**：免费托管

### 自托管
- **Nginx**：静态文件服务器
- **Docker**：容器化部署

## 下一步行动

1. ✅ 安装所有依赖
2. ✅ 配置 Tailwind CSS
3. ✅ 设置路由和状态管理
4. ✅ 创建基础组件
5. ✅ 实现主页搜索框
6. ✅ 开发博客列表和详情页
7. ✅ 集成 Markdown 渲染
8. ✅ 添加响应式设计
9. ✅ 性能优化
10. ✅ 部署上线
