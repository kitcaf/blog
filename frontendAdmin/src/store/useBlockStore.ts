/**
 * @file useBlockStore.ts
 * @description 当前编辑页的 Block 同步会话。
 *
 * 说明：
 *  1. 这里不再暴露 React hook 形态的 store，而是一个普通 class。
 *  2. 会话只服务于当前活跃编辑页，供 editor/title/sync runner 共享最新本地快照。
 *  3. 仍然保留 pending revision 语义，确保异步同步成功后只确认本次请求覆盖的变更。
 */

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

export interface BlockStoreState {
  blocksById: Record<string, Block>;
  pendingChangesById: Record<string, PendingChange>;
  revisionCounter: number;
}

interface BlockSessionSeed {
  pageBlock: BlockData;
  contentBlocks: BlockData[];
}

function createEmptyBlockStoreState(): BlockStoreState {
  return {
    blocksById: {},
    pendingChangesById: {},
    revisionCounter: 0,
  };
}

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

export class BlockSyncSession {
  private state: BlockStoreState;

  constructor(seed?: BlockSessionSeed) {
    this.state = createEmptyBlockStoreState();

    if (seed) {
      this.hydratePage(seed.pageBlock, seed.contentBlocks);
    }
  }

  getState(): Readonly<BlockStoreState> {
    return this.state;
  }

  hydratePage(pageBlock: BlockData, contentBlocks: BlockData[]): void {
    this.state = {
      blocksById: normalizeBlocks(pageBlock, contentBlocks),
      pendingChangesById: {},
      revisionCounter: 0,
    };
  }

  reset(): void {
    this.state = createEmptyBlockStoreState();
  }

  applyPageTitleChange(pageId: string, title: string): boolean {
    const pageBlock = this.state.blocksById[pageId];
    if (!pageBlock) {
      return false;
    }

    const currentTitle =
      'title' in pageBlock.props && typeof pageBlock.props.title === 'string'
        ? pageBlock.props.title
        : '';

    if (currentTitle === title) {
      return false;
    }

    const nextPending = { ...this.state.pendingChangesById };
    const nextCounter = markPendingChange(nextPending, pageId, 'upsert', this.state.revisionCounter);

    this.state = {
      blocksById: {
        ...this.state.blocksById,
        [pageId]: {
          ...pageBlock,
          props: {
            ...pageBlock.props,
            title,
          },
        } as Block,
      },
      pendingChangesById: nextPending,
      revisionCounter: nextCounter,
    };

    return true;
  }

  applyEditorSyncDraft(draft: EditorSyncDraft): void {
    let didChange = false;
    let nextCounter = this.state.revisionCounter;
    const nextBlocks = { ...this.state.blocksById };
    const nextPending = { ...this.state.pendingChangesById };

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
      return;
    }

    this.state = {
      blocksById: nextBlocks,
      pendingChangesById: nextPending,
      revisionCounter: nextCounter,
    };
  }

  buildSyncRequest(pageId: string): PreparedBlockSync | null {
    const { blocksById, pendingChangesById } = this.state;
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
  }

  hasPendingChanges(pageId?: string): boolean {
    const { blocksById, pendingChangesById } = this.state;
    if (pageId) {
      const pageBlock = blocksById[pageId];
      if (!pageBlock || pageBlock.type !== 'page') {
        return false;
      }
    }

    return Object.keys(pendingChangesById).length > 0;
  }

  acknowledgeSync(snapshot: BlockSyncSnapshot): void {
    let didChange = false;
    const nextPending = { ...this.state.pendingChangesById };

    for (const [id, revision] of Object.entries(snapshot.revisionsById)) {
      const currentChange = nextPending[id];
      if (!currentChange || currentChange.revision !== revision) {
        continue;
      }

      delete nextPending[id];
      didChange = true;
    }

    if (!didChange) {
      return;
    }

    this.state = {
      ...this.state,
      pendingChangesById: nextPending,
    };
  }
}

export function createBlockSyncSession(seed?: BlockSessionSeed): BlockSyncSession {
  return new BlockSyncSession(seed);
}
