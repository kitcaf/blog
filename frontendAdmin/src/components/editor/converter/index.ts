/**
 * @file converter/index.ts
 * @description Block[] ↔ Tiptap JSONContent 的双向转换器（hydrate / dehydrate）。
 *
 * 关键映射对照：
 *  Block.type            │ Tiptap node.type
 *  ──────────────────────┼─────────────────────────────
 *  'heading' (level 1-3) │ 'heading' (attrs.level)
 *  'paragraph'           │ 'paragraph'
 *  'quote'               │ 'blockquote' > 'paragraph'
 *  'code'                │ 'codeBlock' (attrs.language)
 *  'divider'             │ 'horizontalRule'
 *  'bulletListItem'      │ 'bulletList' > 'listItem' > 'paragraph'  (N 个连续项合并)
 *  'numberedListItem'    │ 'orderedList' > 'listItem' > 'paragraph'
 *  'checkListItem'       │ 'taskList' > 'taskItem' > 'paragraph'
 *  'callout'             │ 'callout' (attrs.variant)     [自定义 Node]
 *  'image'               │ 'image' (attrs.src/...)       [扩展官方 Image]
 *
 * 类型策略：
 *  Tiptap v3 的 `JSONContent` 将 `type` 定义为可选（`type?: string`），
 *  与我们内部构建的字面量（`type: string` 必填）存在结构冲突。
 *  解法：内部使用 `TNode`（type 必填）进行构建，在函数出口处统一转换为 `JSONContent`。
 */
import type { JSONContent } from '@tiptap/core';
import type {
  Block,
  BlockData,
  InlineContent,
  InlineStyle,
  BulletListItemBlock,
  NumberedListItemBlock,
  CheckListItemBlock,
} from '@blog/types';

/**
 * 内部轻量节点类型：type 为必填，结构与 JSONContent 兼容。
 * 用于所有内部构建函数，避免 JSONContent 的 `type?: string` 可选问题。
 */
type TNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TNode[];
  marks?: TNode[];
};

/** 将内部 TNode 安全转换为 JSONContent（结构兼容，类型断言合法） */
const toJSONContent = (node: TNode): JSONContent => node as unknown as JSONContent;

// ─────────────────────────────────────────────
// hydrate：Block[] → Tiptap JSONContent
// ─────────────────────────────────────────────

/**
 * 将当前活跃页面的 Block 有序数组转为 Tiptap 文档结构。
 *
 * 核心挑战：连续的列表块需要合并为 Tiptap 的列表容器节点：
 *   [BulletListItemBlock, BulletListItemBlock] → bulletList > [listItem, listItem]
 */
