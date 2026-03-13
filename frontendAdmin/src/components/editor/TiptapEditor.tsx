/**
 * @file TiptapEditor.tsx
 * @description 富文本编辑器组件
 *
 * 简单直接的数据流：
 *   1. 加载页面数据（page + blocks）
 *   2. 初始化编辑器
 *   3. 用户编辑 → 防抖同步
 */

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useBlockStore } from '@/store/useBlockStore';
import { createEditorExtensions } from './extensions';
import { hydrateToTiptap, parseTiptapNodeToInlineContent, parseTiptapNodeToProps } from './converter';
import { useBlockSyncMutation, usePageBlocksQuery, usePageDetailQuery } from '@/hooks/useBlocksQuery';

const DEBOUNCE_MS = 1000; // 标题和内容编辑的防抖时间（800ms 更合适）

/**
 * 自适应高度的 Textarea 组件
 */
function AutoResizeTextarea({
  value,
  onChange,
  onEnter,
  onBlur,
  placeholder,
  className,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    onChange(target.value);

    // 延迟调整高度，确保内容已更新
    requestAnimationFrame(() => {
      target.style.height = 'auto';
      target.style.height = `${target.scrollHeight}px`;
    });
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnter();
    }
  }, [onEnter]);

  // 初始化高度
  useEffect(() => {
    if (textareaRef?.current) {
      const target = textareaRef.current;
      target.style.height = 'auto';
      target.style.height = `${target.scrollHeight}px`;
    }
  }, [value, textareaRef]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      spellCheck={false}
      rows={1}
    />
  );
}

interface TiptapEditorProps {
  className?: string;
  pageId?: string;
}

