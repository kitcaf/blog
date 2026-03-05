import { useDark, useToggle } from '@vueuse/core'
import { nextTick } from 'vue'

const isDark = useDark()
const toggle = useToggle(isDark)

/**
 * 带有丝滑扩散光圈缓动动效的光暗模式切换
 * 优雅地利用了原生的 View Transitions API
 */
export function useThemeToggle() {
  const toggleTheme = (event: MouseEvent) => {
    // 降级处理：不支持 View Transitions API 或者偏好减少动画的用户直接切换
    const isSupport = typeof document.startViewTransition === 'function' && 
                      !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!isSupport) {
      toggle()
      return
    }

    // 计算点击位置作为光圈扩散的中心点
    const x = event.clientX
    const y = event.clientY
    
    // 计算中心点到屏幕最远角落的距离（光圈的最大半径）
    const endRadius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    )

    // 发起视图过渡
    const transition = document.startViewTransition(async () => {
      toggle()
      await nextTick() // 等待 Vue 响应式数据驱动 DOM 更新（增加 dark class）
    })

    // DOM 准备完毕，可以开始动画
    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]
      
      // 使用 Web Animations API 实现原生扩散动效
      document.documentElement.animate(
        {
          clipPath: isDark.value ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 400,
          easing: 'ease-in-out',
          pseudoElement: isDark.value
            ? '::view-transition-old(root)'
            : '::view-transition-new(root)',
        },
      )
    })
  }

  return {
    isDark,
    toggleTheme
  }
}
