/**
 * @file TiptapEditor.tsx
 * @description 富文本编辑器组件，接入 Tiptap + Zustand Store。
 *
 * 数据流：
 *   Store.blocksById → hydrateToTiptap() → Tiptap editor 初始内容
 *   用户输入 → editor.onUpdate → 防抖 1500ms → dehydrateFromTiptap() → store.replacePage()
 *
 * 性能考虑：
 *   - useEditor 只在 activePageId 变化时重新创建（不响应块内容变化）
 *   - onUpdate 防抖避免高频同步到 Store
 *   - 使用 useRef 存防抖 timer，不触发 re-render
 */
import { useEffect, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useBlockStore } from '@/store/useBlockStore';
import { selectActivePageContent, selectActions } from '@/store/selectors';
import { editorExtensions } from './extensions';
import { hydrateToTiptap, dehydrateFromTiptap } from './converter';

/** 防抖延迟（ms）：用户停止输入后 1.5s 才同步到 Store */
const DEBOUNCE_MS = 1500;

interface TiptapEditorProps {
  className?: string;
}

export function TiptapEditor({ className = '' }: TiptapEditorProps) {
  const blocks = useBlockStore(selectActivePageContent);
  const activePageId = useBlockStore((s) => s.activePageId);
  const { replacePage } = useBlockStore(selectActions);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 初始 Tiptap 文档（只在 activePageId 变化时重算，避免编辑中反复 hydrate）*/
  const initialContent = useMemo(
    () => hydrateToTiptap(blocks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePageId], // 刻意只依赖 activePageId，切换页面时重建，编辑中不重建
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prosemirror-editor outline-none',
        'data-testid': 'tiptap-editor',
      },
    },
    onUpdate: ({ editor }) => {
      if (!activePageId) return;

      // 清除上次防抖，重新计时
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(() => {
        const doc = editor.getJSON();
        const parentPath = `/${activePageId}/`;
        const newBlocks = dehydrateFromTiptap(doc, activePageId, parentPath);
        replacePage(activePageId, newBlocks);
      }, DEBOUNCE_MS);
    },
  });

  // 切换活跃页面时，重置编辑器内容
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const newContent = hydrateToTiptap(blocks);
    editor.commands.setContent(newContent, { emitUpdate: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId]); // 同上，只在页面切换时触发

  // 组件卸载时清理防抖 timer
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className={`tiptap-editor-shell ${className}`}>
      <EditorContent editor={editor} />
    </div>
  );
}
