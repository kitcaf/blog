import { ViteSSG } from 'vite-ssg'
import './style.css'
import App from './App.vue'
import { configureRouter, routes } from './router'

const HEADING_SCROLL_OFFSET_TOP = 96

export const createApp = ViteSSG(
  App,
  {
    base: import.meta.env.BASE_URL,
    routes,
    scrollBehavior(to, _from, savedPosition) {
      if (savedPosition) {
        return savedPosition
      }

      if (to.hash) {
        return {
          el: to.hash,
          top: HEADING_SCROLL_OFFSET_TOP,
          behavior: 'smooth'
        }
      }

      return { top: 0 }
    }
  },
  ({ router }) => {
    configureRouter(router)
  },
  {
    hydration: true
  }
)
