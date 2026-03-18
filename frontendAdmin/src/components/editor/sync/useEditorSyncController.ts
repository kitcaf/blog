/**
 * @file useEditorSyncController.ts
 * @description 编辑器同步控制器 - 协调编辑器变更检测、防抖、数据提取和同步
 * 
 * 核心职责：
 *   1. 监听编辑器 update 事件，标记需要 flush
 *   2. 防抖后触发 flushAndSync：从编辑器提取变更 → 写入 Store → 发起同步
 *   3. 管理页面切换时的初始化和清理
 *   4. 提供标题变更的同步入口
 * 
 * 数据流：
 *   用户编辑 → editor.on('update') → needsEditorFlushRef = true → scheduleFlushAndSync()
 *   → 防抖 1s → flushAndSync()
 *     ├─ readDirtyTrackerCandidateIds(editor) 读取候选 ID
 *     ├─ collectEditorSyncDraft() 基于最终文档提取变更
 *     ├─ store.applyEditorSyncDraft() 批量写入 Store
 *     └─ store.getSyncRequest() → sync() 发起 API 请求
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import type { BlockData } from '@blog/types';
import { hydrateToTiptap } from '../converter';
import { readDirtyTrackerCandidateIds, resetDirtyTracker } from '../extensions/DirtyTrackerExtension';
import { useBlockStore, type PreparedBlockSync } from '@/store/useBlockStore';
import { collectEditorSyncDraft } from './collectEditorSyncDraft';

const DEBOUNCE_MS = 1000; // 防抖延迟：1秒

interface UseEditorSyncControllerParams {
  editor: Editor | null;
  pageId?: string;
  page: BlockData | null;
  blocks: BlockData[];
  isBlocksLoading: boolean;
  sync: (request: PreparedBlockSync) => void;
}

interface UseEditorSyncControllerResult {
  scheduleTitleSync: (title: string) => void;
}

export function useEditorSyncController({
  editor,
  pageId,
  page,
  blocks,
  isBlocksLoading,
  sync,
}: UseEditorSyncControllerParams): UseEditorSyncControllerResult {
  // 防抖定时器：延迟触发同步，避免频繁请求
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 已初始化的页面 ID：防止重复初始化
  const initializedPageRef = useRef<string | null>(null);
  // 是否需要从编辑器提取数据：标记编辑器有变更
  const needsEditorFlushRef = useRef(false);

  /**
   * 核心同步函数：提取编辑器变更 → 写入 Store → 发起同步
   * 
   * 执行流程：
   *   1. 如果 needsEditorFlushRef 为 true，从编辑器提取变更
   *   2. 读取 DirtyTracker 收集的候选 ID
   *   3. 调用 collectEditorSyncDraft 基于最终文档 diff 变更
   *   4. 将变更批量写入 Store (applyEditorSyncDraft)
   *   5. 从 Store 获取待同步数据 (getSyncRequest)
   *   6. 发起 API 同步请求
   */
  const flushAndSync = useCallback(() => {
    if (!pageId) {
      return;
    }

    // 步骤 1：如果编辑器有变更，提取数据
    if (needsEditorFlushRef.current && editor) {
      needsEditorFlushRef.current = false; // 重置标记

      const store = useBlockStore.getState();
      const pageBlock = store.blocksById[pageId];
      
      // 步骤 2：读取 DirtyTracker 收集的候选 ID（可能变更的 block）
      const candidateIds = readDirtyTrackerCandidateIds(editor);
      resetDirtyTracker(editor); // 清空候选集合

      if (pageBlock) {
        // 步骤 3：基于最终文档快照 diff 变更
        const draft = collectEditorSyncDraft({
          editor,
          pageId,
          pageBlock,
          candidateIds,
          blocksById: store.blocksById,
        });

        // 步骤 4：如果有变更，批量写入 Store
        if (draft.updates.length > 0 || draft.deletedIds.length > 0 || draft.pageStructure) {
          store.applyEditorSyncDraft(draft);
        }
      }
    }

    // 步骤 5 & 6：从 Store 获取待同步数据并发起请求
    const request = useBlockStore.getState().getSyncRequest();
    if (request) {
      sync(request); // 调用 API 同步
    }
  }, [editor, pageId, sync]);

  /**
   * 调度 flush 和同步：防抖触发
   * 
   * 每次调用会重置定时器，确保在用户停止编辑 1 秒后才执行同步
   */
  const scheduleFlushAndSync = useCallback(() => {
    if (!pageId) {
      return;
    }

    // 清除旧定时器，重新计时
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    // 1 秒后执行 flushAndSync
    syncTimerRef.current = setTimeout(flushAndSync, DEBOUNCE_MS);
  }, [flushAndSync, pageId]);

  /**
   * 标题变更同步入口
   * 
   * 流程：
   *   1. 调用 Store 的 applyPageTitleChange 更新标题
   *   2. 触发防抖同步（会在 1 秒后发起 API 请求）
   */
  const scheduleTitleSync = useCallback(
    (title: string) => {
      if (!pageId) {
        return;
      }

      // 更新 Store 中的标题
      useBlockStore.getState().applyPageTitleChange(pageId, title);
      // 触发防抖同步
      scheduleFlushAndSync();
    },
    [pageId, scheduleFlushAndSync],
  );

  /**
   * Effect 1: 页面数据水合
   * 
   * 当页面或 blocks 数据加载完成后，将数据注入 Store
   */
  useEffect(() => {
    if (!pageId || !page) {
      useBlockStore.getState().reset(); // 无页面时重置 Store
      return;
    }

    if (isBlocksLoading) {
      return;
    }

    // 将服务器数据水合到 Store
    useBlockStore.getState().hydratePage(page, blocks);
  }, [blocks, isBlocksLoading, page, pageId]);

  /**
   * Effect 2: 页面切换时重置运行时状态
   * 
   * 清理旧页面的状态，防止数据污染
   */
  useEffect(() => {
    initializedPageRef.current = null; // 重置初始化标记
    needsEditorFlushRef.current = false; // 重置 flush 标记

    // 清除防抖定时器
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    // 清空 DirtyTracker 的候选 ID
    resetDirtyTracker(editor);
  }, [editor, pageId]);

  /**
   * Effect 3: 初始化编辑器内容
   * 
   * 将 blocks 数据转换为 Tiptap 文档并注入编辑器
   * 
   * 注意：直接使用 blocks 参数，而不是从 Store 读取
   * 因为 Store 的水合可能还没完成
   */
  useEffect(() => {
    if (!editor || !pageId || !page || isBlocksLoading) {
      return;
    }

    // 防止重复初始化
    if (initializedPageRef.current === pageId) {
      return;
    }

    const { blocksById } = useBlockStore.getState();
    const pageBlock = blocksById[pageId];
    if (!pageBlock) {
      return;
    }

    const contentBlocks = pageBlock.contentIds
      .map((id) => blocksById[id])
      .filter((block): block is NonNullable<typeof block> => Boolean(block));

    // 转换为 Tiptap 文档格式并注入编辑器
    editor.commands.setContent(hydrateToTiptap(contentBlocks), { emitUpdate: false });
    resetDirtyTracker(editor); // 清空候选 ID
    initializedPageRef.current = pageId; // 标记已初始化
  }, [blocks, editor, isBlocksLoading, page, pageId]);

  /**
   * Effect 4: 监听编辑器更新事件
   * 
   * 当用户编辑时，标记需要 flush 并触发防抖同步
   */
  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleEditorUpdate = ({
      transaction,
    }: {
      transaction: { getMeta: (key: string) => unknown };
    }) => {
      // 跳过系统操作（如 ID 注入、程序化更新）
      if (transaction.getMeta('preventUpdate') || transaction.getMeta('isIdInjection')) {
        return;
      }

      // 标记编辑器有变更
      needsEditorFlushRef.current = true;
      // 触发防抖同步
      scheduleFlushAndSync();
    };

    editor.on('update', handleEditorUpdate);

    return () => {
      editor.off('update', handleEditorUpdate);
    };
  }, [editor, scheduleFlushAndSync]);

  /**
   * Effect 5: 组件卸载时清理定时器
   */
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  return {
    scheduleTitleSync,
  };
}
