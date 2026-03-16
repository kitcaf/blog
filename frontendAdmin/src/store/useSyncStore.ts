/**
 * @file useSyncStore.ts
 * @description 同步状态管理 Store
 * 
 * 职责：
 *  - 管理全局同步状态（isSyncing, isError）
 *  - 提供状态更新方法
 *  - 与 ArticleNavBar 和 TiptapEditor 解耦
 * 
 * 性能优化：
 *  - 使用 Zustand 的选择器机制，只订阅需要的状态
 *  - ArticleNavBar 只订阅同步状态，不受编辑器影响
 *  - TiptapEditor 只更新状态，不订阅
 */

import { create } from 'zustand';

interface SyncState {
  /** 当前是否正在同步 */
  isSyncing: boolean;
  
  /** 是否同步失败 */
  isError: boolean;
  
  /** 设置同步状态 */
  setSyncing: (syncing: boolean) => void;
  
  /** 设置错误状态 */
  setError: (error: boolean) => void;
  
  /** 重置状态 */
  reset: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  isError: false,
  
  setSyncing: (syncing) => set({ isSyncing: syncing, isError: false }),
  
  setError: (error) => set({ isError: error, isSyncing: false }),
  
  reset: () => set({ isSyncing: false, isError: false }),
}));
