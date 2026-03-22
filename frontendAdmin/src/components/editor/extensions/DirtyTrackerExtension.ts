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
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  collectSelectionCandidateIds,
  collectTransactionCandidateIds,
  hasStructureChanged,
} from '../utils/dirtyTracker';

// Plugin 状态：存储候选 ID 集合和全量标记
interface DirtyTrackerPluginState {
  candidateIds: Set<string>; // 可能变更的 block ID 集合
  isAllDirty: boolean; // 是否需要全量同步（大文档保护）
  structureDirty: boolean; // 页面结构是否变化（增删、重排、拆合块）
}

// Plugin 元数据：用于控制 reset
interface DirtyTrackerMeta {
  type: 'reset';
}

const DIRTY_TRACKER_PLUGIN_KEY = new PluginKey<DirtyTrackerPluginState>('dirtyTracker');

/**
 * 工具函数：获取 Plugin 状态
 */
function getDirtyTrackerState(editor: Editor): DirtyTrackerPluginState | undefined {
  return DIRTY_TRACKER_PLUGIN_KEY.getState(editor.state);
}

/**
 * 公开 API：检查是否需要全量同步
 * 
 * 在 flushAndSync 时调用，判断是否需要遍历整个文档
 * 
 * @param editor - Tiptap 编辑器实例
 * @returns 是否需要全量同步
 */
export function isAllDirty(editor: Editor | null): boolean {
  if (!editor) {
    return false;
  }

  const pluginState = getDirtyTrackerState(editor);
  return pluginState?.isAllDirty ?? false;
}

export function isStructureDirty(editor: Editor | null): boolean {
  if (!editor) {
    return false;
  }

  const pluginState = getDirtyTrackerState(editor);
  return pluginState?.structureDirty ?? false;
}

/**
 * 公开 API：读取候选 ID 集合
 * 
 * 在 flushAndSync 时调用，获取可能变更的 block ID
 * 
 * 注意：如果 isAllDirty 为 true，应该遍历整个文档而不是只处理候选 ID
 * 
 * @param editor - Tiptap 编辑器实例
 * @returns 候选 ID 集合（直接返回，外层不应修改）
 */
export function readDirtyTrackerCandidateIds(editor: Editor | null): Set<string> {
  if (!editor) {
    return new Set<string>();
  }

  const pluginState = getDirtyTrackerState(editor);
  if (!pluginState) {
    return new Set<string>();
  }

  // 直接返回，外层不应修改（性能优化）
  return pluginState.candidateIds;
}

/**
 * 公开 API：重置候选 ID 集合和 isAllDirty 标记
 * 
 * 在以下场景调用：
 *   1. flushAndSync 后，清空已处理的候选 ID
 *   2. 页面切换时，清空旧页面的候选 ID
 *   3. 初始化编辑器内容后，清空候选 ID
 * 
 * @param editor - Tiptap 编辑器实例
 */
export function resetDirtyTracker(editor: Editor | null): void {
  if (!editor) {
    return;
  }

  const pluginState = getDirtyTrackerState(editor);
  // 如果没有候选 ID 且不是 isAllDirty / structureDirty，跳过（避免不必要的事务）
  if (
    !pluginState ||
    (pluginState.candidateIds.size === 0 && !pluginState.isAllDirty && !pluginState.structureDirty)
  ) {
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
 * 
 * 性能保护：变更范围超过文档长度的 50% 时，标记 isAllDirty 进行全量同步
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
            isAllDirty: false,
            structureDirty: false,
          }),

          /**
           * 应用事务，更新 Plugin 状态
           * 
           * 执行流程：
           *   1. 检查是否是 reset 控制命令
           *   2. 检查是否是用户文档变更
           *   3. 如果已经是 isAllDirty，直接返回
           *   4. 收集候选 ID（带性能保护）：
           *      - Transaction 的变更范围
           *      - 旧 Selection 的边界
           *      - 新 Selection 的边界
           *   5. 如果变更范围超过 50%，标记 isAllDirty
           * 
           * @param tr - 当前事务
           * @param pluginState - 当前 Plugin 状态
           * @param oldState - 旧编辑器状态
           * @param newState - 新编辑器状态
           * @returns 新的 Plugin 状态
           */
          apply: (tr, pluginState, oldState, newState) => {
            // 1. 检查是否是 reset 控制命令
            const control = tr.getMeta(DIRTY_TRACKER_PLUGIN_KEY) as DirtyTrackerMeta | undefined;
            if (control?.type === 'reset') {
              return {
                candidateIds: new Set<string>(),
                isAllDirty: false,
                structureDirty: false,
              };
            }

            // 2. 检查是否是用户文档变更
            // 跳过系统操作（preventUpdate、isIdInjection）
            const isUserDocChange =
              tr.docChanged && !tr.getMeta('preventUpdate') && !tr.getMeta('isIdInjection');

            if (!isUserDocChange) {
              return pluginState; // 不是用户变更，保持原状态
            }

            // 3. 如果已经是 isAllDirty，直接返回（无需继续收集）
            if (pluginState.isAllDirty) {
              return pluginState;
            }

            // 4. 收集候选 ID
            const nextCandidateIds = new Set(pluginState.candidateIds); // 保留旧候选 ID
            const structureDirty =
              pluginState.structureDirty || hasStructureChanged(oldState.doc, newState.doc);

            // 4.1 收集 Transaction 的变更范围（带性能保护）
            const exceedsThreshold = collectTransactionCandidateIds(tr, nextCandidateIds);
            if (exceedsThreshold) {
              // 变更范围超过 50%，标记为全量同步
              return {
                candidateIds: new Set<string>(), // 清空候选 ID（节省内存）
                isAllDirty: true,
                structureDirty: true,
              };
            }

            // 4.2 收集旧 Selection 的边界（处理删除场景）
            collectSelectionCandidateIds(oldState.doc, oldState.selection, nextCandidateIds);

            // 4.3 收集新 Selection 的边界（处理新增/修改场景）
            collectSelectionCandidateIds(newState.doc, newState.selection, nextCandidateIds);

            return {
              candidateIds: nextCandidateIds,
              isAllDirty: false,
              structureDirty,
            };
          },
        },
      }),
    ];
  },
});
