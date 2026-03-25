import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BlockData } from '@blog/types';
import { syncBlocks } from '@/api/blocks';
import { blockQueryKeys } from '@/hooks/useBlocksQuery';
import { useBlockStore } from '@/store/useBlockStore';
import { useSyncStore } from '@/store/useSyncStore';

const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 30000] as const;

export type SyncIntentReason = 'debounce' | 'flush' | 'retry';

interface SyncIntent {
  id: number;
  pageId: string;
  reason: SyncIntentReason;
  enqueuedAt: number;
  retryCount: number;
}

interface UseBlockSyncRunnerResult {
  sync: (reason?: SyncIntentReason) => void;
}

function patchActivePageDetailCache(
  queryClient: ReturnType<typeof useQueryClient>,
  pageId: string,
) {
  const store = useBlockStore.getState();
  const pendingChange = store.pendingChangesById[pageId];

  if (pendingChange) {
    return;
  }

  const pageBlock = store.blocksById[pageId];
  if (!pageBlock || pageBlock.type !== 'page') {
    return;
  }

  queryClient.setQueryData(blockQueryKeys.pageDetail(pageId), pageBlock as BlockData);
}

function getRetryDelayMs(retryCount: number): number {
  const retryIndex = Math.max(0, Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1));
  return RETRY_DELAYS_MS[retryIndex];
}

export function useBlockSyncRunner(activePageId: string | null): UseBlockSyncRunnerResult {
  const queryClient = useQueryClient();
  const queueRef = useRef<SyncIntent[]>([]);
  const isDrainingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextIntentIdRef = useRef(1);

  const clearRetryTimer = useCallback(() => {
    if (!retryTimerRef.current) {
      return;
    }

    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const triggerBackgroundRefresh = useCallback(
    (pageId: string) => {
      patchActivePageDetailCache(queryClient, pageId);

      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: blockQueryKeys.pageBlocks(pageId),
          refetchType: 'inactive',
        }),
        queryClient.invalidateQueries({
          queryKey: blockQueryKeys.pageDetail(pageId),
          refetchType: 'inactive',
        }),
      ]).catch((error: unknown) => {
        const refreshError = error instanceof Error ? error : new Error('刷新缓存失败');
        console.error('[BlockSync] 刷新缓存失败:', refreshError.message);
      });
    },
    [queryClient],
  );

  const enqueueOrMergeIntent = useCallback((intent: SyncIntent) => {
    const queuedIntent = queueRef.current[queueRef.current.length - 1];
    if (queuedIntent && queuedIntent.pageId === intent.pageId) {
      queueRef.current[queueRef.current.length - 1] = intent;
      return;
    }

    queueRef.current.push(intent);
  }, []);

  const drainQueue = useCallback(() => {
    if (isDrainingRef.current) {
      return;
    }

    isDrainingRef.current = true;

    const runDrain = async () => {
      try {
        while (queueRef.current.length > 0) {
          const nextIntent = queueRef.current.shift();
          if (!nextIntent) {
            break;
          }

          const request = useBlockStore.getState().buildSyncRequest(nextIntent.pageId);
          if (!request) {
            continue;
          }

          useSyncStore.getState().setSyncing(true);

          let syncError: Error | null = null;

          try {
            await syncBlocks(request.payload);
          } catch (error: unknown) {
            syncError = error instanceof Error ? error : new Error('同步失败');
          } finally {
            if (syncError) {
              useSyncStore.getState().setError(true);
            } else {
              useSyncStore.getState().setSyncing(false);
            }
          }

          if (syncError) {
            const nextRetryCount = nextIntent.retryCount + 1;
            const retryDelayMs = getRetryDelayMs(nextRetryCount);

            queueRef.current = [];
            clearRetryTimer();

            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              queueRef.current = [
                {
                  id: nextIntentIdRef.current++,
                  pageId: nextIntent.pageId,
                  reason: 'retry',
                  enqueuedAt: Date.now(),
                  retryCount: nextRetryCount,
                },
              ];
              drainQueue();
            }, retryDelayMs);

            console.error('[BlockSync] 同步失败:', syncError.message);
            return;
          }

          useBlockStore.getState().acknowledgeSync(request.snapshot);
          triggerBackgroundRefresh(nextIntent.pageId);
        }
      } finally {
        isDrainingRef.current = false;

        if (queueRef.current.length > 0 && !retryTimerRef.current) {
          drainQueue();
        }
      }
    };

    void runDrain();
  }, [clearRetryTimer, triggerBackgroundRefresh]);

  const sync = useCallback(
    (reason: SyncIntentReason = 'debounce') => {
      if (!activePageId) {
        return;
      }

      clearRetryTimer();

      enqueueOrMergeIntent({
        id: nextIntentIdRef.current++,
        pageId: activePageId,
        reason,
        enqueuedAt: Date.now(),
        retryCount: 0,
      });

      drainQueue();
    },
    [activePageId, clearRetryTimer, drainQueue, enqueueOrMergeIntent],
  );

  useEffect(() => {
    queueRef.current = [];
    clearRetryTimer();
  }, [activePageId, clearRetryTimer]);

  useEffect(() => {
    return () => {
      queueRef.current = [];
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  return { sync };
}
