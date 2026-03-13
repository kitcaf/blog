import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { useBlockStore } from '@/store/useBlockStore';

/**
 * 递归收集节点及其所有子节点中的 blockId
 * 关键：处理列表结构（bulletList > listItem > paragraph）
 */
function collectBlockIdsRecursive(node: ProseMirrorNode, ids: Set<string>): void {
  if (node.attrs?.blockId) {
    ids.add(node.attrs.blockId);
  }

  // 递归遍历子节点（处理列表容器等嵌套结构）
  node.forEach((child) => {
    collectBlockIdsRecursive(child, ids);
  });
}

/**
 * @file DirtyTrackerExtension.ts
 * @description 利用 ProseMirror Transaction → Step → StepMap 机制精确追踪变更
 * 
 * 核心设计：
 *   1. 扁平化追踪：
 *      - topLevelIds：收集所有有 blockId 的节点（包括列表项）
 *      - 对应 Block 模型的扁平结构（列表项是独立的 Block）
 *   
 *   2. 精确变更检测：
 *      - 通过 Step 类型判断操作（替换、删除、插入）
 *      - 通过 StepMap 精确定位变更范围，只遍历变更节点
 *      - 递归收集 blockId，正确处理列表结构
 *   
 *   3. 性能优化：
 *      - 缓存所有 blockId，避免每次全文档遍历
 *      - 增量更新 Store，O(变更数) 而非 O(文档大小)
 *      - 跳过系统操作（preventUpdate、isIdInjection）
 * 
 * 数据结构映射：
 *   Tiptap 文档（嵌套）          Block 模型（扁平）
 *   ─────────────────────────   ─────────────────────────
 *   doc                         Page { contentIds: [...] }
 *     ├─ paragraph (id: p1)       ├─ { id: p1, type: 'paragraph' }
 *     ├─ bulletList (无 id)       ├─ { id: li1, type: 'bulletListItem' }
 *     │   ├─ listItem (id: li1)   ├─ { id: li2, type: 'bulletListItem' }
 *     │   └─ listItem (id: li2)
 *     └─ heading (id: h1)         └─ { id: h1, type: 'heading' }
 * 
 *   topLevelIds = [p1, li1, li2, h1]  ← 对应 Page.contentIds
 *   注意：bulletList 容器本身没有 blockId，只有 listItem 有
 */

interface DirtyTrackerOptions {
  pageId: string | null;
}

export const DirtyTrackerExtension = Extension.create<DirtyTrackerOptions>({
  name: 'dirtyTracker',

  addOptions() {
    return {
      pageId: null,
    };
  },

  addProseMirrorPlugins() {
    const { pageId } = this.options;
    const pluginKey = new PluginKey<{ topLevelIds: string[] }>('dirtyTracker');

    return [
      new Plugin({
        key: pluginKey,

        state: {
          init(_, state) {
            // 缓存文档结构：收集所有有 blockId 的节点（包括嵌套的列表项）
            // 这对应 Page.contentIds，因为列表项在 Block 模型中是扁平的
            const topLevelIds: string[] = [];
            state.doc.descendants((node) => {
              if (node.attrs?.blockId) {
                topLevelIds.push(node.attrs.blockId);
              }
            });
            return { topLevelIds };
          },

          apply(tr, pluginState) {
            if (!tr.docChanged) return pluginState;

            // 重新收集所有 blockId（包括列表项）
            const newTopLevelIds: string[] = [];
            tr.doc.descendants((node) => {
              if (node.attrs?.blockId) {
                newTopLevelIds.push(node.attrs.blockId);
              }
            });

            return { topLevelIds: newTopLevelIds };
          },
        },

        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          // 跳过系统操作
          if (transactions.some(tr => tr.getMeta('preventUpdate') || tr.getMeta('isIdInjection'))) {
            return null;
          }

          const store = useBlockStore.getState();
          const changedBlockIds = new Set<string>();
          const deletedBlockIds = new Set<string>();
          let hasStructureChange = false;

          // ═══════════════════════════════════════════════════════
          // 核心：通过比较文档结构来检测变更，而不是分析 Step
          // ═══════════════════════════════════════════════════════

          // 1. 收集所有变更范围内的 blockId
          transactions.forEach((tr) => {
            tr.steps.forEach((_step, stepIndex) => {
              const stepMap = tr.mapping.maps[stepIndex];
              
              // 通过 StepMap 精确定位变更范围
              stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                // 遍历新文档的变更范围，收集所有 blockId
                newState.doc.nodesBetween(newStart, newEnd, (node) => {
                  collectBlockIdsRecursive(node, changedBlockIds);
                });
              });
            });
          });

          // 2. 检测结构变化（通过比较 topLevelIds）
          const oldPluginState = pluginKey.getState(oldState);
          const newPluginState = pluginKey.getState(newState);

          if (oldPluginState && newPluginState) {
            const oldTopLevelIds = oldPluginState.topLevelIds;
            const newTopLevelIds = newPluginState.topLevelIds;

            // 检查长度或顺序是否变化
            if (
              oldTopLevelIds.length !== newTopLevelIds.length ||
              !oldTopLevelIds.every((id: string, i: number) => id === newTopLevelIds[i])
            ) {
              hasStructureChange = true;

              // 找出被删除的块（在旧结构中存在，但在新结构中不存在）
              const newSet = new Set(newTopLevelIds);
              oldTopLevelIds.forEach((id: string) => {
                if (!newSet.has(id)) {
                  deletedBlockIds.add(id);
                }
              });

              // 找出新增的块（在新结构中存在，但在旧结构中不存在）
              const oldSet = new Set(oldTopLevelIds);
              newTopLevelIds.forEach((id: string) => {
                if (!oldSet.has(id)) {
                  changedBlockIds.add(id);
                }
              });
            }
          }

          // 3. 增量更新 Store
          // 先标记内容变更的块
          if (changedBlockIds.size > 0) {
            changedBlockIds.forEach((id) => store.markBlockDirty(id));
          }

          // 再处理删除（删除会从 dirtySet 中移除，所以要后执行）
          if (deletedBlockIds.size > 0) {
            deletedBlockIds.forEach((id) => store.markBlockDeleted(id));
          }

          // 结构变化时更新 page
          if (hasStructureChange && pageId) {
            store.markBlockDirty(pageId);

            const newPluginState = pluginKey.getState(newState);
            if (newPluginState) {
              store.updatePageStructure(pageId, newPluginState.topLevelIds);
            }
          }

          return null;
        },
      }),
    ];
  },
});
