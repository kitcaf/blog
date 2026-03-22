/**
 * @file collectEditorSyncDraft.ts
 * @description 从编辑器最终文档快照中提取变更草稿
 * 
 * 核心职责：
 *   1. 遍历编辑器文档，收集所有 block ID 和顺序
 *   2. 对候选 ID 提取完整的 content 和 props
 *   3. 通过 diff 判断哪些 block 真正发生了变更
 *   4. 检测删除的 block（在旧结构中存在，但在新文档中不存在）
 *   5. 检测结构变化（子节点顺序变化）
 * 
 * 性能优化：
 *   - 只提取候选 ID 的数据，不是所有节点
 *   - 使用 JSON.stringify 快速 diff（可优化为深度比较）
 *   - 一次遍历完成所有收集工作
 */

import type { Editor } from '@tiptap/core';
import type { Block } from '@blog/types';
import {
  collectDocumentBlocks,
  hasBlockChanged,
  haveSameIds,
} from '../utils/editorSyncDraft';
import type { EditorBlockUpdateDraft, EditorSyncDraft } from '@/store/useBlockStore';

interface CollectEditorSyncDraftParams {
  editor: Editor;
  pageId: string;
  pageBlock: Block; // 当前页面的 block
  candidateIds: Set<string>; // DirtyTracker 收集的候选 ID
  blocksById: Record<string, Block>; // Store 中的 block 缓存
  structureDirty: boolean;
}

/**
 * 从编辑器文档中收集变更草稿
 * 
 * 执行流程：
 *   1. 遍历编辑器文档，收集所有 block ID 和顺序
 *   2. 对候选 ID（或新 block）提取完整数据
 *   3. 通过 hasBlockChanged 过滤出真正变更的 block
 *   4. 检测删除的 block
 *   5. 检测结构变化（子节点顺序）
 * 
 * @returns EditorSyncDraft 包含：
 *   - updates: 需要更新的 block 数组
 *   - deletedIds: 需要删除的 block ID 数组
 *   - pageStructure: 如果结构变化，包含新的 contentIds
 */
export function collectEditorSyncDraft({
  editor,
  pageId,
  pageBlock,
  candidateIds,
  blocksById,
  structureDirty,
}: CollectEditorSyncDraftParams): EditorSyncDraft {
  // 收集结果
  const orderedBlockIds: string[] = []; // 文档中所有 block 的顺序
  const currentDocIdSet = new Set<string>(); // 当前文档中存在的 block ID
  const rawUpdates: EditorBlockUpdateDraft[] = []; // 候选 block 的原始数据
  const remainingCandidateIds = new Set(candidateIds);

  collectDocumentBlocks({
    content: editor.getJSON().content,
    pageId,
    pagePath: pageBlock.path,
    candidateIds,
    blocksById,
    orderedBlockIds,
    currentDocIdSet,
    rawUpdates,
    remainingCandidateIds,
    collectStructure: structureDirty,
  });

  /**
   * 步骤 3：过滤出真正变更的 block
   * 
   * 通过 hasBlockChanged 对比 Store 中的旧数据和新数据
   */
  const updates = rawUpdates.filter((update) => hasBlockChanged(blocksById[update.id], update));

  /**
   * 步骤 4：检测删除的 block
   * 
   * 在旧结构（pageBlock.contentIds）中存在，但在新文档中不存在
   */
  const deletedIds = structureDirty
    ? pageBlock.contentIds.filter((id) => !currentDocIdSet.has(id))
    : [];

  /**
   * 步骤 5：检测结构变化
   * 
   * 比较旧的 contentIds 和新的 orderedBlockIds
   */
  return {
    updates,
    deletedIds,
    pageStructure: !structureDirty || haveSameIds(pageBlock.contentIds, orderedBlockIds)
      ? undefined // 结构未变化
      : {
        pageId,
        contentIds: orderedBlockIds, // 新的子节点顺序
      },
  };
}
