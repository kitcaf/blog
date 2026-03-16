import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useBlockStore } from '@/store/useBlockStore';
import { useSyncStore } from '@/store/useSyncStore';
import { createEditorExtensions } from './extensions';
import { hydrateToTiptap } from './converter';
import { useBlockSyncMutation, usePageBlocksQuery, usePageDetailQuery } from '@/hooks/useBlocksQuery';
import { PageHeader } from './components/PageHeader';

const DEBOUNCE_MS = 1000;

interface TiptapEditorProps {
  className?: string;
  pageId?: string;
}

export function TiptapEditor({ className = '', pageId }: TiptapEditorProps) {
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedPageRef = useRef<string | null>(null);

  // 1. 数据查询
  const { page, isLoading: pageLoading } = usePageDetailQuery(pageId ?? null);
  const { blocks, isLoading: blocksLoading } = usePageBlocksQuery(pageId ?? null);
  const { sync } = useBlockSyncMutation(pageId ?? null, {
    onSuccess: () => {
      useSyncStore.getState().setSyncing(false);
    },
    onError: () => {
      useSyncStore.getState().setError(true);
    },
  });

  // 2. 缓存计算值（优化 2）
  const serverTitle = useMemo(
    () => (page && 'title' in page.props ? (page.props.title as string) : '未命名'),
    [page]
  );

  const isPageLoaded = useMemo(() => !!page, [page]);

  // 3. 数据状态水合
  useEffect(() => {
    if (!page || !pageId || blocks.length === 0) return;
    useBlockStore.getState().hydratePage(blocks);
  }, [page, blocks, pageId]);

  // 4. 同步逻辑（防抖）
  const triggerSync = useCallback(() => {
    if (!pageId) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);

    syncTimer.current = setTimeout(() => {
      const store = useBlockStore.getState();
      const payload = store.getSyncPayload();
      if (payload.updated_blocks.length > 0 || payload.deleted_blocks.length > 0) {
        useSyncStore.getState().setSyncing(true);
        sync(payload);
      }
    }, DEBOUNCE_MS);
  }, [pageId, sync]);

  // 5. 编辑器更新处理
  const handleEditorUpdate = useCallback(() => {
    if (!pageId) return;
    triggerSync();
  }, [pageId, triggerSync]);

  // 6. 初始化编辑器
  const editor = useEditor({
    extensions: createEditorExtensions(pageId ?? null),
    editorProps: {
      attributes: {
        class: 'prosemirror-editor outline-none',
      },
    },
    onUpdate: ({ transaction }) => {
      if (transaction.getMeta('preventUpdate') || transaction.getMeta('isIdInjection')) {
        return;
      }
      handleEditorUpdate();
    },
  }, [pageId]);

  // 7. 初始化水合到编辑器
  useEffect(() => {
    if (!editor || !page || !pageId || blocks.length === 0) return;
    if (initializedPageRef.current === pageId) return;

    const store = useBlockStore.getState();
    const pageBlock = store.blocksById[pageId];
    if (!pageBlock) return;

    const contentBlocks = pageBlock.contentIds
      .map((id) => store.blocksById[id])
      .filter(Boolean);

    const content = hydrateToTiptap(contentBlocks);
    editor.commands.setContent(content, { emitUpdate: false });

    initializedPageRef.current = pageId;
  }, [editor, page, pageId, blocks]);

  // 8. 标题变更处理
  const handleTitleChange = useCallback((newTitle: string) => {
    if (!pageId) return;
    const store = useBlockStore.getState();
    const pageBlock = store.blocksById[pageId];

    if (pageBlock) {
      store.updateSingleBlockData(pageId, pageBlock.content, {
        ...(pageBlock.props || {}),
        title: newTitle,
      });
      store.markBlockDirty(pageId);
      triggerSync();
    }
  }, [pageId, triggerSync]);

  const handleTitleEnter = useCallback(() => {
    editor?.commands.focus('start');
  }, [editor]);

  // 9. 清理定时器
  useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);

  // 加载状态
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
      <div className="px-16 pt-12 pb-4">
        <PageHeader
          initialTitle={serverTitle}
          onTitleChange={handleTitleChange}
          onEnter={handleTitleEnter}
          isPageLoaded={isPageLoaded}
        />
      </div>
      <div className="px-16 pb-12">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
