/**
 * @file SidebarNav.tsx
 * @description 侧边栏主导航项
 */

import { Search, Home, Settings, Trash } from 'lucide-react';
import { SidebarItem } from './SidebarItem';

interface SidebarNavProps {
  onSearchClick?: () => void;
}

export function SidebarNav({ onSearchClick }: SidebarNavProps) {
  return (
    <nav className="space-y-0.5">
      <SidebarItem 
        icon={<Search size={16} />} 
        label="搜索" 
        onClick={onSearchClick}
      />
      <SidebarItem icon={<Home size={16} />} label="主页" active />
    </nav>
  );
}

export function SidebarBottomNav() {
  return (
    <div className="mt-auto pt-4 space-y-0.5">
      <SidebarItem icon={<Settings size={16} />} label="设置" />
      <SidebarItem icon={<Trash size={16} />} label="回收站" />
    </div>
  );
}
