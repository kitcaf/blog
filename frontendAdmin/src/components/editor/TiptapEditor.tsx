import { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useSyncStore } from '@/store/useSyncStore';
import { createEditorExtensions } from './extensions';
import { useEditorSyncController } from './sync/useEditorSyncController';
import { useBlockSyncMutation, usePageBlocksQuery, usePageDetailQuery } from '@/hooks/useBlocksQuery';
import { PageHeader } from './components/PageHeader';

interface TiptapEditorProps {
  className?: string;
  pageId?: string;
}

export function TiptapEditor({ className = '', pageId }: TiptapEditorProps) {
  const { page, isLoading: pageLoading } = usePageDetailQuery(pageId ?? null);
  const { blocks, isLoading: blocksLoading } = usePageBlocksQuery(pageId ?? null);
  console.log("初始数据", blocks)
  const { sync } = useBlockSyncMutation(pageId ?? null, {
    onSuccess: () => {
      useSyncStore.getState().setSyncing(false);
    },
    onError: () => {
      useSyncStore.getState().setError(true);
    },
  });

  const editor = useEditor(
    {
      extensions: createEditorExtensions(),
      editorProps: {
        attributes: {
          class: 'prosemirror-editor outline-none',
        },
      },
    },
    [pageId],
  );

  const { scheduleTitleSync } = useEditorSyncController({
    editor,
    pageId,
    page,
    blocks,
    sync: (request) => {
      useSyncStore.getState().setSyncing(true);
      sync(request);
    },
  });

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      scheduleTitleSync(newTitle);
    },
    [scheduleTitleSync],
  );

  const handleTitleEnter = useCallback(() => {
    editor?.commands.focus('start');
  }, [editor]);

  if (pageLoading || blocksLoading) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[400px]`}>
        <div className="text-app-fg-light text-sm">加载中...</div>
      </div>
    );
  }

  if (!editor) {
    return null;
  }

  return (
    <div className={className}>
      <div className="px-16 pt-12 pb-4">
        <PageHeader
          initialTitle={page && 'title' in page.props ? (page.props.title as string) : '未命名'}
          onTitleChange={handleTitleChange}
          onEnter={handleTitleEnter}
          isPageLoaded={Boolean(page)}
        />
      </div>
      <div className="px-16 pb-12">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
