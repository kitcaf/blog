import { useEffect, useRef, useCallback, memo } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useBlockStore } from '@/store/useBlockStore';
import { createEditorExtensions } from './extensions';
import { hydrateToTiptap, parseTiptapNodeToInlineContent, parseTiptapNodeToProps } from './converter';
import { useBlockSyncMutation, usePageBlocksQuery, usePageDetailQuery } from '@/hooks/useBlocksQuery';
import { PageHeader } from './components/PageHeader';

const DEBOUNCE_MS = 1000;

interface TiptapEditorProps {
  className?: string;
  pageId?: string;
}

export function TiptapEditor({ className = '', pageId }: TiptapEditorProps) {
  // 1. 获取到的数据状态映射与水合
  const { page, isLoading: pageLoading } = usePageDetailQuery(pageId ?? null);
  const { blocks, isLoading: blocksLoading } = usePageBlocksQuery(pageId ?? null);
  // console.log('数据源block数据（包含type='page'的block的数据）', blocks)
  // console.log('数据源page', page)

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedPageRef = useRef<string | null>(null); // 防线：记录哪些页面已完成初始水合

  const { sync, isSyncing, isError: isSyncError } = useBlockSyncMutation(pageId ?? null);

  // 2. 获取到的数据状态映射与水合
  useEffect(() => {
    if (!page || !pageId || blocks.length === 0) return;
    useBlockStore.getState().hydratePage(blocks);
  }, [page, blocks, pageId]);

  // 服务器标题源数据
  const serverTitle = page && 'title' in page.props ? (page.props.title as string) : '未命名';

  // 3. 同步逻辑 (通用防抖)
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

  // 4. 编辑器内容处理逻辑
  const handleEditorUpdate = useCallback((ed: Editor) => {
    if (!pageId) return;

    const store = useBlockStore.getState();
    const { dirtySet } = store;

    if (dirtySet.size > 0) {
      const dirtyIds = new Set(dirtySet);
      dirtyIds.delete(pageId);

      if (dirtyIds.size > 0) {
        ed.state.doc.descendants((node) => {
          const id = node.attrs?.blockId;
          if (node.isBlock && id && dirtyIds.has(id)) {
            const jsonNode = node.toJSON();
            const content = parseTiptapNodeToInlineContent(jsonNode);
            const props = parseTiptapNodeToProps(jsonNode);
            store.updateSingleBlockData(id, content, props);
            dirtyIds.delete(id);
            if (dirtyIds.size === 0) return false;
          }
          return true;
        });
      }
    }
    triggerSync();
  }, [pageId, triggerSync]);

  // 5. 初始化编辑器
  const editor = useEditor({
    extensions: createEditorExtensions(pageId ?? null),
    editorProps: {
      attributes: {
        class: 'prosemirror-editor outline-none',
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      console.log("测试更新，Tiptap 内部维护数据", editor.getJSON())
      if (transaction.getMeta('preventUpdate') || transaction.getMeta('isIdInjection')) {
        return;
      }
      handleEditorUpdate(ed as Editor);
    },
  }, [pageId]);

  // 6. 监听外部数据变化水合到编辑器（仅初始化）
  useEffect(() => {
    if (!editor || !page || !pageId) return;

    // 重点防线：如果当前 pageId 已经成功水合过，则直接返回。
    // 这防止了 React Query 发生 refetch 时（如窗口聚焦切换），新的 page 对象触发 useEffect，
    // 导致 editor.commands.setContent() 覆盖掉用户正在编写的内容！
    if (initializedPageRef.current === pageId) return;

    const store = useBlockStore.getState();
    const pageBlock = store.blocksById[pageId];
    if (!pageBlock) return;

    // 根据页面的 contentIds 数组（规定展示顺序），从 store 取出对应的 block 实体
    const contentBlocks = pageBlock.contentIds
      .map((id) => store.blocksById[id])
      .filter(Boolean);

    // 转换成tiptap格式
    const content = hydrateToTiptap(contentBlocks);
    // Tiptap 内部生成了一棵节点数据
    editor.commands.setContent(content, { emitUpdate: false });

    // 该页面已成功完成初始水合，拒绝二次外部数据注入
    initializedPageRef.current = pageId;
  }, [editor, page, pageId]);

  // 7. 标题变更回调
  const handleTitleChange = useCallback((newTitle: string) => {
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

  const handleTitleEnter = useCallback(() => {
    editor?.commands.focus('start');
  }, [editor]);

  useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);

  // 加载中视图隔离
  if (pageLoading || blocksLoading) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[400px]`}>
        <div className="text-app-fg-light text-sm">加载中...</div>
      </div>
    );
  }

  if (!editor) return null;

  return (
    <div className={className}>
      <SyncStatusBar isSyncing={isSyncing} isSyncError={isSyncError} />

      <PageHeader
        initialTitle={serverTitle}
        onTitleChange={handleTitleChange}
        onEnter={handleTitleEnter}
        isPageLoaded={!!page}
      />

      <div className="px-16 pb-12">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

const SyncStatusBar = memo(function SyncStatusBar({
  isSyncing,
  isSyncError
}: {
  isSyncing: boolean;
  isSyncError: boolean;
}) {
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
});

