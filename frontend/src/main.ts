import { ViteSSG } from 'vite-ssg'
import './style.css'
import App from './App.vue'
import { configureRouter, routes } from './router'

export const createApp = ViteSSG(
  App,
  {
    base: import.meta.env.BASE_URL,
    routes,
    scrollBehavior(_to, _from, savedPosition) {
      return savedPosition ?? { top: 0 }
    }
  },
  ({ router }) => {
    configureRouter(router)
  },
  {
    hydration: true
  }
)
