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
 *  'image'               │ 'imageBlock' (attrs.url/...)  [自定义 Node]
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
  CalloutVariant,
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
const toJSONContentArray = (nodes: TNode[]): JSONContent[] => nodes as unknown as JSONContent[];

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
        type: 'imageBlock',
        attrs: {
          blockId: block.id,
          url: block.props.url,
          caption: block.props.caption ?? null,
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
// dehydrate：Tiptap JSONContent → Block[]
// ─────────────────────────────────────────────

/**
 * 将 Tiptap 文档 JSON 转换回 Block 扁平数组。
 *
 * 注意：
 *  - 保留 attrs.blockId（若存在）以维持脏追踪精确性
 *  - 新节点（blockId 为 null）调用 crypto.randomUUID() 生成 ID
 *  - blockquote > paragraph、listItem > paragraph 等嵌套结构均会被展平
 * 这里后期要进行diff算法，查找不同
 */
export function dehydrateFromTiptap(
  doc: JSONContent,
  parentId: string,
  parentPath: string,
): Block[] {
  return (doc.content ?? []).flatMap((node) =>
    tiptapNodeToBlocks(node, parentId, parentPath),
  );
}

function tiptapNodeToBlocks(
  node: JSONContent,
  parentId: string,
  parentPath: string,
): Block[] {
  // 经过 BlockIdExtension 的处理，此时所有 block 级节点理论上都必须有 blockId
  let id = node.attrs?.['blockId'] as string | undefined;
  if (!id) {
    console.warn('[Block Converter] 严重警告: 发现缺失 blockId 的节点，这不应该发生。', node);
    // 降级保护：如果真出现了意外，生成一个临时的 UUID 以免崩溃
    id = crypto.randomUUID();
  }
  
  const path = `${parentPath}${id}/`;

  // 共享 BaseBlock 字段（不用 as const，否则 contentIds 变 readonly 与 Block 不兼容）
  const base = { id, parentId, path, contentIds: [] as string[] };

  switch (node.type) {
    case 'paragraph':
      return [{ ...base, type: 'paragraph' as const, props: {}, content: extractInline(node.content) }];

    case 'heading':
      return [
        {
          ...base,
          type: 'heading' as const,
          props: { level: (node.attrs?.['level'] as 1 | 2 | 3) ?? 1 },
          content: extractInline(node.content),
        },
      ];

    case 'blockquote': {
      const inner = node.content?.[0]?.content ?? [];
      return [{ ...base, type: 'quote' as const, props: {}, content: extractInline(inner) }];
    }

    case 'codeBlock':
      return [
        {
          ...base,
          type: 'code' as const,
          props: { language: (node.attrs?.['language'] as string) ?? 'plaintext' },
          content: [{ type: 'text' as const, text: node.content?.[0]?.text ?? '' }],
        },
      ];

    case 'horizontalRule':
      return [{ ...base, type: 'divider' as const, props: {}, content: [] }];

    // ── 列表：展平各 listItem 为独立 Block ──
    case 'bulletList':
      return (node.content ?? []).map((listItemNode): Block => {
        let itemId = listItemNode.attrs?.['blockId'] as string | undefined;
        if (!itemId) {
          console.warn('[Block Converter] bulletListItem 缺失 blockId', listItemNode);
          itemId = crypto.randomUUID();
        }
        const inner = listItemNode.content?.[0]?.content ?? [];
        return {
          id: itemId,
          parentId,
          path: `${parentPath}${itemId}/`,
          contentIds: [],
          type: 'bulletListItem',
          props: {},
          content: extractInline(inner),
        };
      });

    case 'orderedList':
      return (node.content ?? []).map((listItemNode): Block => {
        let itemId = listItemNode.attrs?.['blockId'] as string | undefined;
        if (!itemId) {
          console.warn('[Block Converter] numberedListItem 缺失 blockId', listItemNode);
          itemId = crypto.randomUUID();
        }
        const inner = listItemNode.content?.[0]?.content ?? [];
        return {
          id: itemId,
          parentId,
          path: `${parentPath}${itemId}/`,
          contentIds: [],
          type: 'numberedListItem',
          props: {},
          content: extractInline(inner),
        };
      });

    case 'taskList':
      return (node.content ?? []).map((taskItemNode): Block => {
        let itemId = taskItemNode.attrs?.['blockId'] as string | undefined;
        if (!itemId) {
          console.warn('[Block Converter] checkListItem 缺失 blockId', taskItemNode);
          itemId = crypto.randomUUID();
        }
        const inner = taskItemNode.content?.[0]?.content ?? [];
        return {
          id: itemId,
          parentId,
          path: `${parentPath}${itemId}/`,
          contentIds: [],
          type: 'checkListItem',
          props: { checked: (taskItemNode.attrs?.['checked'] as boolean) ?? false },
          content: extractInline(inner),
        };
      });

    // ── 自定义节点 ──
    case 'callout':
      return [
        {
          ...base,
          type: 'callout' as const,
          props: { variant: ((node.attrs?.['variant'] as CalloutVariant) ?? 'info') },
          content: extractInline(node.content),
        },
      ];

    case 'imageBlock':
      return [
        {
          ...base,
          type: 'image' as const,
          props: {
            url: (node.attrs?.['url'] as string) ?? '',
            caption: node.attrs?.['caption'] as string | undefined,
            alignment: node.attrs?.['alignment'] as 'left' | 'center' | 'right' | 'full' | undefined,
            width: node.attrs?.['width'] as number | undefined,
          },
          content: [],
        },
      ];

    default:
      // 未知 node 类型跳过（不破坏整体数据）
      return [];
  }
}

/** Tiptap content（JSONContent[]）→ InlineContent[] */
function extractInline(content?: JSONContent[]): InlineContent[] {
  if (!content) return [];

  return content.flatMap((node): InlineContent[] => {
    if (node.type !== 'text') return [];

    const styles = extractMarksToStyle(node.marks);
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
function extractMarksToStyle(marks?: JSONContent[]): InlineStyle {
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

// 导出工具函数（供单元测试使用）
export { toJSONContent, toJSONContentArray };
