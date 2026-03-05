/**
 * @file CalloutNode.tsx
 * @description Tiptap 自定义 Node：Callout 提示框。
 *
 * 对应 Block 类型：CalloutBlock（variant: info | warning | error | success）
 *
 * 使用 ReactNodeViewRenderer 渲染：
 *  - 外壳（图标 + 背景样式）由 CalloutNodeView 负责
 *  - 可编辑的内联文本区域由 <NodeViewContent /> 负责（Tiptap ProseMirror 托管）
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import type { CalloutVariant } from '@blog/types';

// ─────────────────────────────────────────────
// React NodeView 组件
// ─────────────────────────────────────────────

const VARIANT_STYLES: Record<CalloutVariant, { icon: string; cls: string }> = {
  info:    { icon: '💡', cls: 'bg-app-hover border-border text-app-fg' },
  warning: { icon: '⚠️', cls: 'bg-yellow-900/20 border-yellow-800/50 text-yellow-200' },
  error:   { icon: '🚨', cls: 'bg-red-900/20 border-red-800/50 text-red-200' },
  success: { icon: '✅', cls: 'bg-green-900/20 border-green-800/50 text-green-200' },
};

function CalloutNodeView({ node }: NodeViewProps) {
  const variant = (node.attrs.variant as CalloutVariant) ?? 'info';
  const { icon, cls } = VARIANT_STYLES[variant] ?? VARIANT_STYLES.info;

  return (
    <NodeViewWrapper>
      <div className={`p-4 my-4 rounded-xl flex gap-3 border ${cls}`}>
        <div className="shrink-0 select-none text-base leading-relaxed">{icon}</div>
        {/* NodeViewContent 是 Tiptap 托管的可编辑区域，不可移除 */}
        <div className="flex-1 min-w-0">
          <NodeViewContent className="outline-none" />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// ─────────────────────────────────────────────
// Tiptap Node 定义
// ─────────────────────────────────────────────

export const CalloutNode = Node.create({
  name: 'callout',

  /** block 级节点，可与 paragraph/heading 并列 */
  group: 'block',

  /** 允许内联内容（文本 + marks）*/
  content: 'inline*',

  /** 允许在 Tiptap 内部通过 backtick 等快捷方式创建 */
  defining: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-block-id'),
        renderHTML: (attrs) => (attrs.blockId ? { 'data-block-id': attrs.blockId } : {}),
      },
      variant: {
        default: 'info' as CalloutVariant,
        parseHTML: (el) => el.getAttribute('data-variant') as CalloutVariant,
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'callout' }, HTMLAttributes), 0];
  },

  /** 使用 React 组件渲染，保持与全局 Tailwind 样式一致 */
  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },
});
