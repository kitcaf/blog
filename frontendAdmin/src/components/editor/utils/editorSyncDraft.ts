import type { JSONContent } from '@tiptap/core';
import type { Block, InlineContent } from '@blog/types';
import {
  parseTiptapNodeToInlineContent,
  parseTiptapNodeToProps,
  parseTiptapNodeType,
} from '../converter';
import type { EditorBlockUpdateDraft } from '@/store/useBlockStore';

export function haveSameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function haveSameInlineContent(left: InlineContent[], right: InlineContent[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (JSON.stringify(left[index]) !== JSON.stringify(right[index])) {
      return false;
    }
  }

  return true;
}

function haveSameProps(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

function getBlockTypeFromNode(node: JSONContent, parentType?: string): string {
  if (node.type === 'listItem') {
    return parentType === 'orderedList' ? 'numberedListItem' : 'bulletListItem';
  }

  if (node.type === 'taskItem') {
    return 'checkListItem';
  }

  return parseTiptapNodeType(node.type ?? 'paragraph');
}

function buildUpdateDraft(
  node: JSONContent,
  pageId: string,
  pagePath: string,
  parentType?: string,
): EditorBlockUpdateDraft | null {
  const id = node.attrs?.['blockId'];
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }

  return {
    id,
    content: parseTiptapNodeToInlineContent(node),
    props: parseTiptapNodeToProps(node),
    metadata: {
      type: getBlockTypeFromNode(node, parentType),
      parentId: pageId,
      path: `${pagePath}${id}/`,
    },
  };
}

export function hasBlockChanged(existingBlock: Block | undefined, nextBlock: EditorBlockUpdateDraft): boolean {
  if (!existingBlock) {
    return true;
  }

  if (
    existingBlock.type !== nextBlock.metadata?.type ||
    existingBlock.parentId !== nextBlock.metadata?.parentId ||
    existingBlock.path !== nextBlock.metadata?.path
  ) {
    return true;
  }

  if (!haveSameInlineContent(existingBlock.content, nextBlock.content)) {
    return true;
  }

  const mergedProps = { ...existingBlock.props, ...nextBlock.props } as Record<string, unknown>;
  return !haveSameProps(existingBlock.props as Record<string, unknown>, mergedProps);
}

interface CollectDocumentBlocksParams {
  content: JSONContent[] | undefined;
  pageId: string;
  pagePath: string;
  candidateIds: Set<string>;
  blocksById: Record<string, Block>;
  orderedBlockIds: string[];
  currentDocIdSet: Set<string>;
  rawUpdates: EditorBlockUpdateDraft[];
  remainingCandidateIds: Set<string>;
  collectStructure: boolean;
  parentType?: string;
}

export function collectDocumentBlocks({
  content,
  pageId,
  pagePath,
  candidateIds,
  blocksById,
  orderedBlockIds,
  currentDocIdSet,
  rawUpdates,
  remainingCandidateIds,
  collectStructure,
  parentType,
}: CollectDocumentBlocksParams): boolean {
  if (!content) {
    return false;
  }

  for (const node of content) {
    if (!node.type) {
      continue;
    }

    const blockId = node.attrs?.['blockId'];
    if (typeof blockId === 'string' && blockId.length > 0) {
      orderedBlockIds.push(blockId);
      currentDocIdSet.add(blockId);

      if (candidateIds.has(blockId) || !blocksById[blockId]) {
        const updateDraft = buildUpdateDraft(node, pageId, pagePath, parentType);
        if (updateDraft) {
          rawUpdates.push(updateDraft);
          remainingCandidateIds.delete(blockId);
        }
      }

      if (!collectStructure && remainingCandidateIds.size === 0) {
        return true;
      }

      continue;
    }

    const shouldStop = collectDocumentBlocks({
      content: node.content,
      pageId,
      pagePath,
      candidateIds,
      blocksById,
      orderedBlockIds,
      currentDocIdSet,
      rawUpdates,
      remainingCandidateIds,
      collectStructure,
      parentType: node.type,
    });

    if (shouldStop) {
      return true;
    }
  }

  return false;
}
