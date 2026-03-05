import { Outlet } from "react-router-dom"
import { Sidebar } from "@/components/Sidebar"

export default function Layout() {
  return (
    <div className="flex h-screen w-full bg-app-bg text-app-fg-deep overflow-hidden font-sans">
      <Sidebar />
      <div className="flex-1 h-full overflow-y-auto relative bg-app-bg">
        <Outlet />
      </div>
    </div>
  )
}
