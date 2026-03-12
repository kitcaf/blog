/**
 * @file useBlockStore.ts
 * @description 极简编辑器状态管理 —— 仅负责 Dirty Tracking 和编辑缓存
 *
 * 职责：
 *  1. 缓存当前页面的 blocks（从 React Query 水合）
 *  2. Dirty Tracking：追踪用户编辑产生的变更
 *  3. 提供 Sync Payload：将变更打包发送给后端
 * 
 * 数据流：
 *   路由变化 → MainContent 检测 pageId
 *   → React Query 加载页面 → hydratePage() → blocksById
 *   → 用户编辑 → Tiptap Extension → markBlockDirty()
 *   → 防抖 1.5s → 从 Tiptap 提取数据 → updateSingleBlockData()
 *   → getSyncPayload() → API sync → clearDirtyState()
 *   → 切换页面 → reset() 清空旧页面状态
 */

import { create } from 'zustand';
import type {
  Block,
  BlockData,
  InlineContent,
  BlockSyncPayload,
  BlockUpdateDelta,
} from '@blog/types';

// ─────────────────────────────────────────────
// Store 类型定义：极简化，只保留编辑器核心功能
// ─────────────────────────────────────────────

interface EditorStoreState {
  /** 当前页面的 Block 缓存（归一化存储，O(1) 查找）*/
  blocksById: Record<string, Block>;

  /** 变脏的 Block ID 集合（用户编辑过的）*/
  dirtySet: Set<string>;

  /** 被删除的 Block ID 集合（等待同步）*/
  deletedSet: Set<string>;
}

interface EditorStoreActions {
  /**
   * 水合页面数据（从 React Query 加载后调用）
   * 会清空 dirty 状态，适用于首次加载或切换页面后
   */
  hydratePage: (blocks: BlockData[]) => void;

  /**
   * 重置 Store（切换页面时调用，清空旧页面状态）
   */
  reset: () => void;

  /**
   * 标记 Block 变脏（Tiptap Extension 在用户编辑时调用）
   */
  markBlockDirty: (id: string) => void;

  /**
   * 标记 Block 被删除（Tiptap Extension 在检测到删除时调用）
   */
  markBlockDeleted: (id: string) => void;

  /**
   * 更新单个 Block 的数据（防抖同步时从 Tiptap 提取数据后调用）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateSingleBlockData: (id: string, content: InlineContent[], props: any) => void;

  /**
   * 更新页面的子节点排序（由 DirtyTrackerExtension 调用，避免重复遍历）
   */
  updatePageStructure: (pageId: string, newChildIds: string[]) => void;

  /**
   * 获取同步 Payload（打包所有变更发送给后端）
   */
  getSyncPayload: () => BlockSyncPayload;

  /**
   * 清空 Dirty 状态（同步成功后调用）
   */
  clearDirtyState: () => void;
}

export type BlockStore = EditorStoreState & EditorStoreActions;

// ─────────────────────────────────────────────
// 内部工具函数
// ─────────────────────────────────────────────

/** 将 Block 数组转为归一化 Map（O(n)）*/
function normalizeBlocks(blocks: BlockData[]): Record<string, Block> {
  return Object.fromEntries(blocks.map((b) => [b.id, b]));
}

// ─────────────────────────────────────────────
// Store 实例：极简化，只保留编辑器核心功能
// ─────────────────────────────────────────────

export const useBlockStore = create<BlockStore>()((set, get) => ({
  // ── 初始状态 ──────────────────────────────
  blocksById: {},
  dirtySet: new Set(),
  deletedSet: new Set(),

  // ── 初始化与重置 ──────────────────────────
  hydratePage: (blocks) => {
    set({
      blocksById: normalizeBlocks(blocks),
      dirtySet: new Set(),
      deletedSet: new Set(),
    });
  },

  reset: () => {
    set({
      blocksById: {},
      dirtySet: new Set(),
      deletedSet: new Set(),
    });
  },

  // ── Dirty Tracking ────────────────────────
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

  // ── 数据更新（防抖同步时调用）──────────────
  updateSingleBlockData: (id, content, props) => {
    set((state) => {
      const oldBlock = state.blocksById[id];
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

      // 快速比较：长度 + 顺序
      const oldChildIds = page.contentIds;
      if (
        oldChildIds.length === newChildIds.length &&
        oldChildIds.every((id, i) => id === newChildIds[i])
      ) {
        return state;
      }

      return {
        blocksById: {
          ...state.blocksById,
          [pageId]: { ...page, contentIds: newChildIds } as Block,
        },
      };
    });
  },

  // ── 同步 ──────────────────────────────────
  getSyncPayload: (): BlockSyncPayload => {
    const { blocksById, dirtySet, deletedSet } = get();

    const updated_blocks: BlockUpdateDelta[] = Array.from(dirtySet)
      .map((id) => {
        const block = blocksById[id];
        if (!block) return null;

        return {
          id,
          parent_id: block.parentId,
          path: block.path,
          type: block.type,
          content_ids: block.contentIds,
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
}));
