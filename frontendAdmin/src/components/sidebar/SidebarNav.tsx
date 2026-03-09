/**
 * @file SidebarNav.tsx
 * @description 侧边栏主导航项
 */

import { Search, Home, Settings, Trash } from 'lucide-react';

export function SidebarNav() {
  return (
    <nav className="space-y-0.5">
      <NavItem icon={<Search size={16} />} label="搜索" />
      <NavItem icon={<Home size={16} />} label="主页" active />
    </nav>
  );
}

export function SidebarBottomNav() {
  return (
    <div className="mt-auto pt-4 space-y-0.5">
      <NavItem icon={<Settings size={16} />} label="设置" />
      <NavItem icon={<Trash size={16} />} label="回收站" />
    </div>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function NavItem({ icon, label, active = false, onClick }: NavItemProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm font-medium transition-colors
        ${active ? 'bg-app-hover text-app-fg-deeper' : 'text-app-fg hover:bg-app-hover hover:text-app-fg-deeper'}`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
