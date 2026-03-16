import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { useBlockStore } from '@/store/useBlockStore';
import {
  parseTiptapNodeToInlineContent,
  parseTiptapNodeToProps,
  parseTiptapNodeType,
} from '../converter';

/**
 * @file DirtyTrackerExtension.ts
 * @description 利用 ProseMirror Transaction → Step → StepMap 机制精确追踪变更并提取数据
 * 
 * 核心设计：
 *   1. 扁平化追踪：
 *      - topLevelIds：收集所有有 blockId 的节点（包括列表项）
 *      - 对应 Block 模型的扁平结构（列表项是独立的 Block）
 *   
 *   2. 精确变更检测与数据提取（一次遍历完成）：
 *      - 通过 StepMap 精确定位变更范围，只遍历变更节点
 *      - 在遍历时同时提取节点的 content 和 props
 *      - 立即更新 Store，避免二次遍历
 *   
 *   3. 性能优化：
 *      - 只遍历变更范围，O(变更数) 而非 O(文档大小)
 *      - 数据提取和标记在同一个地方，避免重复遍历
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

        /**
         * ProseMirror 核心appendTransaction
         * 
         * @param transactions：事务数组，导致这次状态变更的所有事务的集合
         * @param oldState：旧状态快照，在这批 transactions 应用到文档之前，引擎内存中的完整文档树快照
         * @param newState：新状态快照，事务执行在内存中生成的全新文档树快照
         * @returns 
         */
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          // 跳过系统操作
          if (transactions.some(tr => tr.getMeta('preventUpdate') || tr.getMeta('isIdInjection'))) {
            return null;
          }

          const store = useBlockStore.getState();
          const pageBlock = pageId ? store.blocksById[pageId] : null;
          const changedBlockIds = new Set<string>();
          const deletedBlockIds = new Set<string>();
          let hasStructureChange = false;

          // 策略 1：精确收集变更节点并提取数据（一次遍历完成）
          transactions.forEach((tr) => {
            tr.steps.forEach((_step, stepIndex) => {
              const stepMap = tr.mapping.maps[stepIndex];

              // 通过 StepMap 精确定位变更范围
              stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                // 遍历新文档的变更范围
                newState.doc.nodesBetween(newStart, newEnd, (node, pos) => {
                  if (!node.attrs?.blockId) return true;

                  const id = node.attrs.blockId;
                  const nodeStart = pos;
                  const nodeEnd = pos + node.nodeSize;

                  // 检查变更范围是否真的在这个节点内部
                  // 如果变更范围与节点范围有交集，说明这个节点真的变了
                  if (newStart < nodeEnd && newEnd > nodeStart) {
                    changedBlockIds.add(id);

                    // 立即提取数据并更新 Store
                    const jsonNode = node.toJSON();
                    const content = parseTiptapNodeToInlineContent(jsonNode);
                    const props = parseTiptapNodeToProps(jsonNode);

                    // 构造 metadata（如果是新节点）
                    const metadata = (!store.blocksById[id] && pageBlock) ? {
                      type: parseTiptapNodeType(node.type.name),
                      parentId: pageId!,
                      path: `${pageBlock.path}${id}/`
                    } : undefined;

                    // 更新 Store（数据提取和更新在同一个地方）
                    store.updateSingleBlockData(id, content, props, metadata);
                  }

                  // 不递归子节点，让 nodesBetween 自己遍历
                  return true;
                });
              });
            });
          });

          // 策略 2：检测结构变化（新增、删除、移动节点）
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
              const newIds = new Set<string>();

              newTopLevelIds.forEach((id: string) => {
                if (!oldSet.has(id)) {
                  newIds.add(id);
                  changedBlockIds.add(id);
                }
              });

              // 优化：一次遍历找到所有新增节点
              if (newIds.size > 0) {
                newState.doc.descendants((node) => {
                  const id = node.attrs?.blockId;
                  if (id && newIds.has(id)) {
                    const jsonNode = node.toJSON();
                    const content = parseTiptapNodeToInlineContent(jsonNode);
                    const props = parseTiptapNodeToProps(jsonNode);

                    const metadata = pageBlock ? {
                      type: parseTiptapNodeType(node.type.name),
                      parentId: pageId!,
                      path: `${pageBlock.path}${id}/`
                    } : undefined;

                    store.updateSingleBlockData(id, content, props, metadata);

                    // 从集合中移除已找到的节点
                    newIds.delete(id);

                    // 如果所有新节点都找到了，提前停止遍历
                    if (newIds.size === 0) return false;
                  }
                  return true;
                });
              }
            }
          }

          // 策略 3：更新 Store 状态

          // 标记内容变更的块
          if (changedBlockIds.size > 0) {
            changedBlockIds.forEach((id) => store.markBlockDirty(id));
          }

          // 处理删除（删除会从 dirtySet 中移除，所以要后执行）
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
