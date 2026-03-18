/**
 * @file useBlockStore.ts
 * @description 编辑器 Block 缓存与待同步状态。
 *
 * 设计原则：
 *  1. 只保存前端当前页面的 canonical block cache。
 *  2. 只暴露“标题更新”和“编辑器 flush 提交”两个高层入口。
 *  3. 待同步状态使用单一 pendingChangesById 维护，避免多套 Set / Map 分散职责。
 */

import { create } from 'zustand';
import type {
  Block,
  BlockData,
  InlineContent,
  BlockSyncPayload,
  BlockUpdateDelta,
} from '@blog/types';

type PendingChangeKind = 'upsert' | 'delete';

interface PendingChange {
  kind: PendingChangeKind;
  revision: number;
}

// 同步快照：记录本次同步的版本号
export interface BlockSyncSnapshot {
  revisionsById: Record<string, number>; // block ID → 版本号
}

// 准备好的同步请求：包含 payload 和 snapshot
export interface PreparedBlockSync {
  payload: BlockSyncPayload; // API 请求数据
  snapshot: BlockSyncSnapshot; // 版本快照，用于确认同步
}

// 编辑器 block 更新草稿
export interface EditorBlockUpdateDraft {
  id: string;
  content: InlineContent[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: any;
  metadata?: {
    type: string;
    parentId: string;
    path: string;
  };
}

// 编辑器同步草稿：包含所有变更
export interface EditorSyncDraft {
  updates: EditorBlockUpdateDraft[]; // 需要更新的 block
  deletedIds: string[]; // 需要删除的 block ID
  pageStructure?: {
    pageId: string;
    contentIds: string[]; // 新的子节点顺序
  };
}

// Store 状态
interface BlockStoreState {
  blocksById: Record<string, Block>; // block 缓存
  pendingChangesById: Record<string, PendingChange>; // 待同步变更
  revisionCounter: number; // 全局版本计数器
}

// Store 操作
interface BlockStoreActions {
  /**
   * 水合页面数据：从服务器加载数据后调用
   * 
   * 会清空所有状态，重新初始化
   */
  hydratePage: (pageBlock: BlockData, contentBlocks: BlockData[]) => void;

  /**
   * 重置 Store：页面切换或卸载时调用
   */
  reset: () => void;

  /**
   * 应用页面标题变更
   * 
   * 流程：
   *   1. 更新 blocksById 中的 title
   *   2. 标记为 pending upsert
   *   3. 递增版本号
   */
  applyPageTitleChange: (pageId: string, title: string) => void;

  /**
   * 应用编辑器同步草稿
   * 
   * 流程：
   *   1. 批量更新 blocksById（新增、更新、删除）
   *   2. 标记所有变更为 pending
   *   3. 递增版本号
   */
  applyEditorSyncDraft: (draft: EditorSyncDraft) => void;

  /**
   * 获取同步请求
   * 
   * 流程：
   *   1. 遍历 pendingChangesById
   *   2. 构造 updated_blocks 和 deleted_blocks
   *   3. 生成版本快照
   * 
   * @returns PreparedBlockSync 或 null（无待同步数据）
   */
  getSyncRequest: () => PreparedBlockSync | null;

