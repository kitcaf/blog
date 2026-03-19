/**
 * @file useSearchQuery.ts
 * @description 搜索查询 Hook
 */

import { useQuery } from '@tanstack/react-query';
import { searchPages } from '@/api/search';

export function useSearchQuery(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => searchPages(query),
    enabled: enabled && query.trim().length > 0,
    staleTime: 30000, // 30 秒内不重新请求
    gcTime: 5 * 60 * 1000, // 5 分钟缓存
  });
}
