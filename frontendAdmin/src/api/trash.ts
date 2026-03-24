/**
 * @file trash.ts
 * @description 回收站相关 API
 */

import { apiClient } from './client';

export interface TrashItem {
  id: string;
  type: 'page' | 'folder';
  title: string;
  icon: string;
  deleted_at: string;
  deleted_by?: string;
  deleted_parent_id?: string;
  deleted_order?: number;
  child_folder_count: number;
  child_page_count: number;
}

/**
 * 获取回收站列表
 */
export async function fetchTrashItems(): Promise<TrashItem[]> {
  const { data } = await apiClient.get<TrashItem[]>('/admin/trash');
  return data ?? [];
}

/**
 * 恢复回收站项目
 */
export async function restoreTrashItem(id: string): Promise<void> {
  await apiClient.post(`/admin/trash/${id}/restore`);
}

/**
 * 永久删除单个回收站项目
 */
export async function deleteTrashItem(id: string): Promise<void> {
  await apiClient.delete(`/admin/trash/${id}`);
}

/**
 * 批量永久删除回收站项目
 */
export async function batchDeleteTrashItems(ids: string[]): Promise<void> {
  await apiClient.post('/admin/trash/batch-delete', { ids });
}
