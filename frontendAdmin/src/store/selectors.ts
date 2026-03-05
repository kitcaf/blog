/**
 * @file selectors.ts
 * @description Zustand 细粒度 selector 函数集合。
 *
 * 为什么要单独维护 selectors？
 *  - Zustand 默认订阅整个 state，任何字段变化都会触发 re-render。
 *  - 通过传入 selector 函数，组件只订阅它关心的那一片数据。
 *  - 结合 subscribeWithSelector 中间件，可进一步实现对象引用稳定性。
 *
 * 用法示例：
 *  ```ts
 *  // ✅ 只有 activePageId 变化时才 re-render
 *  const pageId = useBlockStore(selectActivePageId);
 *
 *  // ✅ 只有该块的 content 变化时才 re-render
 *  const content = useBlockStore(selectBlockContent(blockId));
 *  ```
 */

import type { Block } from '@blog/types';
import type { BlockStore } from './useBlockStore';

// ─────────────────────────────────────────────
// 原子 Selectors
// ─────────────────────────────────────────────

export const selectActivePageId = (state: BlockStore) => state.activePageId;

export const selectRootPageIds = (state: BlockStore) => state.rootPageIds;

export const selectBlocksById = (state: BlockStore) => state.blocksById;

/** 检查当前是否有未同步的变更 */
export const selectIsDirty = (state: BlockStore) => state.dirtyBlockIds.size > 0;

export const selectDirtyCount = (state: BlockStore) => state.dirtyBlockIds.size;

// ─────────────────────────────────────────────
// 工厂 Selectors（接受参数，返回 selector 函数）
// ─────────────────────────────────────────────

/**
 * 按 ID 选取单个 Block。
 * 使用工厂函数让每个组件实例获得独立的 selector 引用，
 * 防止不同 blockId 的组件互相触发 re-render。
 */
export const selectBlock = (id: string) => (state: BlockStore) => state.blocksById[id] as Block | undefined;

/** 选取某个 Block 的 content（最高频更新字段，单独隔离） */
export const selectBlockContent = (id: string) => (state: BlockStore) =>
  state.blocksById[id]?.content;

/** 选取某个 Block 的 props */
export const selectBlockProps = (id: string) => (state: BlockStore) =>
  state.blocksById[id]?.props;

/**
 * 选取当前活跃 Page 下直接子 Block 的有序数组。
 * 这是渲染主编辑区内容的核心 selector。
 */
export const selectActivePageContent = (state: BlockStore): Block[] => {
  const { activePageId, blocksById } = state;
  if (!activePageId) return [];

  const page = blocksById[activePageId];
  if (!page) return [];

  // 按 contentIds 有序映射，过滤掉已被软删除（不在 blocksById 中）的块
  return page.contentIds.reduce<Block[]>((acc, id) => {
    const block = blocksById[id];
    if (block) acc.push(block);
    return acc;
  }, []);
};

/**
 * 选取所有顶层 Page 块（用于侧边栏目录树渲染）。
 * 只在 rootPageIds 或 blocksById 变化时重新计算。
 */
export const selectRootPages = (state: BlockStore): Block[] => {
  const { rootPageIds, blocksById } = state;
  return rootPageIds.reduce<Block[]>((acc, id) => {
    const block = blocksById[id];
    if (block) acc.push(block);
    return acc;
  }, []);
};

/**
 * 选取某个 Page 的所有直接子 Block（用于侧边栏子树展开）。
 */
export const selectPageChildren = (pageId: string) => (state: BlockStore): Block[] => {
  const page = state.blocksById[pageId];
  if (!page) return [];
  return page.contentIds.reduce<Block[]>((acc, id) => {
    const block = state.blocksById[id];
    if (block) acc.push(block);
    return acc;
  }, []);
};

// ─────────────────────────────────────────────
// Store Actions Selector（获取 actions 不触发 re-render）
// ─────────────────────────────────────────────

/**
 * 选取 store 的所有 Action。
 * 将 action 订阅与 state 订阅分离，使 action 调用点不会因 state 变化而 re-render。
 *
 * 用法：const { updateBlockContent, softDeleteBlock } = useBlockStore(selectActions);
 */
export const selectActions = (state: BlockStore) => ({
  hydrate: state.hydrate,
  addBlock: state.addBlock,
  updateBlockContent: state.updateBlockContent,
  updateBlockProps: state.updateBlockProps,
  softDeleteBlock: state.softDeleteBlock,
  reorderChildren: state.reorderChildren,
  setActivePage: state.setActivePage,
  getSyncPayload: state.getSyncPayload,
  clearDirtyState: state.clearDirtyState,
});
