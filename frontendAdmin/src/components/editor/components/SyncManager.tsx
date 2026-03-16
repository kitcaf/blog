import { ReactNode } from 'react';
import { useBlockSyncMutation } from '@/hooks/useBlocksQuery';
import { SyncStatusBar } from './SyncStatusBar';

interface SyncManagerProps {
  pageId: string;
  children: ReactNode;
}

/**
 * 同步状态管理组件
 * 
 * 职责：
 *  - 管理同步状态（isSyncing, isError）
 *  - 渲染同步状态指示器
 *  - 将同步状态与编辑器主体隔离，避免同步状态变化导致编辑器重渲染
 * 
 * 性能优化：
 *  - 状态下放：同步状态变化只影响 SyncStatusBar，不影响 children
 *  - 减少不必要的重渲染
 */
export function SyncManager({ pageId, children }: SyncManagerProps) {
  const { isSyncing, isError } = useBlockSyncMutation(pageId);

  return (
    <>
      <SyncStatusBar isSyncing={isSyncing} isSyncError={isError} />
      {children}
    </>
  );
}
