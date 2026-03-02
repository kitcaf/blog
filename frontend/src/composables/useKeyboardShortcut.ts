import { onMounted, onUnmounted } from 'vue'

export function useKeyboardShortcut(key: string, callback: () => void) {
  const handleKeydown = (e: KeyboardEvent) => {
    // 如果焦点在输入框或文本区域，不触发快捷键
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    if (e.key === key) {
      e.preventDefault()
      callback()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
