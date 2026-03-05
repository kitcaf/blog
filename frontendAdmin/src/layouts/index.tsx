import { useEffect, useRef } from "react"
import { Outlet } from "react-router-dom"
import { Sidebar } from "@/components/Sidebar"
import { useSidebarStore } from "@/store/useSidebarStore"

export default function Layout() {
  const { isOpen, setWidth } = useSidebarStore()
  const isResizing = useRef(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = "col-resize"
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      // 设置合理的极值：最小 200px，最大 480px
      const newWidth = Math.min(Math.max(e.clientX, 200), 480)
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = "default"
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [setWidth])

  return (
    <div className="flex h-screen w-full bg-app-bg text-app-fg-deep overflow-hidden font-sans">
      <Sidebar />
      {isOpen && (
        <div
          className="w-1 cursor-col-resize hover:bg-app-hover bg-transparent shrink-0 z-10 hover:shadow-md transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}
      <div className="flex-1 h-full overflow-y-auto relative bg-app-bg">
        <Outlet />
      </div>
    </div>
  )
}

