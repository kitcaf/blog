/**
 * @file useEditorSyncController.ts
 * @description 编辑器同步控制器 - 协调变更检测、防抖和 editor -> store flush。
 *
 * 核心职责：
 *   1. 监听编辑器 update 事件，标记需要 flush
 *   2. 标准 1 秒防抖后将编辑器变更写入 Store
 *   3. 防抖结束或显式 flush 后，通知同步 runner 基于 Store 最新状态发起同步
 *   4. 管理页面切换时的初始化和清理
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import type { BlockData } from '@blog/types';
import { hydrateToTiptap } from '../converter';
import {
  readDirtyTrackerCandidateIds,
  resetDirtyTracker,
  isAllDirty,
  isStructureDirty,
} from '../extensions/DirtyTrackerExtension';
import { useBlockStore } from '@/store/useBlockStore';
import { collectEditorSyncDraft } from './collectEditorSyncDraft';

const DEBOUNCE_MS = 1000;

type SyncRequestReason = 'debounce' | 'flush';

interface UseEditorSyncControllerParams {
  editor: Editor | null;
  pageId?: string;
  pageBlock: BlockData | null;
  contentBlocks: BlockData[];
  isBlocksLoading: boolean;
  sync: (reason?: SyncRequestReason) => void;
}

interface UseEditorSyncControllerResult {
  scheduleSync: () => void;
  flushSync: () => void;
}

export function useEditorSyncController({
  editor,
  pageId,
  pageBlock,
  contentBlocks,
  isBlocksLoading,
  sync,
}: UseEditorSyncControllerParams): UseEditorSyncControllerResult {
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedPageRef = useRef<string | null>(null);
  const initializedPageRef = useRef<string | null>(null);
  const needsEditorFlushRef = useRef(false);

  const flushEditorChangesToStore = useCallback(() => {
    if (!pageId || !editor || !needsEditorFlushRef.current) {
      return;
    }

    needsEditorFlushRef.current = false;

    const store = useBlockStore.getState();
    const currentPageBlock = store.blocksById[pageId];
    if (!currentPageBlock) {
      resetDirtyTracker(editor);
      return;
    }

    const needsFullSync = isAllDirty(editor);
    const structureDirty = needsFullSync || isStructureDirty(editor);
    let candidateIds: Set<string>;

    if (needsFullSync) {
      candidateIds = new Set<string>();
      editor.state.doc.descendants((node) => {
        const id = node.attrs?.blockId;
        if (typeof id === 'string' && id.length > 0) {
          candidateIds.add(id);
        }
        return true;
      });
    } else {
      candidateIds = readDirtyTrackerCandidateIds(editor);
    }

    resetDirtyTracker(editor);

    const draft = collectEditorSyncDraft({
      editor,
      pageId,
      pageBlock: currentPageBlock,
      candidateIds,
      blocksById: store.blocksById,
      structureDirty,
    });

    if (draft.updates.length > 0 || draft.deletedIds.length > 0 || draft.pageStructure) {
      store.applyEditorSyncDraft(draft);
    }
  }, [editor, pageId]);

  const flushAndRequestSync = useCallback(
    (reason: SyncRequestReason) => {
      if (!pageId) {
        return;
      }

      flushEditorChangesToStore();
      sync(reason);
    },
    [flushEditorChangesToStore, pageId, sync],
  );

  const scheduleSync = useCallback(() => {
    if (!pageId) {
      return;
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      flushAndRequestSync('debounce');
    }, DEBOUNCE_MS);
  }, [flushAndRequestSync, pageId]);

  const flushSync = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    flushAndRequestSync('flush');
  }, [flushAndRequestSync]);

  useEffect(() => {
    if (!pageId || !pageBlock) {
      useBlockStore.getState().reset();
      return;
    }

    if (isBlocksLoading) {
      return;
    }

    if (hydratedPageRef.current === pageId) {
      return;
    }

    useBlockStore.getState().hydratePage(pageBlock, contentBlocks);
    hydratedPageRef.current = pageId;
  }, [contentBlocks, isBlocksLoading, pageBlock, pageId]);

  useEffect(() => {
    hydratedPageRef.current = null;
    initializedPageRef.current = null;
    needsEditorFlushRef.current = false;

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    resetDirtyTracker(editor);
  }, [editor, pageId]);

  useEffect(() => {
    if (!editor || !pageId || !pageBlock || isBlocksLoading) {
      return;
    }

    if (initializedPageRef.current === pageId) {
      return;
    }

    const { blocksById } = useBlockStore.getState();
    const storePageBlock = blocksById[pageId];
    if (!storePageBlock) {
      return;
    }

    const editorContentBlocks = storePageBlock.contentIds
      .map((id) => blocksById[id])
      .filter((block): block is NonNullable<typeof block> => Boolean(block));

    editor.commands.setContent(hydrateToTiptap(editorContentBlocks), { emitUpdate: false });
    resetDirtyTracker(editor);
    initializedPageRef.current = pageId;
  }, [contentBlocks, editor, isBlocksLoading, pageBlock, pageId]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleEditorUpdate = ({
      transaction,
    }: {
      transaction: { getMeta: (key: string) => unknown };
    }) => {
      if (transaction.getMeta('preventUpdate') || transaction.getMeta('isIdInjection')) {
        return;
      }

      needsEditorFlushRef.current = true;
      scheduleSync();
    };

    editor.on('update', handleEditorUpdate);

    return () => {
      editor.off('update', handleEditorUpdate);
    };
  }, [editor, scheduleSync]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  return {
    scheduleSync,
    flushSync,
  };
}
