import { useEffect, useRef, useCallback } from "react"
import { Outlet } from "react-router-dom"
import { Sidebar } from "@/components/Sidebar"
import { useSidebarStore } from "@/store/useSidebarStore"

export default function Layout() {
  const isOpen = useSidebarStore((s) => s.isOpen)
  const setWidth = useSidebarStore((s) => s.setWidth)
  const setIsResizing = useSidebarStore((s) => s.setIsResizing)
  const isResizing = useRef(false)

  // 拖拽开始：在 document 上统一接管鼠标事件
  // 全屏 cursor 覆盖防止鼠标经过其他元素时光标闪变
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    setIsResizing(true)
    document.body.style.setProperty("cursor", "col-resize", "important")
    document.body.style.userSelect = "none"
  }, [setIsResizing])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      // e.clientX 即鼠标距左边界的距离，恰好等于向来侧边栏的目标宽度
      setWidth(Math.min(Math.max(e.clientX, 200), 480))
    }

    const handleMouseUp = () => {
      if (!isResizing.current) return
      isResizing.current = false
      setIsResizing(false)
      document.body.style.removeProperty("cursor")
      document.body.style.userSelect = ""
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [setWidth, setIsResizing])

  return (
    <div className="flex h-screen w-full bg-app-bg text-app-fg-deep overflow-hidden font-sans">
      {/* Sidebar 自身根据 useSidebarStore.width 控制宽度 */}
      <Sidebar />

      {/*
        拖拽手柄：作为 flex 兄弟节点紧贴在 Sidebar 右侧。
        宽度只有 4px，cursor 固定为 col-resize。
        里面的 1px 线纯粹是视觉提示，悬停时加深。
        拖动时，document-level 的 mousemove 接管更新宽度，
        不依赖手柄本身跟随光标，所以不存在"跟不上"问题。
      */}
      {isOpen && (
        <div
          className="relative shrink-0 z-20 group"
          style={{ width: 4, cursor: "col-resize" }}
          onMouseDown={handleResizeStart}
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border group-hover:bg-app-fg-light transition-colors duration-150" />
        </div>
      )}

      <div className="flex-1 h-full overflow-y-auto relative bg-app-bg">
        <Outlet />
      </div>
    </div>
  )
}