export function hydrateToTiptap(blocks: BlockData[]): JSONContent {
  if (blocks.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  const nodes: TNode[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    // ── 连续 bulletListItem 合并 ──────────────────────────────
    if (block.type === 'bulletListItem') {
      const items: BulletListItemBlock[] = [];
      while (i < blocks.length && blocks[i].type === 'bulletListItem') {
        items.push(blocks[i] as BulletListItemBlock);
        i++;
      }
      nodes.push({
        type: 'bulletList',
        content: items.map((item) => ({
          type: 'listItem',
          attrs: { blockId: item.id },
          content: [{ type: 'paragraph', content: buildInlineNodes(item.content) }],
        })),
      });
      continue;
    }

    // ── 连续 numberedListItem 合并 ────────────────────────────
    if (block.type === 'numberedListItem') {
      const items: NumberedListItemBlock[] = [];
      while (i < blocks.length && blocks[i].type === 'numberedListItem') {
        items.push(blocks[i] as NumberedListItemBlock);
        i++;
      }
      nodes.push({
        type: 'orderedList',
        content: items.map((item) => ({
          type: 'listItem',
          attrs: { blockId: item.id },
          content: [{ type: 'paragraph', content: buildInlineNodes(item.content) }],
        })),
      });
      continue;
    }

    // ── 连续 checkListItem 合并 ───────────────────────────────
    if (block.type === 'checkListItem') {
      const items: CheckListItemBlock[] = [];
      while (i < blocks.length && blocks[i].type === 'checkListItem') {
        items.push(blocks[i] as CheckListItemBlock);
        i++;
      }
      nodes.push({
        type: 'taskList',
        content: items.map((item) => ({
          type: 'taskItem',
          attrs: { blockId: item.id, checked: item.props.checked ?? false },
          content: [{ type: 'paragraph', content: buildInlineNodes(item.content) }],
        })),
      });
      continue;
    }

    // ── 单个块转换 ────────────────────────────────────────────
    const node = blockToTNode(block);
    if (node) nodes.push(node);
    i++;
  }

  return toJSONContent({
    type: 'doc',
    content: nodes.length ? nodes : [{ type: 'paragraph' }],
  });
}

/** 单个 Block → TNode（不含列表容器逻辑）*/
function blockToTNode(block: Block): TNode | null {
  switch (block.type) {
    case 'paragraph':
      return {
        type: 'paragraph',
        attrs: { blockId: block.id },
        content: buildInlineNodes(block.content),
      };

    case 'heading':
      return {
        type: 'heading',
        attrs: { level: block.props.level, blockId: block.id },
        content: buildInlineNodes(block.content),
      };

    case 'quote':
      return {
        type: 'blockquote',
        attrs: { blockId: block.id },
        content: [{ type: 'paragraph', content: buildInlineNodes(block.content) }],
      };

    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: block.props.language, blockId: block.id },
        content: block.content[0]?.text
          ? [{ type: 'text', text: block.content[0].text }]
          : [],
      };

    case 'divider':
      return { type: 'horizontalRule', attrs: { blockId: block.id } };

    case 'callout':
      return {
        type: 'callout',
        attrs: { variant: block.props.variant, blockId: block.id },
        content: buildInlineNodes(block.content),
      };

    case 'image':
      return {
        type: 'image',
        attrs: {
          blockId: block.id,
          src: block.props.url,
          alt: block.props.caption ?? null,
          title: block.props.caption ?? null,
          alignment: block.props.alignment ?? 'center',
          width: block.props.width ?? 100,
        },
      };

    case 'page':
      // Page 块由侧边栏展示，不渲染为 Tiptap 节点
      return null;

    default:
      // 不认识的块类型，降级为纯文本段落
      return {
        type: 'paragraph',
        attrs: { blockId: block.id },
        content: [{ type: 'text', text: `[不支持的块类型: ${block.type}]` }],
      };
  }
}

/** InlineContent[] → TNode[]（用于放入 paragraph/heading 等块的 content） */
function buildInlineNodes(content: InlineContent[]): TNode[] {
  return content.map((node): TNode => {
    if (node.type === 'link') {
      return {
        type: 'text',
        text: node.text,
        marks: [
          { type: 'link', attrs: { href: node.href } },
          ...styleToMarkNodes(node.styles),
        ],
      };
    }

    const marks = styleToMarkNodes(node.styles);
    return {
      type: 'text',
      text: node.text,
      ...(marks.length ? { marks } : {}),
    };
  });
}

/** InlineStyle → TNode mark 数组 */
function styleToMarkNodes(styles?: InlineStyle): TNode[] {
  if (!styles) return [];
  const marks: TNode[] = [];
  if (styles.bold)          marks.push({ type: 'bold' });
  if (styles.italic)        marks.push({ type: 'italic' });
  if (styles.underline)     marks.push({ type: 'underline' });
  if (styles.strikethrough) marks.push({ type: 'strike' });
  if (styles.code)          marks.push({ type: 'code' });
  return marks;
}

// ─────────────────────────────────────────────
// 局部脱水：用于 DirtyTracker 的增量更新
// ─────────────────────────────────────────────
/**
 * 局部脱水：仅解析单个 Tiptap JSONContent 的 InlineContent
 */
