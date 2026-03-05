/**
 * @file useBlockStore.ts
 * @description Zustand 全局状态管理 —— Block 编辑器的核心状态仓库
 *
 * 设计原则：
 *  1. 归一化存储（Normalized Store）：blocksById: Record<id, Block>，保证 O(1) 查找
 *  2. 写时追踪（Dirty Tracking）：dirtyBlockIds: Set<string>，收集变动供防抖同步
 *  3. 最小粒度订阅：配合 selectors.ts 中的 selector 函数使用，避免无关更新触发 re-render
 *
 * 数据流：
 *   API DbBlock[] → hydrate() → store.blocksById
 *   用户编辑      → updateBlockContent/updateBlockProps → dirty tracking
 *   防抖 1.5s     → getSyncPayload() → React Query useMutation → POST /api/blocks/sync
 *   同步成功      → clearDirtyState()
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Block,
  BlockData,
  InlineContent,
  BaseBlockProps,
  BlockSyncPayload,
  BlockUpdateDelta,
} from '@blog/types';

// ─────────────────────────────────────────────
// 一、Store 类型定义
// ─────────────────────────────────────────────

interface BlockStoreState {
  /**
   * 归一化的 Block Map，key 为 block.id。
   * 使用 Record 而非 Array，保证任意 Block 的增删改查为 O(1)。
   */
  blocksById: Record<string, Block>;

  /**
   * 顶层 Page Block 的有序 ID 列表（侧边栏目录树的根）。
   * 顺序由各 page block 所属父节点的 contentIds 决定。
   */
  rootPageIds: string[];

  /** 当前正在编辑/查看的 Page Block ID */
  activePageId: string | null;

  /**
   * 自上次同步以来被修改过的 Block ID 集合。
   * 使用 Set 保证 O(1) 的 has/add/delete 操作。
   */
  dirtyBlockIds: Set<string>;

  /**
   * 待同步的软删除 ID 列表。
   * 软删除只在本地移除渲染，ID 保留至下次 sync 发给后端。
   */
  pendingDeleteIds: string[];
}

interface BlockStoreActions {
  // ── 初始化 ──────────────────────────────────

  /**
   * 将 Block 数组水合进 Store（通常在从 API 拿到数据后调用）。
   * 会重置所有 dirty 状态。
   */
  hydrate: (blocks: BlockData[]) => void;

  // ── Block CRUD ───────────────────────────────

  /** 新增一个 Block，并将其插入到父节点 contentIds 的指定位置 */
  addBlock: (block: Block, afterId?: string) => void;

  /**
   * 更新 Block 的内联富文本内容（对应编辑器的文字输入）。
   * 这是最高频的操作，只更新 content 字段并标记 dirty。
   */
  updateBlockContent: (id: string, content: InlineContent[]) => void;

  /**
   * 更新 Block 的属性（样式、对齐、图片URL等）。
   * 使用 Record 类型以支持各 Block 子类型的不同 props 结构。
   */
  updateBlockProps: (id: string, props: Partial<BaseBlockProps & Record<string, unknown>>) => void;

  /**
   * 软删除一个 Block：从 blocksById 移除，从父节点 contentIds 中摘除，
   * 并记录到 pendingDeleteIds 等待下次 sync。
   */
  softDeleteBlock: (id: string) => void;

  // ── 顺序管理（拖拽排序）──────────────────────

  /**
   * 更新某个父节点的子块排序。
   * 符合核心技术文档的设计：拖拽只需更新父节点的 contentIds，子块本身无需变动。
   * @param parentId null 表示更新根级排序（rootPageIds）
   * @param orderedChildIds 重排后的子块 ID 有序数组
   */
  reorderChildren: (parentId: string | null, orderedChildIds: string[]) => void;

  // ── 导航 ─────────────────────────────────────

  /** 设置当前活跃页面（点击侧边栏）*/
  setActivePage: (pageId: string) => void;

  // ── 同步 ─────────────────────────────────────

