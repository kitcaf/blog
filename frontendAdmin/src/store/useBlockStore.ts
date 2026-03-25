/**
 * @file useBlockStore.ts
 * @description 编辑器 Block 缓存与待同步状态。
 *
 * 设计原则：
 *  1. Store 只保存当前页面的 canonical block cache 与 pending 变更。
 *  2. 只暴露“标题更新”和“编辑器 flush 提交”两个高层入口。
 *  3. 同步请求在真正发送前才从 Store 读取，Store 不维护预入队状态。
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

// 同步快照：记录本次同步覆盖的版本号
export interface BlockSyncSnapshot {
  revisionsById: Record<string, number>; // block ID -> revision
}

// 准备好的同步请求：包含 payload 和 snapshot
export interface PreparedBlockSync {
  payload: BlockSyncPayload;
  snapshot: BlockSyncSnapshot;
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
  updates: EditorBlockUpdateDraft[];
  deletedIds: string[];
  pageStructure?: {
    pageId: string;
    contentIds: string[];
  };
}

interface BlockStoreState {
  blocksById: Record<string, Block>;
  pendingChangesById: Record<string, PendingChange>;
  revisionCounter: number;
}

interface BlockStoreActions {
  hydratePage: (pageBlock: BlockData, contentBlocks: BlockData[]) => void;
  reset: () => void;
  applyPageTitleChange: (pageId: string, title: string) => boolean;
  applyEditorSyncDraft: (draft: EditorSyncDraft) => void;
  buildSyncRequest: (pageId: string) => PreparedBlockSync | null;
  hasPendingChanges: (pageId?: string) => boolean;
  acknowledgeSync: (snapshot: BlockSyncSnapshot) => void;
}

export type BlockStore = BlockStoreState & BlockStoreActions;

function normalizeBlocks(pageBlock: BlockData, contentBlocks: BlockData[]): Record<string, Block> {
  return Object.fromEntries([pageBlock, ...contentBlocks].map((block) => [block.id, block]));
}

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
      content: block.content,
    },
  };
}

export const useBlockStore = create<BlockStore>()((set, get) => ({
  blocksById: {},
  pendingChangesById: {},
  revisionCounter: 0,

  hydratePage: (pageBlock, contentBlocks) => {
    set({
      blocksById: normalizeBlocks(pageBlock, contentBlocks),
      pendingChangesById: {},
      revisionCounter: 0,
    });
  },

  reset: () => {
    set({
      blocksById: {},
      pendingChangesById: {},
      revisionCounter: 0,
    });
  },

  applyPageTitleChange: (pageId, title) => {
    let didChange = false;

    set((state) => {
      const pageBlock = state.blocksById[pageId];
      if (!pageBlock) {
        return state;
      }

      const currentTitle =
        'title' in pageBlock.props && typeof pageBlock.props.title === 'string'
          ? pageBlock.props.title
          : '';

      if (currentTitle === title) {
        return state;
      }

      didChange = true;

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

      const nextPending = { ...state.pendingChangesById };
      const nextCounter = markPendingChange(nextPending, pageId, 'upsert', state.revisionCounter);

      return {
        blocksById: nextBlocks,
        pendingChangesById: nextPending,
        revisionCounter: nextCounter,
      };
    });

    return didChange;
  },

  applyEditorSyncDraft: (draft) => {
    set((state) => {
      let didChange = false;
      let nextCounter = state.revisionCounter;
      const nextBlocks = { ...state.blocksById };
      const nextPending = { ...state.pendingChangesById };

      for (const update of draft.updates) {
        const existingBlock = nextBlocks[update.id];

        if (existingBlock) {
          nextBlocks[update.id] = {
            ...existingBlock,
            content: update.content,
            props: {
              ...existingBlock.props,
              ...update.props,
            },
          } as Block;
        } else if (update.metadata) {
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
          continue;
        }

        nextCounter = markPendingChange(nextPending, update.id, 'upsert', nextCounter);
        didChange = true;
      }

      for (const id of draft.deletedIds) {
        if (nextBlocks[id]) {
          delete nextBlocks[id];
          didChange = true;
        }

        nextCounter = markPendingChange(nextPending, id, 'delete', nextCounter);
      }

      if (draft.pageStructure) {
        const pageBlock = nextBlocks[draft.pageStructure.pageId];
        if (pageBlock) {
          const oldContentIds = pageBlock.contentIds;
          const hasStructureChange =
            oldContentIds.length !== draft.pageStructure.contentIds.length ||
            !oldContentIds.every((id, index) => id === draft.pageStructure?.contentIds[index]);

          if (hasStructureChange) {
            nextBlocks[draft.pageStructure.pageId] = {
              ...pageBlock,
              contentIds: draft.pageStructure.contentIds,
            } as Block;

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

  buildSyncRequest: (pageId) => {
    const { blocksById, pendingChangesById } = get();
    const pageBlock = blocksById[pageId];
    if (!pageBlock || pageBlock.type !== 'page') {
      return null;
    }

    const updatedBlocks: BlockUpdateDelta[] = [];
    const deletedBlocks: string[] = [];
    const revisionsById: Record<string, number> = {};

    for (const [id, change] of Object.entries(pendingChangesById)) {
      revisionsById[id] = change.revision;

      if (change.kind === 'delete') {
        deletedBlocks.push(id);
        continue;
      }

      const block = blocksById[id];
      if (!block) {
        continue;
      }

      updatedBlocks.push(buildBlockUpdate(block));
    }

    if (updatedBlocks.length === 0 && deletedBlocks.length === 0) {
      return null;
    }

    return {
      payload: {
        page_id: pageId,
        updated_blocks: updatedBlocks,
        deleted_blocks: deletedBlocks,
      },
      snapshot: {
        revisionsById,
      },
    };
  },

  hasPendingChanges: (pageId) => {
    const { blocksById, pendingChangesById } = get();
    if (pageId) {
      const pageBlock = blocksById[pageId];
      if (!pageBlock || pageBlock.type !== 'page') {
        return false;
      }
    }

    return Object.keys(pendingChangesById).length > 0;
  },

  acknowledgeSync: (snapshot) => {
    set((state) => {
      let didChange = false;
      const nextPending = { ...state.pendingChangesById };

      for (const [id, revision] of Object.entries(snapshot.revisionsById)) {
        const currentChange = nextPending[id];
        if (!currentChange || currentChange.revision !== revision) {
          continue;
        }

        delete nextPending[id];
        didChange = true;
      }

      if (!didChange) {
        return state;
      }

      return {
        pendingChangesById: nextPending,
      };
    });
  },
}));
