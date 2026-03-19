/**
 * @file useSearchQuery.ts
 * @description 搜索查询 Hook
 * 
 * 使用 React Query 的优势：
 * - 自动缓存相同搜索词的结果（30秒内不重复请求）
 * - 自动去重并发请求（防止用户快速输入时的重复请求）
 * - 自动处理 loading/error 状态
 * - 垃圾回收机制（5分钟后清理不活跃的缓存）
 * 
 * 对接后端 API：GET /api/admin/search?q={query}
 */

import { useQuery } from '@tanstack/react-query';
import { searchPages } from '@/api/search';

/**
 * 搜索页面 Hook
 * @param query 搜索关键词
 * @param enabled 是否启用查询（默认 true）
 */
export function useSearchQuery(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['admin-search', query.trim()],
    queryFn: () => searchPages(query.trim()),
    enabled: enabled && query.trim().length > 0,
    staleTime: 30_000, // 30 秒内认为数据新鲜，不重新请求
    gcTime: 2 * 60 * 1000, // 5 分钟后清理缓存
    retry: 1, // 失败后重试 1 次
  });
}
