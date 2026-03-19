/**
 * @file search.ts
 * @description 搜索相关 API
 */

import { apiClient } from './client';

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
 */
export async function searchPages(query: string): Promise<SearchResult[]> {
  const response = await apiClient.get<SearchResult[]>('/admin/search', {
    params: { q: query },
  });
  return response.data;
}
