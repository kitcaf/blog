import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { nextTick } from 'vue'

const routes: RouteRecordRaw[] = [
  {
    path: '',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { title: 'kitcaf' }
  },
  {
    path: '/', // Pathless parent route to group views under MainLayout
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: 'blog',
        name: 'Blog',
        component: () => import('@/views/Blog.vue'),
        meta: { title: 'Blog - kitcaf' }
      },
      {
        path: 'blog/:id',
        name: 'BlogDetail',
        component: () => import('@/views/BlogDetail.vue'),
        meta: { title: 'Post - kitcaf' }
      },
      {
        path: 'project',
        name: 'Project',
        component: () => import('@/views/Project.vue'),
        meta: { title: 'Projects - kitcaf' }
      },
      {
        path: 'me',
        name: 'Me',
        component: () => import('@/views/Me.vue'),
        meta: { title: 'Me - kitcaf' }
      }
    ]
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
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

// View Transitions API integration for smooth cross-route animations
router.beforeResolve((_to, _from, next) => {
  // 如果浏览器不支持Transitions API直接跳过
  if (!document.startViewTransition) {
    next()
    return
  }

  // 完全关闭 Blog ↔ BlogDetail 之间的所有过渡动画（不要淡入淡出），彻底解决频闪问题
  const isBlogToDetailFlow = 
    (_from.name === 'Blog' && _to.name === 'BlogDetail') ||
    (_from.name === 'BlogDetail' && _to.name === 'Blog')
  
  if (isBlogToDetailFlow) {
    next()
    return
  }

  // 全局应用 View Transitions，天然提供平滑的 crossfade 过渡
  document.startViewTransition(async () => {
    next()
    await nextTick() // 必须等待 Vue 将新组件渲染到 DOM，否则浏览器截取的新快照会是旧页面，导致严重频闪
  })
})

// 路由守卫 - 设置页面标题
router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = `${to.meta.title}`
  }
  next()
})

export default router
