import { memo } from 'react';
import { Cloud, Loader2, AlertCircle } from 'lucide-react';
import { useSyncStore } from '@/store/useSyncStore';

/**
 * 同步状态指示器
 * 
 * 状态说明：
 *  - 默认：显示云图标（已保存到云端）
 *  - 同步中：显示加载动画
 *  - 同步失败：显示错误图标
 * 
 * 性能优化：
 *  - 使用 memo 避免不必要的重渲染
 *  - 使用 Zustand 选择器只订阅同步状态
 */
export const SyncStatusIndicator = memo(function SyncStatusIndicator() {
  const isSyncing = useSyncStore(s => s.isSyncing);
  const isSyncError = useSyncStore(s => s.isError);

  // 同步失败状态
  if (isSyncError) {
    return (
      <div
        className="p-1.5 rounded-md bg-red-50 dark:bg-red-950/20 transition-colors"
        title="同步失败"
      >
        <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" />
      </div>
    );
  }

  // 同步中状态
  if (isSyncing) {
    return (
      <div
        className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/20 transition-colors"
        title="同步中"
      >
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      </div>
    );
  }

  // 默认状态：已保存到云端
  return (
    <div
      className="p-1.5 rounded-md "
      title="已保存到云端"
    >
      <Cloud className="w-4 h-4" />
    </div>
  );
});
