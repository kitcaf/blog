/**
 * @file SidebarHeader.tsx
 * @description 侧边栏顶部：工作区名称和隐藏按钮
 */

import { PanelLeftClose } from 'lucide-react';

interface SidebarHeaderProps {
  onHide: () => void;
}

export function SidebarHeader({ onHide }: SidebarHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2 p-2 hover:bg-app-hover rounded-md cursor-pointer flex-1">
        <div className="w-5 h-5 bg-app-hover rounded flex items-center justify-center text-xs font-medium text-app-fg-deeper">
          A
        </div>
        <span className="text-sm font-medium truncate text-app-fg-deep">个人工作区</span>
      </div>
      <button
        className="p-1.5 text-app-fg-light hover:text-app-fg-deeper hover:bg-app-hover rounded-md transition-colors shrink-0"
        onClick={onHide}
        title="隐藏侧边栏"
      >
        <PanelLeftClose size={16} />
      </button>
    </div>
  );
}
