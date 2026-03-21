/**
 * @file blocks.ts
 * @description Block 相关的核心 API 函数。
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  API 1  GET  /admin/blocks/tree?parent_id=xxx → 侧边栏目录树     │
 * │  API 2  GET  /admin/pages/:id/blocks → 某篇文章的所有子 Block    │
 * │  API 3  PUT  /admin/blocks → 防抖后批量提交变更（RESTful）       │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 设计原则：
 *  - 函数只负责网络请求与原始数据转换（DbBlock → Block）
 *  - 不依赖任何 Zustand Store，保证单向数据流
 *  - 数据 hydrate 逻辑封装在此文件，与 Store 解耦
 *  - 所有数据通过 JWT 中间件自动隔离，无需传递 workspace_id
 */

import type { DbBlock, Block, BlockType, BlockData, BlockSyncPayload, InlineContent } from '@blog/types';
import { apiClient } from './client';

// ─────────────────────────────────────────────────────────────────────────────
// 一、内部工具：DbBlock → Block (hydrate)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将后端原始 DbBlock 解析为前端强类型 Block。
 * properties JSONB 字段中同时存储了 props（块属性）和 content（内联内容），
 * 此函数负责将二者拆分。
 * 
 * 注意：slug 和 published_at 是数据库独立字段，直接映射到 Block 顶层。
 */
function hydrateBlock(db: DbBlock): Block {
  // 安全地处理 properties 可能为 undefined 的情况
  const properties = db.properties || {};
  const { content, ...restProps } = properties as {
    content?: InlineContent[];
    [key: string]: unknown;
  };

  return {
    id: db.id,
    type: db.type as BlockType,
    parentId: db.parent_id,
    path: db.path,
    contentIds: db.content_ids ?? [],
    // BlockProps 强转：后端 JSONB 已按约定存储对应字段，类型安全由 Go 后端保证
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: (restProps ?? {}) as any,
    content: content ?? [],
    // 数据库独立字段
    slug: db.slug ?? undefined,
    publishedAt: db.published_at ?? undefined,
    // 审计字段
    createdBy: db.created_by,
    lastEditedBy: db.last_edited_by,
    // 时间戳
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deletedAt: db.deleted_at,
  } as Block;
}

/** 批量 hydrate DbBlock 数组 */
function hydrateBlocks(dbBlocks: DbBlock[]): Block[] {
  return dbBlocks.map(hydrateBlock);
}

// ─────────────────────────────────────────────────────────────────────────────
// 二、侧边栏目录树节点类型
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 侧边栏渲染所需的树节点结构（与后端 PageTreeNode 对应）
 * 
 * 注意：后端返回的结构中，title 和 icon 在顶层，不在 properties 中
 */
