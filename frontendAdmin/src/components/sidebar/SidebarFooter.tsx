/**
 * @file SidebarFooter.tsx
 * @description 侧边栏底部：用户信息和退出登录
 */

import { LogOut, User } from 'lucide-react';

interface SidebarFooterProps {
  username?: string;
  email?: string;
  onLogout: () => void;
}

export function SidebarFooter({ username, email, onLogout }: SidebarFooterProps) {
  return (
    <div className="p-2 border-t border-border space-y-1">
      {/* 用户信息 */}
      <div className="flex items-center gap-2 p-2 hover:bg-app-hover rounded-md cursor-pointer">
        <div className="w-7 h-7 bg-app-hover rounded-full flex items-center justify-center text-xs font-medium text-app-fg-deeper">
          <User size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-app-fg-deep truncate">
            {username || '用户'}
          </div>
          <div className="text-xs text-app-fg-light truncate">
            {email || ''}
          </div>
        </div>
      </div>

      {/* 退出登录 */}
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-2 p-2 hover:bg-app-hover rounded-md cursor-pointer text-app-fg hover:text-app-fg-deeper transition-colors"
      >
        <LogOut size={16} />
        <span className="text-sm">退出登录</span>
      </button>
    </div>
  );
}
