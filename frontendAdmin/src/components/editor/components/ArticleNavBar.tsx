import { memo } from 'react';
import { Loader2, AlertCircle, MoreHorizontal } from 'lucide-react';
import { useSyncStore } from '@/store/useSyncStore';

/**
 * 文章导航栏
 * 
 * 职责：
 *  - 显示文章状态（同步中、同步失败）
 *  - 提供文章操作入口（配置、分享等）
 * 
 * 性能优化：
 *  - 使用 memo 避免不必要的重渲染
 *  - 使用 Zustand 选择器只订阅同步状态
 *  - 与 TiptapEditor 完全解耦
 */
export const ArticleNavBar = memo(function ArticleNavBar() {
  // 使用选择器只订阅需要的状态
  const isSyncing = useSyncStore(s => s.isSyncing);
  const isSyncError = useSyncStore(s => s.isError);

  return (
    <div className="sticky top-0 z-40 w-full border-b border-app-fg-lighter bg-app-bg/80 backdrop-blur-sm">
      <div className="flex items-center justify-between h-12 px-4">
        {/* 左侧：同步状态（仅图标） */}
        <div className="flex items-center gap-2">
          {isSyncError ? (
            <div 
              className="p-1.5 rounded-md bg-red-50 dark:bg-red-950/20"
              title="同步失败"
            >
              <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" />
            </div>
          ) : isSyncing ? (
            <div 
              className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/20"
              title="同步中"
            >
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            </div>
          ) : null}
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