export interface PageTreeNode {
  id: string;
  parent_id: string | null;  // 后端返回 snake_case
  type: 'page' | 'folder';
  title: string;
  icon: string;
  content_ids: string[];     // 后端返回 snake_case
  children: PageTreeNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 三、API 1：侧边栏目录树全量加载
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/blocks/tree
 * 
 * 获取完整的侧边栏目录树
 * 
 * 注意：后端直接返回树形结构的 PageTreeNode[]，不需要前端再次构建树
 * 后端返回的字段是 snake_case (parent_id, content_ids)，需要转换为 camelCase
 */
export async function fetchPageTree(): Promise<{
  flatPages: BlockData[];
  tree: PageTreeNode[];
}> {
  const { data } = await apiClient.get<PageTreeNode[]>(`/admin/blocks/tree`);

  // 后端已经返回树形结构，直接使用
  // 同时将树形数据扁平化为 BlockData[] 供其他用途（如果需要）
  const flatPages: BlockData[] = [];

  const flattenTree = (nodes: PageTreeNode[]) => {
    for (const node of nodes) {
      flatPages.push({
        id: node.id,
        parentId: node.parent_id || null,
        type: node.type as BlockType,
        path: '', // 树形数据不包含 path
        contentIds: node.content_ids || [],
        props: {
          title: node.title,
          icon: node.icon,
        },
        content: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as BlockData);

      if (node.children && node.children.length > 0) {
        flattenTree(node.children);
      }
    }
  };

  flattenTree(data || []);

  return { flatPages, tree: data || [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 四、API 2：某篇文章的所有 Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/pages/:pageId/blocks
 *
 * 返回指定 page 的完整文档块列表：
 * - 第 1 项固定为 page block 本身
 * - 后续项为正文内容块（段落、标题、图片等）
 *
 * 管理端编辑器依赖这个约定，将标题区域与正文区域拆分渲染。
 * @param pageId - 目标 Page Block 的 UUID
 */
export async function fetchPageBlocks(pageId: string): Promise<BlockData[]> {
  const { data } = await apiClient.get<DbBlock[]>(`/admin/pages/${pageId}/blocks`);
  return hydrateBlocks(data);
}

/**
 * GET /admin/pages/:pageId
 *
 * 获取单个页面的详细信息（包含 page 块本身）
 * 就是获取某个block的数据
 * @param pageId - 目标 Page Block 的 UUID
 */
export async function fetchPageDetail(pageId: string): Promise<BlockData> {
  const { data } = await apiClient.get<DbBlock>(`/admin/pages/${pageId}`);
  return hydrateBlock(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// 五、API 3：批量同步（防抖后调用）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /admin/blocks
 *
 * 将防抖期间积累的变更一次性发送给后端。
 * 这是"本地优先 + 批量同步"方案的核心 API。
 *
 * 请求体格式：
 * ```json
 * {
 *   "updated_blocks": [{ "id": "uuid", "properties": {...} }],
 *   "deleted_blocks": ["uuid-1", "uuid-2"]
 * }
 * ```
 *
 * @param payload - 由 store.getSyncRequest() 返回的 payload
 */
export async function syncBlocks(payload: BlockSyncPayload): Promise<void> {
  await apiClient.put('/admin/blocks', payload);
}

// ─────────────────────────────────────────────────────────────────────────────
// 六、创建文件夹和页面
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateFolderParams {
  title: string;
  parentId?: string | null;
  icon?: string;
}

export interface CreatePageParams {
  title: string;
  parentId?: string | null;
  icon?: string;
}

/**
 * 创建新文件夹
 * 
 * 路径计算规则（物化路径）：
 * - 根目录节点：parent_id = null，后端会自动使用用户的 root block 作为父节点
 * - 子节点：parent_id = 父节点 ID
 * 
 * 后端会自动计算正确的 path：
 * - root block: /{root_id}/
 * - 根目录节点: /{root_id}/{id}/
 * - 子节点: {parent.path}{id}/
 * 
 * @param params - 文件夹参数
 * @returns 创建的文件夹 Block
 */
export async function createFolder(params: CreateFolderParams): Promise<BlockData> {
  const id = crypto.randomUUID();

  const folderBlock: DbBlock = {
    id,
    parent_id: params.parentId || null,
    path: '',
    type: 'folder',
    content_ids: [],
    properties: {
      title: params.title,
      icon: params.icon || '📁',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  const { data } = await apiClient.post<DbBlock>('/admin/pages', folderBlock);
  return hydrateBlock(data);
}

/**
 * 创建新页面
 * 
 * 路径计算规则同 createFolder
 * 
 * @param params - 页面参数
 * @returns 创建的页面 Block
 */
export async function createPage(params: CreatePageParams): Promise<BlockData> {
  const id = crypto.randomUUID();

  const pageBlock: DbBlock = {
    id,
    parent_id: params.parentId || null,
    path: '',
    type: 'page',
    content_ids: [],
    properties: {
      title: params.title,
      icon: params.icon || '📄',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  const { data } = await apiClient.post<DbBlock>('/admin/pages', pageBlock);
  return hydrateBlock(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// 七、移动 Block
// ─────────────────────────────────────────────────────────────────────────────

export interface MoveBlockParams {
  id: string;
  new_parent_id: string | null;
  new_content_ids: string[];
}

/**
 * POST /admin/pages/:id/move
 *
 * 移动 block 到新位置（改变 parent_id 和 path）
 * 
 * @param params - 移动参数
 */
export async function moveBlock(params: MoveBlockParams): Promise<void> {
  await apiClient.post(`/admin/pages/${params.id}/move`, {
    new_parent_id: params.new_parent_id,
    new_content_ids: params.new_content_ids,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 八、删除 Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /admin/pages/:id
 * 
 * @param id - 目标 Page / Folder 的 UUID
 */
export async function deletePage(id: string): Promise<void> {
  await apiClient.delete(`/admin/pages/${id}`);
}
