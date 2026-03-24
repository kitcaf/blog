import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BlockData } from '@blog/types';
import { syncBlocks } from '@/api/blocks';
import { blockQueryKeys } from '@/hooks/useBlocksQuery';
import { useBlockStore, type PreparedBlockSync } from '@/store/useBlockStore';
import { useSyncStore } from '@/store/useSyncStore';

interface UseBlockSyncRunnerResult {
  sync: (request: PreparedBlockSync) => void;
}

function patchActivePageDetailCache(
  queryClient: ReturnType<typeof useQueryClient>,
  activePageId: string,
) {
  const store = useBlockStore.getState();
  const pendingChange = store.pendingChangesById[activePageId];

  if (pendingChange) {
    return;
  }

  const pageBlock = store.blocksById[activePageId];
  if (!pageBlock || pageBlock.type !== 'page') {
    return;
  }

  queryClient.setQueryData(blockQueryKeys.pageDetail(activePageId), pageBlock as BlockData);
}

export function useBlockSyncRunner(activePageId: string | null): UseBlockSyncRunnerResult {
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);
  const needsResyncRef = useRef(false);

  const sync = useCallback(
    (request: PreparedBlockSync) => {
      if (inFlightRef.current) {
        needsResyncRef.current = true;
        return;
      }

      inFlightRef.current = true;
      let activeSnapshot = request.snapshot;

      const runSync = async (currentRequest: PreparedBlockSync): Promise<void> => {
        activeSnapshot = currentRequest.snapshot;
        useSyncStore.getState().setSyncing(true);
        try {
          await syncBlocks(currentRequest.payload);
        } finally {
          useSyncStore.getState().setSyncing(false);
        }

        useBlockStore.getState().acknowledgeSync(currentRequest.snapshot);

        if (!activePageId) {
          return;
        }

        patchActivePageDetailCache(queryClient, activePageId);

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: blockQueryKeys.pageBlocks(activePageId),
            refetchType: 'inactive',
          }),
          queryClient.invalidateQueries({
            queryKey: blockQueryKeys.pageDetail(activePageId),
            refetchType: 'inactive',
          }),
        ]);
      };

      const drainQueue = async () => {
        let nextRequest: PreparedBlockSync | null = request;

        while (nextRequest) {
          needsResyncRef.current = false;
          await runSync(nextRequest);
          nextRequest = needsResyncRef.current && activePageId
            ? useBlockStore.getState().getSyncRequest(activePageId)
            : null;
        }
      };

      void drainQueue()
        .catch((error: unknown) => {
          useBlockStore.getState().releaseSyncRequest(activeSnapshot);
          const syncError = error instanceof Error ? error : new Error('同步失败');
          console.error('[BlockSync] 同步失败:', syncError.message);
          useSyncStore.getState().setError(true);
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    },
    [activePageId, queryClient],
  );

  return { sync };
}

