/**
 * @file DirtyTrackerExtension.ts
 * @description 轻量级脏标记扩展 - 在编辑事务中收集"可能变更的 blockId"
 * 
 * 设计目标：
 *   1. 输入关键路径只做极轻量的候选收集，避免在事务里做序列化/写 Store
 *   2. 候选集合宁可略宽，不可漏报；最终是否真的变更由 debounce flush 再确认
 *   3. 删除、新增、分裂、合并等复杂场景统一交给最终文档快照处理
 * 
 * 收集策略：
 *   1. Transaction 的 StepMap 范围：收集变更范围内的所有 blockId
 *   2. Selection 边界：收集光标前后的 blockId（处理边界编辑）
 *   3. 宁可多收集，不可漏报（性能影响小，准确性高）
 * 
 * 使用方式：
 *   - readDirtyTrackerCandidateIds(editor): 读取候选 ID 集合
 *   - resetDirtyTracker(editor): 清空候选 ID 集合
 */

import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type Selection, type Transaction } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

// Plugin 状态：只存储候选 ID 集合
interface DirtyTrackerPluginState {
  candidateIds: Set<string>; // 可能变更的 block ID 集合
}

// Plugin 元数据：用于控制 reset
interface DirtyTrackerMeta {
  type: 'reset';
}

const DIRTY_TRACKER_PLUGIN_KEY = new PluginKey<DirtyTrackerPluginState>('dirtyTracker');

/**
 * 工具函数：限制位置在文档范围内
 * 
 * 防止越界访问导致错误
 */
function clampPosition(doc: ProseMirrorNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}

/**
 * 工具函数：获取包含指定位置的最近 block ID
 * 
 * 从指定位置向上遍历节点树，找到第一个有 blockId 的节点
 * 
 * @param doc - ProseMirror 文档
 * @param rawPos - 原始位置
 * @returns block ID 或 null
 */
function getEnclosingBlockId(doc: ProseMirrorNode, rawPos: number): string | null {
  const pos = clampPosition(doc, rawPos);
  const $pos = doc.resolve(pos); // 解析位置为 ResolvedPos

  // 从当前深度向上遍历
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const id = node.attrs?.blockId;
    if (typeof id === 'string' && id.length > 0) {
      return id; // 找到第一个有 blockId 的节点
    }
  }

  return null; // 没有找到
}

/**
 * 工具函数：收集范围内所有 block ID
 * 
 * 遍历指定范围内的所有节点，收集有 blockId 的节点
 * 
 * @param doc - ProseMirror 文档
 * @param from - 起始位置
 * @param to - 结束位置
 * @param target - 目标集合（会被修改）
 */
function collectIdsFromRange(doc: ProseMirrorNode, from: number, to: number, target: Set<string>) {
  doc.nodesBetween(clampPosition(doc, from), clampPosition(doc, to), (node) => {
    const id = node.attrs?.blockId;
    if (typeof id === 'string' && id.length > 0) {
      target.add(id);
    }
    return true; // 继续遍历
  });
}

/**
 * 工具函数：收集边界位置的候选 ID
 * 
 * 收集 from, to 及其前后位置的包含 block
 * 这样可以捕获边界编辑（如在段落开头/结尾输入）
 * 
 * @param doc - ProseMirror 文档
 * @param from - 起始位置
 * @param to - 结束位置
 * @param target - 目标集合（会被修改）
 */
function collectBoundaryCandidateIds(doc: ProseMirrorNode, from: number, to: number, target: Set<string>) {
  const boundaryPositions = [from, to, from - 1, to + 1]; // 边界及前后位置
  for (const pos of boundaryPositions) {
    const id = getEnclosingBlockId(doc, pos);
    if (id) {
      target.add(id);
    }
  }
}

/**
 * 工具函数：收集范围的候选 ID（范围 + 边界）
 * 
 * 组合策略：
 *   1. 如果 from !== to，收集范围内所有 block
 *   2. 收集边界位置的 block
 * 
 * @param doc - ProseMirror 文档
 * @param from - 起始位置
 * @param to - 结束位置
 * @param target - 目标集合（会被修改）
 */
function collectRangeCandidateIds(doc: ProseMirrorNode, from: number, to: number, target: Set<string>) {
  // 如果有范围（非光标），收集范围内所有 block
  if (from !== to) {
    collectIdsFromRange(doc, from, to, target);
  }

  // 收集边界位置的 block
  collectBoundaryCandidateIds(doc, from, to, target);
}

/**
 * 工具函数：收集 Selection 的候选 ID
 * 
 * 处理用户选区：
 *   1. 如果有选区（非空），收集选区内所有 block
 *   2. 收集选区边界的 block
 * 
 * @param doc - ProseMirror 文档
 * @param selection - 用户选区
 * @param target - 目标集合（会被修改）
 */
function collectSelectionCandidateIds(doc: ProseMirrorNode, selection: Selection, target: Set<string>) {
  const { from, to, empty } = selection;

  // 如果有选区（非空），收集选区内所有 block
  if (!empty) {
    collectIdsFromRange(doc, from, to, target);
  }

  // 收集选区边界的 block
  collectBoundaryCandidateIds(doc, from, to, target);
}

/**
 * 工具函数：收集 Transaction 的候选 ID
 * 
 * 遍历事务的所有 Step，收集变更范围的候选 ID
 * 
 * 策略：
 *   1. 遍历每个 Step 的 StepMap
 *   2. 对旧文档的变更范围收集 ID（删除场景）
 *   3. 对新文档的变更范围收集 ID（新增/修改场景）
 * 
 * @param tr - ProseMirror 事务
 * @param target - 目标集合（会被修改）
 */
