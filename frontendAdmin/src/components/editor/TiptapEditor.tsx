import { useCallback, memo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { splitPageDocumentBlocks } from "./utils"
import { editorExtensions } from './extensions';
import { useEditorSyncController } from './sync/useEditorSyncController';
import { useBlockSyncRunner } from './sync/useBlockSyncRunner';
import { usePageBlocksQuery } from '@/hooks/useBlocksQuery';
import { cn } from '@/lib/utils';
import { PageHeaderContainer } from './components/PageHeaderContainer';
import { useEditorTheme } from './hooks/useEditorTheme';
import './styles';

interface TiptapEditorProps {
  className?: string;
  pageId?: string;
}

function TiptapEditorComponent({ className = '', pageId }: TiptapEditorProps) {
  const { blocks, isLoading: blocksLoading } = usePageBlocksQuery(pageId ?? null);
  const { sync } = useBlockSyncRunner(pageId ?? null);
  const { pageBlock, contentBlocks } = splitPageDocumentBlocks(blocks, pageId);
  const { editorCssVars, editorThemeClassName } = useEditorTheme();
  console.log("TiptapEditorComponent render", blocks)
  const editor = useEditor(
    {
      extensions: editorExtensions,
      editorProps: {
        attributes: {
          class: 'prosemirror-editor outline-none',
        },
      },
    },
    [pageId],
  );

  const { scheduleSync, flushSync } = useEditorSyncController({
    editor,
    pageId,
    pageBlock,
    contentBlocks,
    isBlocksLoading: blocksLoading,
    sync,
  });

  const handleTitleEnter = useCallback(() => {
    editor?.commands.focus('start');
  }, [editor]);

  if (blocksLoading) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[400px]`}>
        <div className="text-app-fg-light text-sm">加载中...</div>
      </div>
    );
  }

  if (!editor) {
    return null;
  }

  if (!pageBlock) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[400px]`}>
        <div className="text-app-fg-light text-sm">页面数据异常</div>
      </div>
    );
  }

  return (
    <div
      className={cn(className, editorThemeClassName)}
      style={editorCssVars}
    >
      <div className="px-16">
        <PageHeaderContainer
          key={pageId ?? 'page-header'}
          pageId={pageId}
          fallbackTitle={
            'title' in pageBlock.props ? (pageBlock.props.title as string) : '未命名'
          }
          isPageLoaded
          onEnter={handleTitleEnter}
          scheduleSync={scheduleSync}
          flushSync={flushSync}
        />
      </div>
      <div className="px-16 pb-12">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// 使用 React.memo 优化：只在 pageId 变化时重渲染
// 忽略 page 和 blocks 的变化，因为编辑器内容由 Tiptap 内部管理
export const TiptapEditor = memo(TiptapEditorComponent, (prevProps, nextProps) => {
  // 返回 true 表示不重渲染，返回 false 表示需要重渲染
  // 只有 pageId 变化时才重渲染
  return prevProps.pageId === nextProps.pageId && prevProps.className === nextProps.className;
});

TiptapEditor.displayName = 'TiptapEditor';
