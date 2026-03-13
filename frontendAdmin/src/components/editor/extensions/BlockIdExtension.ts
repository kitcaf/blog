/**
 * @file BlockIdExtension.ts
 * @description Tiptap 全局扩展：为所有 Block 级节点注入 `blockId` 属性。
 *
 * 设计意图：
 *  - 每个 Tiptap 节点携带 `blockId`，使 dehydrate 时能精确匹配回 Zustand Store 中对应的 Block。
 *  - 避免每次 Tiptap 内容变化时重新生成 UUID，保持 dirty tracking 的精确性。
 *  - 使用 `addGlobalAttributes` 一次性覆盖所有 block 类型，无需在每个扩展中重复定义。
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Transaction, EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** 需要追踪 blockId 的 Tiptap 内置 block 节点类型 */
const TRACKED_NODE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'listItem',  // 用于 bulletList / orderedList 内的每个 listItem
  'taskItem',  // 用于 checkList 内的每个 taskItem
] as const;

export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: [...TRACKED_NODE_TYPES],
        attributes: {
          blockId: {
            default: null,
            /** 反序列化 HTML 时读取 data-block-id */
            parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id'),
            /** 序列化为 HTML 时输出 data-block-id，只有存在时才输出 */
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs['blockId'] ? { 'data-block-id': attrs['blockId'] } : {},
          },
        },
      },
    ];
  },

  /**
   * 监听编辑器事务（Tiptap 内部 ProseMirror 的 API）。
   * 每次文档发生变化后，扫描变动的节点。如果发现原本需要 blockId 的节点没 id，
   * 立刻生成一个 UUID 并通过全新的 Transaction 写回文档。
   * addProseMirrorPlugins 可以捕获所有的事务，包括 Enter、Backspace 等操作
   */
  addProseMirrorPlugins() {
    const trackedTypes = new Set(TRACKED_NODE_TYPES as readonly string[]);

    return [
      new Plugin({
        key: new PluginKey('blockIdInjector'),
        appendTransaction: (transactions: readonly Transaction[], _oldState: EditorState, newState: EditorState) => {
          // 如果没有任何文档变动，直接跳过
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }

          // 如果最新的事务已经标记为 ID 注入，避免死循环（虽然 tr 处理本身通常足够，但这里做个双保险）
          if (transactions.some(tr => tr.getMeta('isIdInjection'))) {
            return null;
          }
          
          const tr = newState.tr;
          let modified = false;
          const seenIds = new Set<string>();

          // 遍历文档树，确保每一个 block 节点都有唯一的 blockId
          newState.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (node.isBlock && trackedTypes.has(node.type.name)) {
              const currentId = node.attrs.blockId as string | undefined;
              
              if (!currentId || seenIds.has(currentId)) {
                // 生成新的 UUID：处理两种情况 1. 它是刚诞生的新节点（空ID） 2. 它是切块分裂产生的副本（重复ID）
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  blockId: crypto.randomUUID(),
                });
                modified = true;
              } else {
                seenIds.add(currentId);
              }
            }
          });

          if (modified) {
             // 标记为 ID 注入事务，防止无限循环
             tr.setMeta('isIdInjection', true);
             return tr;
          }
          return null;
        },
      }),
    ];
  },
});
