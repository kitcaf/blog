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
});
