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
// 全局扁平化缓存池 保存一篇文章的相关 Block 和操作
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

  dirtySet: Set<string>;
  deletedSet: Set<string>;
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

  /**
   * 跨层级或同层级移动节点
   * @param id 被移动的节点 ID
   * @param newParentId 新父节点 ID（null 为根目录）
   * @param newContentIds 新父节点的新子节点顺序
   * @param oldParentId 旧父节点 ID（null 为根目录）
   * @param oldContentIds 旧父节点的新子节点顺序
   */
  moveNode: (
    id: string,
    newParentId: string | null,
    newContentIds: string[],
    oldParentId: string | null,
    oldContentIds: string[]
  ) => void;

  // ── 导航 ─────────────────────────────────────

  /** 设置当前活跃页面（点击侧边栏）*/
  setActivePage: (pageId: string) => void;

  // ── 同步 ─────────────────────────────────────

  /** 获取要发给后端的 Payload */
  getSyncPayload: () => BlockSyncPayload;

  /** 同步成功后清空状态 */
  clearDirtyState: () => void;

  /**
   * 1. 标记某个 Block 变脏（仅记录 ID）
   * 由 DirtyTrackerExtension 在高频打字时调用
   */
  markBlockDirty: (id: string) => void;

  /**
   * 2. 标记某个 Block 被删除
   * 由 DirtyTrackerExtension 在检测到退格合并时调用
   */
  markBlockDeleted: (id: string) => void;

  /**
   * 3. 局部按需更新（Lazy Extraction 阶段调用）
   * 在 debouncedSync 中，从 Tiptap 提取出最新数据后，回写到 Store
   */
  updateSingleBlockData: (id: string, content: InlineContent[], props: any) => void;

  /**
   * 4. 更新父页面的子节点排序
   * 在 debouncedSync 中调用，用于处理拖拽、新增段落导致的排序变动
   */
  updatePageStructure: (pageId: string, newChildIds: string[]) => void;
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
    dirtySet: new Set(),
    deletedSet: new Set(),

    // ── 初始化 ────────────────────────────────

    hydrate: (blocks) => {
      set({
        blocksById: normalizeBlocks(blocks),
        rootPageIds: extractRootPageIds(blocks),
        dirtySet: new Set(),
        deletedSet: new Set(),
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

        const newDirty = new Set(state.dirtySet);
        newDirty.add(block.id);
        if (block.parentId) newDirty.add(block.parentId);

        return {
          blocksById: next,
          dirtySet: newDirty,
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

        const newDirty = new Set(state.dirtySet);
        newDirty.add(id);

        return {
          // as Block：只修改了非判别字段 content，断言安全
          blocksById: { ...state.blocksById, [id]: { ...block, content } as Block },
          dirtySet: newDirty,
        };
      });
    },

    updateBlockProps: (id, props) => {
      set((state) => {
        const block = state.blocksById[id];
        if (!block) return state;

        const newDirty = new Set(state.dirtySet);
        newDirty.add(id);

        return {
          blocksById: {
            ...state.blocksById,
            // as Block：props 合并只修改属性值，type 判别符不变，断言安全
            [id]: { ...block, props: { ...block.props, ...props } } as Block,
          },
          dirtySet: newDirty,
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

        // 从 dirty 中移除（已删除，无需更新），加入 deletedSet
        const newDirty = new Set(state.dirtySet);
        newDirty.delete(id);

        const newDeleted = new Set(state.deletedSet).add(id);

        return {
          blocksById: next,
          dirtySet: newDirty,
          deletedSet: newDeleted,
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
        const newDirty = new Set(state.dirtySet);

        if (parentId === null) {
          // 根级 page 排序
          return { rootPageIds: orderedChildIds, dirtySet: newDirty };
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
          dirtySet: newDirty,
        };
      });
    },

    moveNode: (id, newParentId, newContentIds, oldParentId, oldContentIds) => {
      set((state) => {
        const newDirty = new Set(state.dirtySet);
        const node = state.blocksById[id];
        if (!node) return state;

        let newRootPageIds = state.rootPageIds;
        const newBlocksById = { ...state.blocksById };

        // 1. 更新 node 的 parentId
        newBlocksById[id] = { ...node, parentId: newParentId } as Block;
        newDirty.add(id);

        // 2. 更新旧父节点的 contentIds
        if (oldParentId === null) {
          newRootPageIds = oldContentIds;
        } else {
          const oldParent = newBlocksById[oldParentId];
          if (oldParent) {
            newBlocksById[oldParentId] = { ...oldParent, contentIds: oldContentIds } as Block;
            newDirty.add(oldParentId);
          }
        }

        // 3. 更新新父节点的 contentIds
        if (newParentId === null) {
          newRootPageIds = newContentIds;
        } else {
          const newParent = newBlocksById[newParentId];
          if (newParent) {
            newBlocksById[newParentId] = { ...newParent, contentIds: newContentIds } as Block;
            newDirty.add(newParentId);
          }
        }

        return {
          blocksById: newBlocksById,
          rootPageIds: newRootPageIds,
          dirtySet: newDirty,
        };
      });
    },

    // ── 导航 ──────────────────────────────────

    setActivePage: (pageId) => {
      set({ activePageId: pageId });
    },

    // ── 同步 ──────────────────────────────────

    getSyncPayload: (): BlockSyncPayload => {
      const { blocksById, dirtySet, deletedSet } = get();

      const updated_blocks: BlockUpdateDelta[] = Array.from(dirtySet)
        .map((id) => {
          const block = blocksById[id];
          if (!block) return null; // 保底防御，按理已处理
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
        })
        .filter(Boolean) as BlockUpdateDelta[];

      return {
        updated_blocks,
        deleted_blocks: Array.from(deletedSet),
      };
    },

    clearDirtyState: () => {
      set({ dirtySet: new Set(), deletedSet: new Set() });
    },

    // ── ⚡️ 极简 Action 实现 ──

    markBlockDirty: (id) => {
      set((state) => {
        if (state.dirtySet.has(id)) return state;
        const newSet = new Set(state.dirtySet);
        newSet.add(id);
        return { dirtySet: newSet };
      });
    },

    markBlockDeleted: (id) => {
      set((state) => {
        const nextBlocks = { ...state.blocksById };
        delete nextBlocks[id];

        const newDirty = new Set(state.dirtySet);
        newDirty.delete(id);

        const newDeleted = new Set(state.deletedSet).add(id);

        return {
          blocksById: nextBlocks,
          dirtySet: newDirty,
          deletedSet: newDeleted,
        };
      });
    },

    updateSingleBlockData: (id, content, props) => {
      set((state) => {
        const oldBlock = state.blocksById[id];
        // 如果这是一个刚被回车创建的新块，旧的 blocksById 里可能没有，需兼容处理
        if (!oldBlock) return state;

        return {
          blocksById: {
            ...state.blocksById,
            [id]: { ...oldBlock, content, props: { ...oldBlock.props, ...props } } as Block,
          },
        };
      });
    },

    updatePageStructure: (pageId, newChildIds) => {
      set((state) => {
        const page = state.blocksById[pageId];
        if (!page) return state;

        const oldChildIds = page.contentIds;
        if (oldChildIds.join(',') === newChildIds.join(',')) return state;

        return {
          blocksById: {
            ...state.blocksById,
            [pageId]: { ...page, contentIds: newChildIds } as Block,
          },
        };
      });
    },
  })),
);