  /**
   * 确认同步成功
   * 
   * 流程：
   *   1. 根据 snapshot.revisionsById 找到已同步的变更
   *   2. 只清除版本号匹配的 pending 记录
   *   3. 保留版本号不匹配的记录（新变更）
   */
  acknowledgeSync: (snapshot: BlockSyncSnapshot) => void;
}

export type BlockStore = BlockStoreState & BlockStoreActions;

/**
 * 工具函数：归一化 blocks 为 Map
 */
function normalizeBlocks(pageBlock: BlockData, contentBlocks: BlockData[]): Record<string, Block> {
  return Object.fromEntries([pageBlock, ...contentBlocks].map((block) => [block.id, block]));
}

/**
 * 工具函数：标记 pending 变更并递增版本号
 * 
 * @returns 新的版本号
 */
function markPendingChange(
  pendingChangesById: Record<string, PendingChange>,
  id: string,
  kind: PendingChangeKind,
  currentCounter: number,
): number {
  const nextCounter = currentCounter + 1;
  pendingChangesById[id] = {
    kind,
    revision: nextCounter,
  };
  return nextCounter;
}

/**
 * 工具函数：构造 block 更新数据
 * 
 * Page 类型特殊处理：不包含 content 字段
 */
function buildBlockUpdate(block: Block): BlockUpdateDelta {
  if (block.type === 'page') {
    return {
      id: block.id,
      parent_id: block.parentId,
      path: block.path,
      type: block.type,
      content_ids: block.contentIds,
      properties: {
        icon: block.props.icon,
        title: block.props.title,
        // Page 不包含 content
      },
    };
  }

  return {
    id: block.id,
    parent_id: block.parentId,
    path: block.path,
    type: block.type,
    content_ids: block.contentIds,
    properties: {
      ...block.props,
      content: block.content, // 其他类型包含 content
    },
  };
}

export const useBlockStore = create<BlockStore>()((set, get) => ({
  // 初始状态
  blocksById: {},
  pendingChangesById: {},
  revisionCounter: 0,

  /**
   * 水合页面数据
   * 
   * 从服务器加载数据后调用，重新初始化所有状态
   */
  hydratePage: (pageBlock, contentBlocks) => {
    set({
      blocksById: normalizeBlocks(pageBlock, contentBlocks),
      pendingChangesById: {}, // 清空待同步状态
      revisionCounter: 0, // 重置版本号
    });
  },

  /**
   * 重置 Store
   * 
   * 页面切换或卸载时调用
   */
  reset: () => {
    set({
      blocksById: {},
      pendingChangesById: {},
      revisionCounter: 0,
    });
  },

  /**
   * 应用页面标题变更
   * 
   * 流程：
   *   1. 检查标题是否真的变了
   *   2. 更新 blocksById
   *   3. 标记为 pending upsert
   */
  applyPageTitleChange: (pageId, title) => {
    set((state) => {
      const pageBlock = state.blocksById[pageId];
      if (!pageBlock) {
        return state; // 页面不存在，跳过
      }

      // 获取当前标题
      const currentTitle =
        'title' in pageBlock.props && typeof pageBlock.props.title === 'string'
          ? pageBlock.props.title
          : '';

      // 标题未变化，跳过
      if (currentTitle === title) {
        return state;
      }

      // 更新标题
      const nextBlocks = {
        ...state.blocksById,
        [pageId]: {
          ...pageBlock,
          props: {
            ...pageBlock.props,
            title,
          },
        } as Block,
      };

      // 标记为 pending upsert
      const nextPending = { ...state.pendingChangesById };
      const nextCounter = markPendingChange(nextPending, pageId, 'upsert', state.revisionCounter);

      return {
        blocksById: nextBlocks,
        pendingChangesById: nextPending,
        revisionCounter: nextCounter,
      };
    });
  },

  /**
   * 应用编辑器同步草稿
   * 
   * 批量处理编辑器的所有变更：
   *   1. 更新 blocks（新增、修改）
   *   2. 删除 blocks
   *   3. 更新页面结构（contentIds）
   *   4. 标记所有变更为 pending
   */
  applyEditorSyncDraft: (draft) => {
    set((state) => {
      let didChange = false;
      let nextCounter = state.revisionCounter;
      const nextBlocks = { ...state.blocksById };
      const nextPending = { ...state.pendingChangesById };

      // 处理更新（新增或修改）
      for (const update of draft.updates) {
        const existingBlock = nextBlocks[update.id];

        if (existingBlock) {
          // 修改现有 block
          nextBlocks[update.id] = {
            ...existingBlock,
            content: update.content,
            props: {
              ...existingBlock.props,
              ...update.props,
            },
          } as Block;
        } else if (update.metadata) {
          // 新增 block
          nextBlocks[update.id] = {
            id: update.id,
            parentId: update.metadata.parentId,
            path: update.metadata.path,
            type: update.metadata.type,
            content: update.content,
            props: update.props,
            contentIds: [],
          } as Block;
        } else {
          continue; // 缺少 metadata，跳过
        }

        // 标记为 pending upsert
        nextCounter = markPendingChange(nextPending, update.id, 'upsert', nextCounter);
        didChange = true;
      }

      // 处理删除
      for (const id of draft.deletedIds) {
        if (nextBlocks[id]) {
          delete nextBlocks[id]; // 从缓存中删除
          didChange = true;
        }

        // 标记为 pending delete
        nextCounter = markPendingChange(nextPending, id, 'delete', nextCounter);
      }

      // 处理页面结构变化
      if (draft.pageStructure) {
        const pageBlock = nextBlocks[draft.pageStructure.pageId];
        if (pageBlock) {
          const oldContentIds = pageBlock.contentIds;
          const hasStructureChange =
            oldContentIds.length !== draft.pageStructure.contentIds.length ||
            !oldContentIds.every((id, index) => id === draft.pageStructure?.contentIds[index]);

          if (hasStructureChange) {
            // 更新 contentIds
            nextBlocks[draft.pageStructure.pageId] = {
              ...pageBlock,
              contentIds: draft.pageStructure.contentIds,
            } as Block;

            // 标记页面为 pending upsert
            nextCounter = markPendingChange(
              nextPending,
              draft.pageStructure.pageId,
              'upsert',
              nextCounter,
            );
            didChange = true;
          }
        }
      }

      // 如果没有任何变化，返回原状态
      if (!didChange) {
        return state;
      }

      return {
        blocksById: nextBlocks,
        pendingChangesById: nextPending,
        revisionCounter: nextCounter,
      };
    });
  },

  /**
   * 获取同步请求
   * 
   * 遍历 pendingChangesById，构造 API 请求数据和版本快照
   * 
   * @returns PreparedBlockSync 或 null（无待同步数据）
   */
  getSyncRequest: () => {
    const { blocksById, pendingChangesById } = get();
    const updatedBlocks: BlockUpdateDelta[] = [];
    const deletedBlocks: string[] = [];
    const revisionsById: Record<string, number> = {};

    // 遍历所有 pending 变更
    for (const [id, change] of Object.entries(pendingChangesById)) {
      // 记录版本号（用于确认同步）
      revisionsById[id] = change.revision;

      if (change.kind === 'delete') {
        // 删除操作
        deletedBlocks.push(id);
        continue;
      }

      // 更新操作：从 blocksById 获取最新数据
      const block = blocksById[id];
      if (!block) {
        continue; // block 不存在，跳过
      }

      updatedBlocks.push(buildBlockUpdate(block));
    }

    // 如果没有待同步数据，返回 null
    if (updatedBlocks.length === 0 && deletedBlocks.length === 0) {
      return null;
    }

    return {
      payload: {
        updated_blocks: updatedBlocks,
        deleted_blocks: deletedBlocks,
      },
      snapshot: {
        revisionsById, // 版本快照
      },
    };
  },

  /**
   * 确认同步成功
   * 
   * 根据版本快照清除已同步的 pending 记录
   * 只清除版本号匹配的记录，保留新变更
   */
  acknowledgeSync: (snapshot) => {
    set((state) => {
      let didChange = false;
      const nextPending = { ...state.pendingChangesById };

      // 遍历快照中的版本号
      for (const [id, revision] of Object.entries(snapshot.revisionsById)) {
        const currentChange = nextPending[id];
        
        // 版本号不匹配，说明有新变更，不清除
        if (!currentChange || currentChange.revision !== revision) {
          continue;
        }

        // 版本号匹配，清除 pending 记录
        delete nextPending[id];
        didChange = true;
      }

      if (!didChange) {
        return state; // 没有变化，返回原状态
      }

      return {
        pendingChangesById: nextPending,
      };
    });
  },
}));
