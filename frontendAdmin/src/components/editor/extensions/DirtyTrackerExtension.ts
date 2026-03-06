import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { useBlockStore } from '@/store/useBlockStore';

export const DirtyTrackerExtension = Extension.create({
  name: 'dirtyTracker',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dirtyTracker'),
        
        appendTransaction: (transactions, oldState, newState) => {
          // 如果没有任何实质性文档内容变动，直接跳过
          if (!transactions.some((tr) => tr.docChanged)) return null;

          // 若是由 hydration 等主动干预触发的替代，不需要记录为脏数据
          if (transactions.some(tr => tr.getMeta('preventUpdate') || tr.getMeta('isIdInjection'))) {
            return null;
          }

          const changedBlockIds = new Set<string>();
          let rootChanged = false;

          // 1. 解析本次事务的所有步骤 (Steps)，寻找内容变动的节点
          transactions.forEach((tr) => {
            tr.mapping.maps.forEach((stepMap) => {
              stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                newState.doc.nodesBetween(newStart, newEnd, (node) => {
                  if (node.isBlock && node.attrs.blockId) {
                    changedBlockIds.add(node.attrs.blockId);
                  }
                });
              });
            });
          });

          // 2. 核心：判断页面的父子结构（排序、增删）是否发生变动
          const oldChildIds: string[] = [];
          oldState.doc.forEach((node) => {
            if (node.attrs.blockId) oldChildIds.push(node.attrs.blockId);
          });
          
          const newChildIds: string[] = [];
          const newSet = new Set<string>();
          newState.doc.forEach((node) => {
            if (node.attrs.blockId) {
              newChildIds.push(node.attrs.blockId);
              newSet.add(node.attrs.blockId);
            }
          });

          const deletedBlockIds = new Set<string>();

          if (
            oldChildIds.length !== newChildIds.length ||
            !oldChildIds.every((id, i) => id === newChildIds[i])
          ) {
            rootChanged = true;
            
            // 旧的里有，新的里没有 => 彻底被删除了
            oldChildIds.forEach((id) => {
              if (!newSet.has(id)) deletedBlockIds.add(id);
            });
            
            // 新的里有，旧的里没有 => 新生成的（步骤 1 基本已囊括，但双重保险）
            newChildIds.forEach((id) => {
              if (!oldChildIds.includes(id)) changedBlockIds.add(id);
            });
          }

          // 3. 将抓到的脏 blockId 直接送入 Zustand Store的对应集合中
          if (changedBlockIds.size > 0 || deletedBlockIds.size > 0 || rootChanged) {
            const store = useBlockStore.getState();
            const { activePageId, markBlockDirty, markBlockDeleted } = store;

            if (changedBlockIds.size > 0) {
              changedBlockIds.forEach((id) => markBlockDirty(id));
            }
            if (deletedBlockIds.size > 0) {
              deletedBlockIds.forEach((id) => markBlockDeleted(id));
            }
            if (rootChanged && activePageId) {
              // 父页面的排序发生变化了，父级本身脏了
              markBlockDirty(activePageId);
            }
          }

          return null; // 不修改文档内容，仅做旁路记录
        },
      }),
    ];
  },
});