  /**
   * 计算并返回当次同步的 Payload（供 React Query useMutation 调用）。
   * 纯派生计算，不修改 state。
   */
  getSyncPayload: () => BlockSyncPayload;

  /** 成功同步后调用，清除 dirty 状态 */
  clearDirtyState: () => void;

  /**
   * 整页替换：Tiptap onUpdate 防抖后调用，用 dehydrate 的结果完整替换某个 Page 的子块。
   * 自动计算 old vs new 的增删集合，精确标记 dirtyBlockIds。
   */
  replacePage: (pageId: string, newBlocks: Block[]) => void;
}

export type BlockStore = BlockStoreState & BlockStoreActions;

// ─────────────────────────────────────────────
// 二、内部工具函数
// ─────────────────────────────────────────────

/** 将 Block 数组转为归一化 Map（O(n)，仅在 hydrate 时调用一次） */
function normalizeBlocks(blocks: BlockData[]): Record<string, Block> {
  return Object.fromEntries(blocks.map((b) => [b.id, b]));
}

/** 提取所有 parentId 为 null 的顶层 Page 块 ID（保持插入顺序）*/
function extractRootPageIds(blocks: BlockData[]): string[] {
  return blocks.filter((b) => b.type === 'page' && b.parentId === null).map((b) => b.id);
}

// ─────────────────────────────────────────────
// 三、Store 实例
// ─────────────────────────────────────────────

