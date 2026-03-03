import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { title: 'kitcaf' }
  },
  {
    path: '', // Pathless parent route to group views under MainLayout
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '/blog',
        name: 'Blog',
        component: () => import('@/views/Blog.vue'),
        meta: { title: 'Blog - kitcaf' }
      },
      {
        path: '/blog/:id',
        name: 'BlogDetail',
        component: () => import('@/views/BlogDetail.vue'),
        meta: { title: 'Post - kitcaf' }
      },
      {
        path: '/project',
        name: 'Project',
        component: () => import('@/views/Project.vue'),
        meta: { title: 'Projects - kitcaf' }
      },
      {
        path: '/me',
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
router.beforeResolve((to, from, next) => {
  // 如果浏览器不支持Transitions API直接跳过
  if (!document.startViewTransition) {
    next()
    return
  }

  // 关闭从 BlogDetail 返回 Blog 时的 View Transition
  if (from.name === 'BlogDetail' && to.name === 'Blog') {
    next()
    return
  }

  // View Transitions
  document.startViewTransition(() => {
    next()
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
