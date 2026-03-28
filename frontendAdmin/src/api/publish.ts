/**
 * @file publish.ts
 * @description 文章发布相关 API
 * 
 * 功能：
 * - 单篇文章发布/取消发布
 * - 批量发布文件夹下所有文章
 * - 更新文章发布元数据（描述、标签、分类、slug）
 */

import { apiClient } from './client';

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 发布元数据更新请求 */
export interface UpdateMetaRequest {
  description?: { set: boolean; value: string | null };
  tags?: { set: boolean; value: string[] | null };
  category_id?: { set: boolean; value: string | null };
  slug?: { set: boolean; value: string | null };
}

/** 发布页面请求 */
export interface PublishPageRequest {
  category_id?: { set: boolean; value: string | null };
  tags?: { set: boolean; value: string[] | null };
  slug?: { set: boolean; value: string | null };
}

/** 批量发布请求 */
export interface PublishSubtreeRequest {
  category_id?: { set: boolean; value: string | null };
  tags?: { set: boolean; value: string[] | null };
}

/** 发布结果 */
export interface PublishPageResult {
  page_id: string;
  slug: string;
  published_at: string;
  preview_url: string;
}

/** 批量发布结果 */
export interface PublishSubtreeResult {
  root_id: string;
  published_count: number;
  skipped_count: number;
  effective_tags?: string[];
}

/** 博客分类 */
export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sort_order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API 函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /admin/pages/:id/meta
 * 更新页面发布元数据（不改变发布状态）
 */
export async function updatePageMeta(
  pageId: string,
  meta: UpdateMetaRequest
): Promise<void> {
  await apiClient.patch(`/admin/pages/${pageId}/meta`, meta);
}

/**
 * POST /admin/pages/:id/publish
 * 发布单篇文章
 */
export async function publishPage(
  pageId: string,
  options?: PublishPageRequest
): Promise<PublishPageResult> {
  const { data } = await apiClient.post<PublishPageResult>(
    `/admin/pages/${pageId}/publish`,
    options || {}
  );
  return data;
}

/**
 * POST /admin/pages/:id/unpublish
 * 取消发布文章
 */
export async function unpublishPage(pageId: string): Promise<void> {
  await apiClient.post(`/admin/pages/${pageId}/unpublish`);
}

/**
 * POST /admin/pages/:id/publish-subtree
 * 批量发布文件夹下所有文章
 */
export async function publishSubtree(
  folderId: string,
  options?: PublishSubtreeRequest
): Promise<PublishSubtreeResult> {
  const { data } = await apiClient.post<PublishSubtreeResult>(
    `/admin/pages/${folderId}/publish-subtree`,
    options || {}
  );
  return data;
}

/**
 * GET /admin/blog-categories
 * 获取所有博客分类
 */
export async function fetchBlogCategories(): Promise<BlogCategory[]> {
  const { data } = await apiClient.get<BlogCategory[]>('/admin/blog-categories');
  return data ?? [];
}

/**
 * POST /admin/blog-categories
 * 创建博客分类
 */
export async function createBlogCategory(params: {
  name: string;
  slug: string;
  description?: string;
}): Promise<BlogCategory> {
  const { data } = await apiClient.post<BlogCategory>('/admin/blog-categories', params);
  return data;
}

