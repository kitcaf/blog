import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BlockData } from '@blog/types';
import { useBlockStore } from '@/store/useBlockStore';
import { blockQueryKeys } from '@/hooks/useBlocksQuery';
import { updateTreeNodeTitle } from '@/utils/treeHelpers';
import type { PageTreeNode } from '@/api/blocks';

interface UsePageTitleSyncControllerParams {
  pageId?: string;
  scheduleSync: () => void;
  flushSync: () => void;
}

interface UsePageTitleSyncControllerResult {
  scheduleTitleSync: (title: string) => void;
  flushTitleSync: () => void;
}

export function usePageTitleSyncController({
  pageId,
  scheduleSync,
  flushSync,
}: UsePageTitleSyncControllerParams): UsePageTitleSyncControllerResult {
  const queryClient = useQueryClient();

  const scheduleTitleSync = useCallback(
    (title: string) => {
      if (!pageId) {
        return;
      }

      const didChange = useBlockStore.getState().applyPageTitleChange(pageId, title);
      if (!didChange) {
        return;
      }

      queryClient.setQueryData(
        blockQueryKeys.pageTree(),
        (old: { flatPages: BlockData[]; tree: PageTreeNode[] } | undefined) => {
          if (!old) {
            return old;
          }

          return {
            flatPages: old.flatPages.map((block) =>
              block.id === pageId ? { ...block, props: { ...block.props, title } } : block,
            ),
            tree: updateTreeNodeTitle(old.tree, pageId, title),
          };
        },
      );

      scheduleSync();
    },
    [pageId, queryClient, scheduleSync],
  );

  const flushTitleSync = useCallback(() => {
    flushSync();
  }, [flushSync]);

  return {
    scheduleTitleSync,
    flushTitleSync,
  };
}
