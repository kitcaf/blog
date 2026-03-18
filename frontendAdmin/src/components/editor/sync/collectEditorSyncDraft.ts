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
  parseTiptapNodeToInlineContent,
  parseTiptapNodeToProps,
  parseTiptapNodeType,
} from '../converter';
import type { EditorBlockUpdateDraft, EditorSyncDraft } from '@/store/useBlockStore';

interface CollectEditorSyncDraftParams {
  editor: Editor;
  pageId: string;
  pageBlock: Block; // 当前页面的 block
  candidateIds: Set<string>; // DirtyTracker 收集的候选 ID
  blocksById: Record<string, Block>; // Store 中的 block 缓存
}

/**
 * 比较两个 ID 数组是否完全相同（顺序和内容）
 */
function haveSameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * 判断 block 是否真正发生了变更
 * 
 * 比较维度：
 *   1. metadata（type, parentId, path）
 *   2. content（InlineContent 数组）
 *   3. props（属性对象）
 * 
 * 注意：使用 JSON.stringify 进行快速比较，性能可优化
 */
function hasBlockChanged(existingBlock: Block | undefined, nextBlock: EditorBlockUpdateDraft): boolean {
  // 新增 block，肯定变更
  if (!existingBlock) {
    return true;
  }

  // 比较 metadata
  if (
    existingBlock.type !== nextBlock.metadata?.type ||
    existingBlock.parentId !== nextBlock.metadata?.parentId ||
    existingBlock.path !== nextBlock.metadata?.path
  ) {
    return true;
  }

  // 比较 content（使用 JSON.stringify 快速比较）
  if (JSON.stringify(existingBlock.content) !== JSON.stringify(nextBlock.content)) {
    return true;
  }

  // 比较 props（合并后比较）
  const mergedProps = { ...existingBlock.props, ...nextBlock.props };
  return JSON.stringify(existingBlock.props) !== JSON.stringify(mergedProps);
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
}: CollectEditorSyncDraftParams): EditorSyncDraft {
  // 收集结果
  const orderedBlockIds: string[] = []; // 文档中所有 block 的顺序
  const currentDocIdSet = new Set<string>(); // 当前文档中存在的 block ID
  const rawUpdates: EditorBlockUpdateDraft[] = []; // 候选 block 的原始数据

  /**
   * 步骤 1 & 2：遍历文档，收集 ID 和提取候选数据
   * 
   * 性能优化：一次遍历完成所有工作
   */
  editor.state.doc.descendants((node) => {
    const id = node.attrs?.blockId;
    if (typeof id !== 'string' || id.length === 0) {
      return true; // 跳过没有 blockId 的节点
    }

    // 收集 ID 和顺序（用于结构检测）
    orderedBlockIds.push(id);
    currentDocIdSet.add(id);

    // 判断是否需要提取数据：候选 ID 或新 block
    const shouldExtract = candidateIds.has(id) || !blocksById[id];
    if (!shouldExtract) {
      return true; // 跳过不需要提取的节点
    }

    // 提取节点数据
    const jsonNode = node.toJSON();
    rawUpdates.push({
      id,
      content: parseTiptapNodeToInlineContent(jsonNode), // 提取 InlineContent
      props: parseTiptapNodeToProps(jsonNode), // 提取 props
      metadata: {
        type: parseTiptapNodeType(node.type.name), // 转换节点类型
        parentId: pageId,
        path: `${pageBlock.path}${id}/`, // 构造路径
      },
    });

    return true; // 继续遍历
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
  const deletedIds = pageBlock.contentIds.filter((id) => !currentDocIdSet.has(id));

  /**
   * 步骤 5：检测结构变化
   * 
   * 比较旧的 contentIds 和新的 orderedBlockIds
   */
  return {
    updates,
    deletedIds,
    pageStructure: haveSameIds(pageBlock.contentIds, orderedBlockIds)
      ? undefined // 结构未变化
      : {
        pageId,
        contentIds: orderedBlockIds, // 新的子节点顺序
      },
  };
}
