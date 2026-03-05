/**
 * @file ImageBlockNode.tsx
 * @description Tiptap 自定义 Node：图片块（原子节点，无内联子内容）。
 *
 * 对应 Block 类型：ImageBlock（url, caption, alignment, width）
 */
import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/react';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

// ─────────────────────────────────────────────
// React NodeView 组件
// ─────────────────────────────────────────────

function ImageBlockNodeView({ node, selected }: NodeViewProps) {
  const url       = node.attrs['url'] as string ?? '';
  const caption   = node.attrs['caption'] as string | undefined;
  const alignment = (node.attrs['alignment'] as 'left' | 'center' | 'right' | 'full') ?? 'center';
  const width     = (node.attrs['width'] as number) ?? 100;

  const justifyMap = {
    left:   'justify-start',
    center: 'justify-center',
    right:  'justify-end',
    full:   'justify-center',
  } as const;

  const justify  = justifyMap[alignment];
  const imgWidth = alignment === 'full' ? '100%' : `${width}%`;

  return (
    <NodeViewWrapper>
      <div className={`my-6 flex flex-col ${justify}`} contentEditable={false}>
        <img
          src={url}
          alt={caption ?? 'Block image'}
          draggable={false}
          loading="lazy"
          className={[
            'rounded-xl max-w-full transition-[outline-color]',
            selected
              ? 'outline outline-2 outline-blue-500'
              : 'outline outline-1 outline-border/50',
          ].join(' ')}
          style={{ width: imgWidth }}
        />
        {caption && (
          <p className="mt-2 text-sm text-app-fg-light text-center select-none">
            {caption}
          </p>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// ─────────────────────────────────────────────
// Tiptap Node 定义
// ─────────────────────────────────────────────

export const ImageBlockNode = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,    // 不可分割原子节点
  content: '',
  draggable: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-block-id'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['blockId'] ? { 'data-block-id': attrs['blockId'] } : {},
      },
      url: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-url'),
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-url': attrs['url'] }),
      },
      caption: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-caption'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['caption'] ? { 'data-caption': attrs['caption'] } : {},
      },
      alignment: {
        default: 'center',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-alignment'),
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-alignment': attrs['alignment'] }),
      },
      width: {
        default: 100,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-width') ?? 100),
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-width': attrs['width'] }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="imageBlock"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', mergeAttributes({ 'data-type': 'imageBlock' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockNodeView);
  },
});
