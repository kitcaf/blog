import { useCallback } from 'react';
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

  const sync = useCallback(
    (request: PreparedBlockSync) => {
      useSyncStore.getState().setSyncing(true);

      void syncBlocks(request.payload)
        .then(async () => {
          useBlockStore.getState().acknowledgeSync(request.snapshot);

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
        })
        .then(() => {
          useSyncStore.getState().setSyncing(false);
        })
        .catch((error: unknown) => {
          const syncError = error instanceof Error ? error : new Error('同步失败');
          console.error('[BlockSync] 同步失败:', syncError.message);
          useSyncStore.getState().setError(true);
        });
    },
    [activePageId, queryClient],
  );

  return { sync };
}
