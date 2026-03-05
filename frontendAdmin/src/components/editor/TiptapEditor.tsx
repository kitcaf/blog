/**
 * @file TiptapEditor.tsx
 * @description 富文本编辑器组件，接入 Tiptap + Zustand Store。
 *
 * 数据流：
 *   切换页面 → store.getState() 读取 blocks → hydrateToTiptap() → editor.setContent()
 *   用户输入 → editor.onUpdate → 防抖 1500ms → dehydrateFromTiptap() → store.replacePage()
 *
 * 性能关键点：
 *   TiptapEditor 不订阅 blocksById 变化（否则编辑者自己触发 onUpdate → replacePage → blocksById 变 → re-render → 循环）
 *   只订阅 activePageId，切换页面时用 getState() 一次性读取
 *   编辑中由 Tiptap 自身管理文档状态，Store 只在防抖后接收快照
 */
import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useBlockStore } from '@/store/useBlockStore';
import { editorExtensions } from './extensions';
import { hydrateToTiptap, dehydrateFromTiptap } from './converter';

/** 防抖延迟（ms）：用户停止输入后 2s 才同步到 Store */
const DEBOUNCE_MS = 2000;

interface TiptapEditorProps {
  className?: string;
}

/**
 * 从 Store 中读取当前活跃页的子 Block 列表（非订阅式，一次性读取）
 */
function getActivePageBlocks() {
  const { activePageId, blocksById } = useBlockStore.getState();
  if (!activePageId) return [];
  const page = blocksById[activePageId];
  if (!page) return [];
  return page.contentIds
    .map((id) => blocksById[id])
    .filter(Boolean);
}

export function TiptapEditor({ className = '' }: TiptapEditorProps) {
  // 只订阅 activePageId（基本类型，=== 比较稳定，不会无限循环）
  const activePageId = useBlockStore((s) => s.activePageId);
  // 直接订阅单个 action（闭包引用稳定）
  const replacePage = useBlockStore((s) => s.replacePage);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 防抖同步回调：将 Tiptap 文档脱水后写入 Store。
   * 用 useCallback 包裹并依赖 activePageId，确保闭包中的 pageId 是最新的。
   */
  const debouncedSync = useCallback(
    (editorJSON: ReturnType<typeof JSON.parse>) => {
      if (!activePageId) return;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(() => {
        const parentPath = `/${activePageId}/`;
        const newBlocks = dehydrateFromTiptap(editorJSON, activePageId, parentPath);
        replacePage(activePageId, newBlocks);
      }, DEBOUNCE_MS);
    },
    [activePageId, replacePage],
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
    onUpdate: ({ editor: ed }) => {
      debouncedSync(ed.getJSON());
    },
  });

  // 切换活跃页面时重置编辑器内容
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const blocks = getActivePageBlocks();
    const newContent = hydrateToTiptap(blocks);
    editor.commands.setContent(newContent, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId]);

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
