/**
 * @file usePublishMutations.ts
 * @description 文章发布相关的 React Query mutations
 * 
 * 提供：
 * - usePublishPage: 发布单篇文章
 * - useUnpublishPage: 取消发布
 * - usePublishSubtree: 批量发布文件夹
 * - useUpdatePageMeta: 更新发布元数据
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  publishPage,
  unpublishPage,
  publishSubtree,
  updatePageMeta,
  type PublishPageRequest,
  type PublishSubtreeRequest,
  type UpdateMetaRequest,
} from '@/api/publish';
import { toast } from 'sonner';

/**
 * 发布单篇文章
 */
export function usePublishPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pageId, options }: { pageId: string; options?: PublishPageRequest }) =>
      publishPage(pageId, options),
    onSuccess: (result) => {
      // 刷新页面树和页面详情
      queryClient.invalidateQueries({ queryKey: ['pageTree'] });
      queryClient.invalidateQueries({ queryKey: ['pageBlocks', result.page_id] });
      queryClient.invalidateQueries({ queryKey: ['pageDetail', result.page_id] });
      
      toast.success('发布成功', {
        description: `文章已发布，访问地址：${result.preview_url}`,
      });
    },
    onError: (error: Error) => {
      toast.error('发布失败', {
        description: error.message || '请稍后重试',
      });
    },
  });
}

/**
 * 取消发布文章
 */
export function useUnpublishPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pageId: string) => unpublishPage(pageId),
    onSuccess: (_, pageId) => {
      queryClient.invalidateQueries({ queryKey: ['pageTree'] });
      queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] });
      queryClient.invalidateQueries({ queryKey: ['pageDetail', pageId] });
      
      toast.success('已取消发布');
    },
    onError: (error: Error) => {
      toast.error('取消发布失败', {
        description: error.message || '请稍后重试',
      });
    },
  });
}

/**
 * 批量发布文件夹下所有文章
 */
export function usePublishSubtree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ folderId, options }: { folderId: string; options?: PublishSubtreeRequest }) =>
      publishSubtree(folderId, options),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pageTree'] });
      
      toast.success('批量发布成功', {
        description: `已发布 ${result.published_count} 篇文章`,
      });
    },
    onError: (error: Error) => {
      toast.error('批量发布失败', {
        description: error.message || '请稍后重试',
      });
    },
  });
}

/**
 * 更新页面发布元数据
 */
export function useUpdatePageMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pageId, meta }: { pageId: string; meta: UpdateMetaRequest }) =>
      updatePageMeta(pageId, meta),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] });
      queryClient.invalidateQueries({ queryKey: ['pageDetail', pageId] });
      
      toast.success('元数据已更新');
    },
    onError: (error: Error) => {
      toast.error('更新失败', {
        description: error.message || '请稍后重试',
      });
    },
  });
}

