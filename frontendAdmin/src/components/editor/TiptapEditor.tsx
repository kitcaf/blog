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
 *  - TiptapEditor 不订阅 blocksById 变化，只接收 pageId prop。
 *    （否则会形成：onUpdate → replacePage → blocksById 变 → re-render → 循环）
 *  - 编辑中由 Tiptap 自身管理文档状态，Store 只在防抖后接收快照。
 *  - getSyncPayload / sync 均通过稳定引用获取，不触发 re-render。
 *
 * 同步状态 UI：
 *  - isSyncing: 显示"同步中..." spinner
 *  - isError: 显示红色"同步失败"提示（dirty 状态保留，下次自动重试）
 *  - isDirty: 显示橙色"未保存"指示点
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useBlockStore } from '@/store/useBlockStore';
import { editorExtensions } from './extensions';
import { hydrateToTiptap, parseTiptapNodeToInlineContent, parseTiptapNodeToProps } from './converter';
import { useBlockSyncMutation } from '@/hooks/useBlocksQuery';

/** 防抖延迟（ms）：用户停止输入后 1.5s 才同步 */
const DEBOUNCE_MS = 1500;

interface TiptapEditorProps {
  className?: string;
  pageId?: string;
}

/**
 * 从 Store 中一次性读取指定页面的子 Block（非订阅式）。
 * 在组件外定义为纯函数，避免每次渲染重新创建。
 */
function getPageBlocks(pageId?: string) {
  const { blocksById } = useBlockStore.getState();
  if (!pageId) return [];
  const page = blocksById[pageId];
  if (!page) return [];
  return page.contentIds.map((id) => blocksById[id]).filter(Boolean);
}

