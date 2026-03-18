import { memo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { SidebarToggle } from './SidebarToggle';

/**
 * 文章导航栏
 * 
 * 职责：
 *  - 显示侧边栏切换按钮（仅在侧边栏关闭时）
 *  - 显示文章状态（同步中、同步失败、已保存）
 *  - 提供文章操作入口（配置、分享等）
 * 
 * 性能优化：
 *  - 使用 memo 避免不必要的重渲染
 *  - 与 TiptapEditor 完全解耦
 */
export const ArticleNavBar = memo(function ArticleNavBar() {
  return (
    <div className="sticky top-0 z-40 w-full border-b border-app-fg-lighter bg-app-bg/80 backdrop-blur-sm">
      <div className="flex items-center justify-between h-12 px-4">
        {/* 左侧：侧边栏切换 + 同步状态指示器 */}
        <div className="flex items-center gap-2">
          <SidebarToggle />
          <SyncStatusIndicator />
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 rounded-md text-app-fg-light hover:text-app-fg-deeper hover:bg-app-hover transition-colors"
            title="更多操作"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
