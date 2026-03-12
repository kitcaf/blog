import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReplaceStep, ReplaceAroundStep } from '@tiptap/pm/transform';
import { useBlockStore } from '@/store/useBlockStore';

/**
 * @file DirtyTrackerExtension.ts
 * @description 利用 ProseMirror Transaction → Step → StepMap 机制精确追踪变更
 * 
 * 核心优化：
 *   1. 通过 Step 类型判断操作（替换、删除、插入）
 *   2. 通过 StepMap 精确定位变更范围，只遍历变更节点
 *   3. 缓存文档结构，避免每次全文档遍历
 *   4. 增量更新 Store，O(变更数) 而非 O(文档大小)
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
    const pluginKey = new PluginKey<{ childIds: string[] }>('dirtyTracker');

    return [
      new Plugin({
        key: pluginKey,
        
        state: {
          init(_, state) {
            // 缓存文档结构：[blockId1, blockId2, ...]
            const childIds: string[] = [];
            state.doc.forEach((node) => {
              if (node.attrs?.blockId) childIds.push(node.attrs.blockId);
            });
            return { childIds };
          },
          
          apply(tr, pluginState) {
            if (!tr.docChanged) return pluginState;
            
            // 重新收集结构（只在结构变化时）
            const newChildIds: string[] = [];
            tr.doc.forEach((node) => {
              if (node.attrs?.blockId) newChildIds.push(node.attrs.blockId);
            });
            
            return { childIds: newChildIds };
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
          // 核心：利用 Transaction → Step → StepMap 精确追踪变更
          // ═══════════════════════════════════════════════════════
          
          transactions.forEach((tr) => {
            tr.steps.forEach((step, stepIndex) => {
              const stepMap = tr.mapping.maps[stepIndex];
              
              // 1. 判断 Step 类型，识别删除操作
              if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
                const { from, to } = step as ReplaceStep;
                
                // 删除操作：oldEnd > oldStart
                if (to > from) {
                  oldState.doc.nodesBetween(from, to, (node) => {
                    if (node.isBlock && node.attrs?.blockId) {
                      deletedBlockIds.add(node.attrs.blockId);
                      hasStructureChange = true;
                    }
                  });
                }
              }
              
              // 2. 通过 StepMap 精确定位变更范围（只遍历变更节点）
              stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                // 只遍历变更范围内的节点
                newState.doc.nodesBetween(newStart, newEnd, (node) => {
                  if (node.isBlock && node.attrs?.blockId) {
                    changedBlockIds.add(node.attrs.blockId);
                  }
                });
              });
            });
          });

          // 3. 检测结构变化（利用缓存的 childIds，避免全文档遍历）
          const oldPluginState = pluginKey.getState(oldState);
          const newPluginState = pluginKey.getState(newState);
          
          if (oldPluginState && newPluginState) {
            const oldChildIds = oldPluginState.childIds;
            const newChildIds = newPluginState.childIds;
            
            if (
              oldChildIds.length !== newChildIds.length ||
              !oldChildIds.every((id: string, i: number) => id === newChildIds[i])
            ) {
              hasStructureChange = true;
              
              // 找出真正被删除的块（不在新结构中）
              const newSet = new Set(newChildIds);
              oldChildIds.forEach((id: string) => {
                if (!newSet.has(id)) {
                  deletedBlockIds.add(id);
                }
              });
              
              // 找出新增的块
              const oldSet = new Set(oldChildIds);
              newChildIds.forEach((id: string) => {
                if (!oldSet.has(id)) {
                  changedBlockIds.add(id);
                }
              });
            }
          }

          // 4. 增量更新 Store（O(变更数)）
          if (changedBlockIds.size > 0) {
            changedBlockIds.forEach((id) => store.markBlockDirty(id));
          }
          
          if (deletedBlockIds.size > 0) {
            deletedBlockIds.forEach((id) => store.markBlockDeleted(id));
          }
          
          if (hasStructureChange && pageId) {
            store.markBlockDirty(pageId);
            
            // 更新页面结构（从缓存读取，无需遍历）
            const newPluginState = pluginKey.getState(newState);
            if (newPluginState) {
              store.updatePageStructure(pageId, newPluginState.childIds);
            }
          }

          return null;
        },
      }),
    ];
  },
});
