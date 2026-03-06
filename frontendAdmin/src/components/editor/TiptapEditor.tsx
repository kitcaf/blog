/**
 * @file TiptapEditor.tsx
 * @description 富文本编辑器组件。
 *
 * 数据流：
 *   切换页面 → store.getState() 读取 blocks → hydrateToTiptap() → editor.setContent()
 *   用户输入 → editor.onUpdate → 防抖 DEBOUNCE_MS →
 *             dehydrateFromTiptap() → store.replacePage()
 *             同时触发 React Query useMutation → POST /api/blocks/sync
 *
 * 性能关键点：
 *  - TiptapEditor 不订阅 blocksById 变化，只订阅 activePageId。
 *    （否则会形成：onUpdate → replacePage → blocksById 变 → re-render → 循环）
 *  - 编辑中由 Tiptap 自身管理文档状态，Store 只在防抖后接收快照。
 *  - getSyncPayload / sync 均通过稳定引用获取，不触发 re-render。
 *
 * 同步状态 UI：
 *  - isSyncing: 显示"同步中..." spinner
 *  - isError: 显示红色"同步失败"提示（dirty 状态保留，下次自动重试）
 *  - isDirty: 显示橙色"未保存"指示点
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useBlockStore } from '@/store/useBlockStore';
import { selectIsDirty } from '@/store/selectors';
import { editorExtensions } from './extensions';
import { hydrateToTiptap, dehydrateFromTiptap } from './converter';
import { useBlockSyncMutation } from '@/hooks/useBlocksQuery';

/** 防抖延迟（ms）：用户停止输入后 1.5s 才同步 */
const DEBOUNCE_MS = 1500;

interface TiptapEditorProps {
  className?: string;
}

/**
 * 从 Store 中一次性读取当前活跃页的子 Block（非订阅式）。
 * 在组件外定义为纯函数，避免每次渲染重新创建。
 */
function getActivePageBlocks() {
  const { activePageId, blocksById } = useBlockStore.getState();
  if (!activePageId) return [];
  const page = blocksById[activePageId];
  if (!page) return [];
  return page.contentIds.map((id) => blocksById[id]).filter(Boolean);
}

export function TiptapEditor({ className = '' }: TiptapEditorProps) {
  // 只订阅 activePageId（基本类型，=== 比较稳定）
  const activePageId = useBlockStore((s) => s.activePageId);
  // 只订阅 dirty 状态（布尔型，变化极少）
  const isDirty = useBlockStore(selectIsDirty);

  // 稳定引用的 actions
  const replacePage = useBlockStore((s) => s.replacePage);
  const getSyncPayload = useBlockStore((s) => s.getSyncPayload);

  // React Query 批量同步 mutation
  const { sync, isSyncing, isError: isSyncError } = useBlockSyncMutation(activePageId, {
    onSuccess: () => {
      console.info('[TiptapEditor] 自动同步成功 ✓');
    },
    onError: (err) => {
      console.warn('[TiptapEditor] 同步失败，将在下次编辑时重试:', err.message);
    },
  });

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 记录上一次已加载的 activePageId，用于区分：
   *  - 首次挂载（prevPageId === null）→ 不重复 setContent（useEditor 已用初始内容）
   *  - 切换页面（prevPageId !== activePageId）→ 需要 setContent 替换文档
   */
  const prevPageIdRef = useRef<string | null>(activePageId);

  /**
   * 防抖同步回调：
   *  1. 将 Tiptap 文档脱水写入 Store（replacePage）
   *  2. 取出 dirtyBlockIds 打包 → useMutation.sync → POST /api/blocks/sync
   *
   * 用 useCallback 确保闭包中 activePageId 始终最新。
   */
  const debouncedSync = useCallback(
    (editorJSON: ReturnType<typeof JSON.parse>) => {
      if (!activePageId) return;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(() => {
        // Step 1：将 Tiptap 内容写入 Zustand Store
        const parentPath = `/${activePageId}/`;
        const newBlocks = dehydrateFromTiptap(editorJSON, activePageId, parentPath);
        replacePage(activePageId, newBlocks);

        // Step 2：从 Store 取出本次积累的完整 payload → React Query mutation
        // 注意：replacePage 是同步的，getState() 能立即取到新 dirty 集合
        const payload = getSyncPayload();
        const hasChanges =
          payload.updated_blocks.length > 0 || payload.deleted_blocks.length > 0;

        if (hasChanges) {
          sync(payload);
        }
      }, DEBOUNCE_MS);
    },
    [activePageId, replacePage, getSyncPayload, sync],
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: hydrateToTiptap(getActivePageBlocks()),
    editorProps: {
      attributes: {
        class: 'prosemirror-editor outline-none',
        'data-testid': 'tiptap-editor',
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      // 忽略由 setContent 或其他不需要触发同步的内部事务
      if (transaction.getMeta('preventUpdate') || transaction.getMeta('isIdInjection')) {
        return;
      }
      console.log('--- Tiptap JSON Output ---', JSON.stringify(ed.getJSON(), null, 2));
      debouncedSync(ed.getJSON());
    },
  });

  // 切换活跃页面时重置编辑器内容
  // 关键：跳过首次挂载，避免 useEditor 初始化后又立刻 setContent 导致内容闪烁
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // 首次挂载：prevPageIdRef 与 activePageId 相同，跳过（useEditor 已加载初始内容）
    if (prevPageIdRef.current === activePageId) return;

    // 真正切换页面了：替换文档内容
    prevPageIdRef.current = activePageId;
    const blocks = getActivePageBlocks();
    const newContent = hydrateToTiptap(blocks);
    // emitUpdate: false 防止切换页面触发 onUpdate → 不必要的同步
    editor.commands.setContent(newContent, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId]);

  // 组件卸载时清理防抖 timer（防止内存泄漏）
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className={`tiptap-editor-shell ${className}`}>
      {/* 同步状态指示器 */}
      <SyncStatusBar isDirty={isDirty} isSyncing={isSyncing} isSyncError={isSyncError} />
      <EditorContent editor={editor} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 同步状态指示器（轻量 UI，仅在需要时渲染）
// ─────────────────────────────────────────────────────────────────────────────

interface SyncStatusBarProps {
  isDirty: boolean;
  isSyncing: boolean;
  isSyncError: boolean;
}

function SyncStatusBar({ isDirty, isSyncing, isSyncError }: SyncStatusBarProps) {
  // 全部正常时不渲染（保持 DOM 干净）
  if (!isDirty && !isSyncing && !isSyncError) return null;

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium
                 text-app-fg-light select-none pointer-events-none
                 absolute top-3 right-4 z-10"
      aria-live="polite"
      aria-label="同步状态"
    >
      {isSyncError ? (
        /* 同步失败：红色叹号 */
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-red-400">同步失败，稍后重试</span>
        </>
      ) : isSyncing ? (
        /* 同步中：蓝色旋转圆圈 */
        <>
          <svg
            className="w-3 h-3 animate-spin text-blue-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-blue-400">同步中...</span>
        </>
      ) : (
        /* 有未保存变更：橙色指示点 */
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-amber-400">未保存</span>
        </>
      )}
    </div>
  );
}
