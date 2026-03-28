/**
 * @file useBlogCategories.ts
 * @description 博客分类相关的 React Query hooks
 */

import { useQuery } from '@tanstack/react-query';
import { fetchBlogCategories } from '@/api/publish';

/**
 * 获取博客分类列表
 */
export function useBlogCategories() {
  return useQuery({
    queryKey: ['blogCategories'],
    queryFn: fetchBlogCategories,
    staleTime: 5 * 60 * 1000, // 5分钟内不重新请求
  });
}

