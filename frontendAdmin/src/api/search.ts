/**
 * @file search.ts
 * @description 搜索相关 API
 * 
 * 对接后端接口：
 * - GET /api/admin/search?q={query} - 搜索所有页面（管理后台）
 * - GET /api/public/search?q={query} - 搜索已发布页面（前台）
 */

import { apiClient } from './client';

/**
 * 搜索结果项
 */
export interface SearchResult {
  page_id: string;
  page_title: string;
  page_icon?: string;
  page_path: string;
  max_score: number;
  match_count: number;
  page_score: number;
  updated_at: string;
  representative_block?: {
    block_id: string;
    block_type: string;
    content: string;
    score: number;
  };
  top_blocks?: Array<{
    block_id: string;
    block_type: string;
    content: string;
    score: number;
  }>;
}

/**
 * 搜索页面（管理后台）
 * @param query 搜索关键词
 * @returns 搜索结果列表
 */
export async function searchPages(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  const response = await apiClient.get<SearchResult[]>('/admin/search', {
    params: { q: query.trim() },
  });
  return response.data;
}
