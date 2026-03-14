import { memo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface SyncStatusBarProps {
  isSyncing: boolean;
  isSyncError: boolean;
}

export const SyncStatusBar = memo(function SyncStatusBar({
  isSyncing,
  isSyncError
}: SyncStatusBarProps) {
  if (!isSyncing && !isSyncError) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-app-fg-light absolute top-3 right-4 z-10">
      {isSyncError ? (
        <>
          <AlertCircle className="w-3 h-3 text-red-400 animate-pulse" />
          <span className="text-red-400">同步失败</span>
        </>
      ) : (
        <>
          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          <span className="text-blue-400">同步中...</span>
        </>
      )}
    </div>
  );
});