export function parseTiptapNodeToInlineContent(node: JSONContent): InlineContent[] {
  // 特殊处理列表项：listItem 和 taskItem 的内容在子节点 paragraph 中
  if (node.type === 'listItem' || node.type === 'taskItem') {
    const paragraph = node.content?.[0];
    if (paragraph?.type === 'paragraph') {
      return parseInlineContent(paragraph.content);
    }
    return [];
  }
  
  // blockquote 的文本在它的子节点 paragraph 里
  if (node.type === 'blockquote') {
     const inner = node.content?.[0]?.content ?? [];
     return parseInlineContent(inner);
  }
  
  // 列表容器节点（bulletList/orderedList/taskList）没有直接内容
  if (node.type?.endsWith('List')) {
    return [];
  }
  
  return parseInlineContent(node.content);
}

/**
 * 局部脱水：仅解析单个 Tiptap JSONContent 的 Type，映射回 Block 类型
 */
export function parseTiptapNodeType(typeName: string): string {
  switch (typeName) {
    case 'paragraph':      return 'paragraph';
    case 'heading':        return 'heading';
    case 'blockquote':     return 'quote';
    case 'codeBlock':      return 'code';
    case 'horizontalRule': return 'divider';
    case 'listItem':       return 'bulletListItem'; // 默认值，实际由于扁平化可能需要父级上下文判别，但在局部提取时先保证基础映射
    case 'taskItem':       return 'checkListItem';
    case 'callout':        return 'callout';
    case 'image':
    case 'imageBlock':     return 'image';
    default:               return 'paragraph';
  }
}

/**
 * 局部脱水：仅解析单个 Tiptap JSONContent 的 Props
 */
export function parseTiptapNodeToProps(node: JSONContent): Record<string, unknown> {
  const attrs = node.attrs || {};
  switch (node.type) {
    case 'heading':
      return { level: attrs['level'] ?? 1 };
    case 'codeBlock':
      return { language: attrs['language'] ?? 'plaintext' };
    case 'checkListItem':
    case 'taskItem':
      return { checked: attrs['checked'] ?? false };
    case 'callout':
      return { variant: attrs['variant'] ?? 'info' };
    case 'image':
    case 'imageBlock':
      return {
        url: attrs['src'] ?? attrs['url'] ?? '',
        caption: attrs['caption'] ?? attrs['alt'] ?? attrs['title'] ?? undefined,
        alignment: attrs['alignment'] ?? 'center',
        width: attrs['width'] ?? 100,
      };
    default:
      return {};
  }
}

// ─────────────────────────────────────────────
// 内部辅助函数
// ─────────────────────────────────────────────

/** Tiptap content（JSONContent[]）→ InlineContent[] */
function parseInlineContent(content?: JSONContent[]): InlineContent[] {
  if (!content) return [];

  return content.flatMap((node): InlineContent[] => {
    if (node.type !== 'text') return [];

    const styles = parseMarksToStyle(node.marks);
    const linkMark = node.marks?.find((m) => m.type === 'link');

    if (linkMark) {
      return [
        {
          type: 'link',
          text: node.text ?? '',
          href: (linkMark.attrs?.['href'] as string) ?? '',
          styles: hasStyles(styles) ? styles : undefined,
        },
      ];
    }

    return [
      {
        type: 'text',
        text: node.text ?? '',
        styles: hasStyles(styles) ? styles : undefined,
      },
    ];
  });
}

/** Tiptap marks（JSONContent[]）→ InlineStyle */
function parseMarksToStyle(marks?: JSONContent[]): InlineStyle {
  if (!marks) return {};
  const styles: InlineStyle = {};
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':      styles.bold = true;          break;
      case 'italic':    styles.italic = true;        break;
      case 'underline': styles.underline = true;     break;
      case 'strike':    styles.strikethrough = true; break;
      case 'code':      styles.code = true;          break;
    }
  }
  return styles;
}

/** 判断 InlineStyle 是否有任何有效属性（避免存储空对象） */
function hasStyles(styles: InlineStyle): boolean {
  return Object.values(styles).some(Boolean);
}