export function TiptapEditor({ className = '', pageId }: TiptapEditorProps) {
  // 加载数据
  const { page, isLoading: pageLoading } = usePageDetailQuery(pageId ?? null);
  const { blocks, isLoading: blocksLoading } = usePageBlocksQuery(pageId ?? null);

  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 直接从 page 读取标题，用户编辑时更新本地状态
  const serverTitle = page && 'title' in page.props ? page.props.title : '未命名';
  const [localTitle, setLocalTitle] = useState(serverTitle);
  const isEditingRef = useRef(false); // 使用 ref 避免闭包问题

  const { sync, isSyncing, isError: isSyncError } = useBlockSyncMutation(pageId ?? null);

  // 水合数据到 Store
  useEffect(() => {
    if (!page || !pageId) return;

    const allBlocks = [page, ...blocks];
    useBlockStore.getState().hydratePage(allBlocks);
  }, [page, blocks, pageId]);

  // 当服务器标题变化时，仅在用户未编辑时同步
  useEffect(() => {
    // 只有在用户没有编辑时才同步服务器标题
    if (!isEditingRef.current) {
      setLocalTitle(serverTitle);

      // 新页面自动聚焦标题
      if (serverTitle === '未命名' && page) {
        setTimeout(() => {
          titleTextareaRef.current?.focus();
          titleTextareaRef.current?.select();
        }, 100);
      }
    }
  }, [serverTitle, page]);

  // 防抖同步
  const triggerSync = useCallback(() => {
    if (!pageId) return;

    if (syncTimer.current) clearTimeout(syncTimer.current);

    syncTimer.current = setTimeout(() => {
      const store = useBlockStore.getState();
      const payload = store.getSyncPayload();

      if (payload.updated_blocks.length > 0 || payload.deleted_blocks.length > 0) {
        sync(payload);
      }
    }, DEBOUNCE_MS);
  }, [pageId, sync]);

  // 编辑器更新处理（DirtyTrackerExtension 已处理结构变化，这里只提取脏块数据）
  const handleEditorUpdate = useCallback((ed: Editor) => {
    if (!pageId) return;

    const store = useBlockStore.getState();
    const { dirtySet } = store;

    // 只提取脏块的数据（O(脏块数)，而非 O(文档大小)）
    if (dirtySet.size > 0) {
      const dirtyIds = new Set(dirtySet);
      dirtyIds.delete(pageId); // 页面块不需要提取内容

      if (dirtyIds.size > 0) {
        // 只遍历脏块，提前退出优化
        ed.state.doc.descendants((node) => {
          const id = node.attrs?.blockId;
          if (node.isBlock && id && dirtyIds.has(id)) {
            const jsonNode = node.toJSON();
            const content = parseTiptapNodeToInlineContent(jsonNode);
            const props = parseTiptapNodeToProps(jsonNode);
            store.updateSingleBlockData(id, content, props);

            dirtyIds.delete(id);
            if (dirtyIds.size === 0) return false; // 提前退出
          }
          return true;
        });
      }
    }

    triggerSync();
  }, [pageId, triggerSync]);

  // 初始化编辑器
  const editor = useEditor({
    extensions: createEditorExtensions(pageId ?? null),
    editorProps: {
      attributes: {
        class: 'prosemirror-editor outline-none',
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (transaction.getMeta('preventUpdate') || transaction.getMeta('isIdInjection')) {
        return;
      }
      console.log("发生更新：Tiptap数据结构", ed.getJSON())
      handleEditorUpdate(ed as Editor);
    },
  }, [pageId]); // 当 pageId 变化时重新创建编辑器

  // 加载内容到编辑器
  useEffect(() => {
    if (!editor || !page || !pageId) return;

    const store = useBlockStore.getState();
    const pageBlock = store.blocksById[pageId];

    if (!pageBlock) return;

    const contentBlocks = pageBlock.contentIds
      .map((id) => store.blocksById[id])
      .filter(Boolean);

    const content = hydrateToTiptap(contentBlocks);
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, page, pageId]);

  // 标题变更（立即更新本地状态，防抖同步到服务器）
  const handleTitleChange = useCallback((newTitle: string) => {
    // 标记正在编辑
    isEditingRef.current = true;
    setLocalTitle(newTitle);

    if (!pageId) return;

    const store = useBlockStore.getState();
    const pageBlock = store.blocksById[pageId];

    if (pageBlock && 'title' in pageBlock.props) {
      store.updateSingleBlockData(pageId, pageBlock.content, {
        ...pageBlock.props,
        title: newTitle,
      });
      store.markBlockDirty(pageId);
      triggerSync();
    }
  }, [pageId, triggerSync]);

  // 标题失焦 → 重置编辑状态
  const handleTitleBlur = useCallback(() => {
    // 延迟重置，确保同步完成
    setTimeout(() => {
      isEditingRef.current = false;
    }, DEBOUNCE_MS + 200);
  }, []);

  // 标题回车 → 聚焦编辑器
  const handleTitleEnter = useCallback(() => {
    if (editor) {
      editor.commands.focus('start');
    }
  }, [editor]);

  // 清理
  useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);

  // 加载中
  if (pageLoading || blocksLoading) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[400px]`}>
        <div className="text-app-fg-light text-sm">加载中...</div>
      </div>
    );
  }

  if (!editor) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[400px]`}>
        <div className="text-app-fg-light text-sm">初始化编辑器...</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <SyncStatusBar isSyncing={isSyncing} isSyncError={isSyncError} />

      {/* 标题编辑区 */}
      <div className="page-metadata px-16 pt-12 pb-4">
        <AutoResizeTextarea
          textareaRef={titleTextareaRef}
          value={localTitle}
          onChange={handleTitleChange}
          onEnter={handleTitleEnter}
          onBlur={handleTitleBlur}
          placeholder="未命名"
          className="w-full text-4xl font-bold bg-transparent border-none outline-none resize-none
                     text-app-fg-deep placeholder:text-app-fg-light/40
                     focus:outline-none focus:ring-0 leading-[1.2] overflow-y-hidden
                     py-0 px-0 min-h-[3rem]"
        />
      </div>

      {/* 内容编辑区 */}
      <div className="px-16 pb-12">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

interface SyncStatusBarProps {
  isSyncing: boolean;
  isSyncError: boolean;
}

function SyncStatusBar({ isSyncing, isSyncError }: SyncStatusBarProps) {
  if (!isSyncing && !isSyncError) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-app-fg-light absolute top-3 right-4 z-10">
      {isSyncError ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-red-400">同步失败</span>
        </>
      ) : (
        <>
          <svg className="w-3 h-3 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-blue-400">同步中...</span>
        </>
      )}
    </div>
  );
}
