import { 
  Search, 
  Home, 
  Users, 
  Sparkles, 
  Inbox, 
  Library, 
  Settings, 
  ShoppingBag, 
  Trash,
  Plus,
  UserPlus
} from "lucide-react"

export function Sidebar() {
  return (
    <aside className="w-[240px] h-full bg-app-bg border-r border-border flex flex-col justify-between shrink-0 transition-all duration-300">
      <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden p-2">
        {/* Workspace Switcher */}
        <div className="flex items-center gap-2 p-2 hover:bg-app-hover rounded-md cursor-pointer mb-2">
          <div className="w-5 h-5 bg-app-hover rounded flex items-center justify-center text-xs font-medium text-app-fg-deeper">
            A
          </div>
          <span className="text-sm font-medium truncate text-app-fg-deep">Anh Phuc Pham's Workspace</span>
        </div>

        {/* Primary nav */}
        <nav className="space-y-0.5">
          <SidebarItem icon={<Search size={16} />} label="Search" />
          <SidebarItem icon={<Home size={16} />} label="Home" active />
          <SidebarItem icon={<Users size={16} />} label="Meetings" />
          <SidebarItem icon={<Sparkles size={16} />} label="Notion AI" />
          <SidebarItem icon={<Inbox size={16} />} label="Inbox" />
          <SidebarItem icon={<Library size={16} />} label="Library" />
        </nav>

        <div className="mt-6 mb-2 px-2 text-xs font-medium text-app-fg-light">Recents</div>
        
        <div className="mt-6 mb-2 px-2 text-xs font-medium text-app-fg-light flex justify-between items-center group cursor-pointer">
          <span className="group-hover:text-app-fg-deep">Private</span>
          <Plus size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="mt-4 mb-2 px-2 text-xs font-medium text-app-fg-light">Shared</div>

        <div className="mt-4 mb-2 px-2 text-xs font-medium text-app-fg-light">Notion apps</div>

        {/* Secondary nav */}
        <div className="mt-auto pt-4 space-y-0.5">
          <SidebarItem icon={<Settings size={16} />} label="Settings" />
          <SidebarItem icon={<ShoppingBag size={16} />} label="Marketplace" />
          <SidebarItem icon={<Trash size={16} />} label="Trash" />
        </div>
      </div>

      {/* Invite */}
      <div className="p-2 border-t border-border">
        <div className="flex items-center gap-2 p-2 hover:bg-app-hover rounded-md cursor-pointer">
          <UserPlus size={16} className="text-app-fg-light" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-app-fg-deep">Invite members</span>
            <span className="text-xs text-app-fg-light">Collaborate with your team.</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

function SidebarItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm font-medium transition-colors
      ${active ? 'bg-app-hover text-app-fg-deeper' : 'text-app-fg hover:bg-app-hover hover:text-app-fg-deeper'}`}>
      {icon}
      <span>{label}</span>
    </div>
  )
}