export function TiptapEditor({ className = '', pageId }: TiptapEditorProps) {
  // 页面标题状态
  const [pageTitle, setPageTitle] = useState('未命名');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // React Query 批量同步 mutation
  const { sync, isSyncing, isError: isSyncError } = useBlockSyncMutation(pageId ?? null, {
    onSuccess: () => {
      console.info('[TiptapEditor] 自动同步成功 ✓');
    },
    onError: (err) => {
      console.warn('[TiptapEditor] 同步失败，将在下次编辑时重试:', err.message);
    },
  });

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 记录上一次已加载的 pageId，用于区分：
   *  - 首次挂载（prevPageId === null）→ 不重复 setContent（useEditor 已用初始内容）
   *  - 切换页面（prevPageId !== pageId）→ 需要 setContent 替换文档
   */
  const prevPageIdRef = useRef<string | null>(pageId ?? null);

  /**
   * 防抖同步回调（三层齿轮架构）：
   *  醒来后去问 Zustand 谁脏了，然后将最新的真实有效数据抽离并发出请求。
   */
  const triggerSync = useCallback(
    (ed: Editor) => {
      if (!pageId || !ed) return;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(() => {
        const store = useBlockStore.getState();
        const { dirtySet, deletedSet } = store;

        // 1. 无脏数据，不必提取也不必请求，直接休息
        if (dirtySet.size === 0 && deletedSet.size === 0) return;

        // 2. 处理父页面结构变动 (增删移导致排序变了)
        if (dirtySet.has(pageId)) {
          const currentChildIds: string[] = [];
          // ed.state.doc.forEach 只遍历第一层，O(一级节点数)，极快！
          ed.state.doc.forEach((node) => {
            if (node.isBlock && node.attrs?.blockId) {
              currentChildIds.push(node.attrs.blockId);
            }
          });
          store.updatePageStructure(pageId, currentChildIds);
        }

        // 3. 核心：精准提取变脏的具体节点数据
        // 只有当存在除父页面以外的真实 block 变脏时才遍历
        const contentDirtyIds = new Set(dirtySet);
        contentDirtyIds.delete(pageId); // 排除掉父页面 ID

        if (contentDirtyIds.size > 0) {
          // 在 ProseMirror 内存树中进行极速扫描
          ed.state.doc.descendants((node) => {
            const id = node.attrs?.blockId;
            if (node.isBlock && id && contentDirtyIds.has(id)) {
              
              // json() 临时转成可读 JSONContent 以复用我们的 parser
              const jsonNode = node.toJSON();
              const content = parseTiptapNodeToInlineContent(jsonNode);
              const props = parseTiptapNodeToProps(jsonNode);
              
              // 实时写回 Store
              store.updateSingleBlockData(id, content, props);
              
              // 优化：如果在树中已经找齐了所有脏节点，提前结束树便利
              contentDirtyIds.delete(id);
              if (contentDirtyIds.size === 0) return false; 
            }
            return true; // 继续遍历子树
          });
        }

        // 4. 从 Store 获取组装好的极简 payload 发给后端
        const payload = store.getSyncPayload();
        console.log("test payload 改变的block数据", payload);
        const hasChanges =
          payload.updated_blocks.length > 0 || payload.deleted_blocks.length > 0;

        if (hasChanges) {
          sync(payload);
          store.clearDirtyState();
        }
      }, DEBOUNCE_MS);
    },
    [pageId, sync],
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: hydrateToTiptap(getPageBlocks(pageId)),
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
      //console.log('ignore: my test point: --- Tiptap JSON Output ---', JSON.stringify(ed.getJSON(), null, 2));
      triggerSync(ed as Editor);
    },
  });

  // 切换活跃页面时重置编辑器内容和标题
  // 关键：跳过首次挂载，避免 useEditor 初始化后又立刻 setContent 导致内容闪烁
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // 首次挂载：prevPageIdRef 与 pageId 相同，跳过（useEditor 已加载初始内容）
    if (prevPageIdRef.current === pageId) {
      // 但需要加载标题
      if (pageId) {
        const { blocksById } = useBlockStore.getState();
        const page = blocksById[pageId];
        if (page && 'title' in page.props) {
          setPageTitle(page.props.title);
        }
      }
      return;
    }

    // 真正切换页面了：替换文档内容和标题
    prevPageIdRef.current = pageId ?? null;
    const blocks = getPageBlocks(pageId);
    const newContent = hydrateToTiptap(blocks);
    
    // 加载页面标题
    if (pageId) {
      const { blocksById } = useBlockStore.getState();
      const page = blocksById[pageId];
      const title = (page && 'title' in page.props) ? page.props.title : '未命名';
      setPageTitle(title);
      
      // 如果是新创建的页面（标题为"未命名"），自动聚焦标题输入框
      if (title === '未命名') {
        setTimeout(() => {
          titleInputRef.current?.focus();
          titleInputRef.current?.select();
        }, 100);
      }
    }
    
    // emitUpdate: false 防止切换页面触发 onUpdate → 不必要的同步
    editor.commands.setContent(newContent, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // 处理标题变更（防抖同步）
  const handleTitleChange = useCallback((newTitle: string) => {
    setPageTitle(newTitle);
    
    if (!pageId) return;
    
    // 清除之前的定时器
    if (titleDebounceTimer.current) {
      clearTimeout(titleDebounceTimer.current);
    }
    
    // 防抖更新到 Store
    titleDebounceTimer.current = setTimeout(() => {
      const store = useBlockStore.getState();
      const page = store.blocksById[pageId];
      
      if (page && 'title' in page.props) {
        // 更新页面标题
        store.updateSingleBlockData(pageId, page.content, {
          ...page.props,
          title: newTitle,
        });
        
        // 标记为脏数据
        store.markBlockDirty(pageId);
        
        // 触发同步
        const payload = store.getSyncPayload();
        if (payload.updated_blocks.length > 0) {
          sync(payload);
        }
      }
    }, DEBOUNCE_MS);
  }, [pageId, sync]);

  // 组件卸载时清理防抖 timer（防止内存泄漏）
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (titleDebounceTimer.current) clearTimeout(titleDebounceTimer.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className={`tiptap-editor-shell ${className}`}>
      {/* 同步状态指示器 */}
      <SyncStatusBar isSyncing={isSyncing} isSyncError={isSyncError} />
      
      {/* 页面元数据区域 */}
      <div className="page-metadata px-16 pt-12 pb-4">
        <input
          ref={titleInputRef}
          type="text"
          value={pageTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="未命名"
          className="w-full text-4xl font-bold bg-transparent border-none outline-none 
                     text-app-fg-deep placeholder:text-app-fg-light/40
                     focus:outline-none focus:ring-0"
          spellCheck={false}
        />
        <div className="mt-2 text-xs text-app-fg-light">
          Press 'space' for AI or '/' for commands
        </div>
      </div>
      
      {/* 编辑器内容区 */}
      <div className="px-16 pb-12">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 同步状态指示器（轻量 UI，仅在需要时渲染）
// ─────────────────────────────────────────────────────────────────────────────

interface SyncStatusBarProps {
  isSyncing: boolean;
  isSyncError: boolean;
}

function SyncStatusBar({ isSyncing, isSyncError }: SyncStatusBarProps) {
  // 全部正常时不渲染（保持 DOM 干净）
  if (!isSyncing && !isSyncError) return null;

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