export const useBlockStore = create<BlockStore>()(
  subscribeWithSelector((set, get) => ({
    // ── 初始状态 ──────────────────────────────

    blocksById: {},
    rootPageIds: [],
    activePageId: null,
    dirtyBlockIds: new Set(),
    pendingDeleteIds: [],

    // ── 初始化 ────────────────────────────────

    hydrate: (blocks) => {
      set({
        blocksById: normalizeBlocks(blocks),
        rootPageIds: extractRootPageIds(blocks),
        dirtyBlockIds: new Set(),
        pendingDeleteIds: [],
      });
    },

    // ── Block CRUD ────────────────────────────
    addBlock: (block, afterId) => {
      set((state) => {
        const next = { ...state.blocksById, [block.id]: block };

        // 将 block.id 插入父节点的 contentIds
        if (block.parentId !== null) {
          const parent = state.blocksById[block.parentId];
          if (!parent) return { blocksById: next }; // 父节点不存在，仅添加块

          const siblings = parent.contentIds;
          const insertIdx = afterId ? siblings.indexOf(afterId) + 1 : siblings.length;
          const newContentIds = [
            ...siblings.slice(0, insertIdx),
            block.id,
            ...siblings.slice(insertIdx),
          ];
          // as Block：只修改了非判别字段 contentIds，type 判别符不变，断言安全
          next[parent.id] = { ...parent, contentIds: newContentIds } as Block;
        }

        const newDirty = new Set(state.dirtyBlockIds);
        newDirty.add(block.id);
        if (block.parentId) newDirty.add(block.parentId);

        return {
          blocksById: next,
          dirtyBlockIds: newDirty,
          rootPageIds:
            block.type === 'page' && block.parentId === null
              ? [...state.rootPageIds, block.id]
              : state.rootPageIds,
        };
      });
    },

    updateBlockContent: (id, content) => {
      set((state) => {
        const block = state.blocksById[id];
        if (!block) return state;

        const newDirty = new Set(state.dirtyBlockIds);
        newDirty.add(id);

        return {
          // as Block：只修改了非判别字段 content，断言安全
          blocksById: { ...state.blocksById, [id]: { ...block, content } as Block },
          dirtyBlockIds: newDirty,
        };
      });
    },

    updateBlockProps: (id, props) => {
      set((state) => {
        const block = state.blocksById[id];
        if (!block) return state;

        const newDirty = new Set(state.dirtyBlockIds);
        newDirty.add(id);

        return {
          blocksById: {
            ...state.blocksById,
            // as Block：props 合并只修改属性值，type 判别符不变，断言安全
            [id]: { ...block, props: { ...block.props, ...props } } as Block,
          },
          dirtyBlockIds: newDirty,
        };
      });
    },

    softDeleteBlock: (id) => {
      set((state) => {
        const block = state.blocksById[id];
        if (!block) return state;

        // 从父节点 contentIds 中摘除
        const next = { ...state.blocksById };
        delete next[id];

        if (block.parentId) {
          const parent = state.blocksById[block.parentId];
          if (parent) {
            // as Block：只修改了非判别字段 contentIds，断言安全
            next[parent.id] = {
              ...parent,
              contentIds: parent.contentIds.filter((cid) => cid !== id),
            } as Block;
          }
        }

        // 从 dirty 中移除（已删除，无需更新），加入 pendingDeleteIds
        const newDirty = new Set(state.dirtyBlockIds);
        newDirty.delete(id);

        return {
          blocksById: next,
          dirtyBlockIds: newDirty,
          pendingDeleteIds: [...state.pendingDeleteIds, id],
          rootPageIds:
            block.type === 'page'
              ? state.rootPageIds.filter((pid) => pid !== id)
              : state.rootPageIds,
        };
      });
    },

    // ── 顺序管理 ──────────────────────────────

    reorderChildren: (parentId, orderedChildIds) => {
      set((state) => {
        const newDirty = new Set(state.dirtyBlockIds);

        if (parentId === null) {
          // 根级 page 排序
          return { rootPageIds: orderedChildIds, dirtyBlockIds: newDirty };
        }

        const parent = state.blocksById[parentId];
        if (!parent) return state;

        newDirty.add(parentId);

        return {
          blocksById: {
            ...state.blocksById,
            // as Block：只修改了非判别字段 contentIds，断言安全
            [parentId]: { ...parent, contentIds: orderedChildIds } as Block,
          },
          dirtyBlockIds: newDirty,
        };
      });
    },

    // ── 导航 ──────────────────────────────────

    setActivePage: (pageId) => {
      set({ activePageId: pageId });
    },

    // ── 同步 ──────────────────────────────────

    getSyncPayload: (): BlockSyncPayload => {
      const { blocksById, dirtyBlockIds, pendingDeleteIds } = get();

      const updated_blocks: BlockUpdateDelta[] = [...dirtyBlockIds].map((id) => {
        const block = blocksById[id];
        // 将前端 Block 脱水为 DbBlock delta 格式
        return {
          id,
          parent_id: block.parentId,
          path: block.path,
          type: block.type,
          content_ids: block.contentIds,
          // 将 props + content 合并回 properties JSONB
          properties: {
            ...block.props,
            content: block.content,
          },
        };
      });

      return {
        updated_blocks,
        deleted_blocks: pendingDeleteIds,
      };
    },

    clearDirtyState: () => {
      set({ dirtyBlockIds: new Set(), pendingDeleteIds: [] });
    },

    replacePage: (pageId, newBlocks) => {
      set((state) => {
        const page = state.blocksById[pageId];
        if (!page) return state;

        // 计算旧子块 ID 集合
        const oldChildIds = new Set(page.contentIds);
        const newChildIds = newBlocks.map((b) => b.id);

        // 新增或修改的块
        const newDirty = new Set(state.dirtyBlockIds);
        newBlocks.forEach((b) => newDirty.add(b.id));

        // 被移除的块加入 pendingDeleteIds（O(n) 查找）
        const newBlockIdSet = new Set(newChildIds);
        const removedIds = [...oldChildIds].filter((id) => !newBlockIdSet.has(id));

        // 构建新的 blocksById：移除旧子块，写入新子块，更新父页面的 contentIds
        const next = { ...state.blocksById };
        oldChildIds.forEach((id) => { delete next[id]; });
        newBlocks.forEach((b) => { next[b.id] = b; });
        next[pageId] = { ...page, contentIds: newChildIds } as Block;

        // 父页面也标记为 dirty（contentIds 变了）
        newDirty.add(pageId);

        return {
          blocksById: next,
          dirtyBlockIds: newDirty,
          pendingDeleteIds: [...state.pendingDeleteIds, ...removedIds],
        };
      });
    },
  })),
);