function collectTransactionCandidateIds(tr: Transaction, target: Set<string>) {
  tr.steps.forEach((step, stepIndex) => {
    const stepMap = step.getMap(); // 获取 Step 的映射
    const oldDoc = tr.docs[stepIndex] ?? tr.before; // 旧文档
    const newDoc = stepIndex + 1 < tr.docs.length ? tr.docs[stepIndex + 1] : tr.doc; // 新文档

    // 遍历 StepMap 的所有变更范围
    stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
      // 收集旧文档的变更范围（处理删除）
      collectRangeCandidateIds(oldDoc, oldStart, oldEnd, target);
      // 收集新文档的变更范围（处理新增/修改）
      collectRangeCandidateIds(newDoc, newStart, newEnd, target);
    });
  });
}

/**
 * 工具函数：获取 Plugin 状态
 */
function getDirtyTrackerState(editor: Editor): DirtyTrackerPluginState | undefined {
  return DIRTY_TRACKER_PLUGIN_KEY.getState(editor.state);
}

/**
 * 公开 API：读取候选 ID 集合
 * 
 * 在 flushAndSync 时调用，获取可能变更的 block ID
 * 
 * @param editor - Tiptap 编辑器实例
 * @returns 候选 ID 集合（副本）
 */
export function readDirtyTrackerCandidateIds(editor: Editor | null): Set<string> {
  if (!editor) {
    return new Set<string>();
  }

  const pluginState = getDirtyTrackerState(editor);
  if (!pluginState) {
    return new Set<string>();
  }

  // 这里先选择不返回副本，而是直接返回，pluginState.candidateIds外层不能被修改
  return pluginState.candidateIds;
}

/**
 * 公开 API：重置候选 ID 集合
 * 
 * 在以下场景调用：
 *   1. flushAndSync 后，清空已处理的候选 ID
 *   2. 页面切换时，清空旧页面的候选 ID
 *   3. 初始化编辑器内容后，清空候选 ID
 * 
 * @param editor - Tiptap 编辑器实例
 */
export function resetDirtyTracker(editor: Editor | null) {
  if (!editor) {
    return;
  }

  const pluginState = getDirtyTrackerState(editor);
  // 如果没有候选 ID，跳过（避免不必要的事务）
  if (!pluginState || pluginState.candidateIds.size === 0) {
    return;
  }

  // 通过事务重置 Plugin 状态
  editor.commands.command(({ tr, dispatch }) => {
    tr.setMeta(DIRTY_TRACKER_PLUGIN_KEY, { type: 'reset' } satisfies DirtyTrackerMeta);
    tr.setMeta('preventUpdate', true); // 标记为系统操作，不触发 update 事件
    dispatch?.(tr);
    return true;
  });
}

/**
 * Tiptap 扩展：DirtyTracker
 * 
 * 通过 ProseMirror Plugin 实现轻量级的变更追踪
 */
export const DirtyTrackerExtension = Extension.create({
  name: 'dirtyTracker',

  addProseMirrorPlugins() {
    return [
      new Plugin<DirtyTrackerPluginState>({
        key: DIRTY_TRACKER_PLUGIN_KEY,

        state: {
          /**
           * 初始化 Plugin 状态
           */
          init: () => ({
            candidateIds: new Set<string>(),
          }),

          /**
           * 应用事务，更新 Plugin 状态
           * 
           * 执行流程：
           *   1. 检查是否是 reset 控制命令
           *   2. 检查是否是用户文档变更
           *   3. 收集候选 ID：
           *      - Transaction 的变更范围
           *      - 旧 Selection 的边界
           *      - 新 Selection 的边界
           * 
           * @param tr - 当前事务
           * @param pluginState - 当前 Plugin 状态
           * @param oldState - 旧编辑器状态
           * @param newState - 新编辑器状态
           * @returns 新的 Plugin 状态
           */
          apply: (tr, pluginState, oldState, newState) => {
            // console.log('插件-旧编辑器状态', oldState)
            // console.log('插件-新编辑器状态', newState)
            // 检查是否是 reset 控制命令
            const control = tr.getMeta(DIRTY_TRACKER_PLUGIN_KEY) as DirtyTrackerMeta | undefined;
            if (control?.type === 'reset') {
              return {
                candidateIds: new Set<string>(), // 清空候选 ID
              };
            }

            // 检查是否是用户文档变更
            // 跳过系统操作（preventUpdate、isIdInjection）
            const isUserDocChange =
              tr.docChanged && !tr.getMeta('preventUpdate') && !tr.getMeta('isIdInjection');

            if (!isUserDocChange) {
              return pluginState; // 不是用户变更，保持原状态
            }

            // 收集候选 ID
            const nextCandidateIds = new Set(pluginState.candidateIds); // 保留旧候选 ID

            // 1. 收集 Transaction 的变更范围
            collectTransactionCandidateIds(tr, nextCandidateIds);

            // 2. 收集旧 Selection 的边界（处理删除场景）
            collectSelectionCandidateIds(oldState.doc, oldState.selection, nextCandidateIds);

            // 3. 收集新 Selection 的边界（处理新增/修改场景）
            collectSelectionCandidateIds(newState.doc, newState.selection, nextCandidateIds);

            return {
              candidateIds: nextCandidateIds,
            };
          },
        },
      }),
    ];
  },
});
