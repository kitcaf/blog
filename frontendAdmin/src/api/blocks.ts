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
import { initialMockData } from '@/mockData';

/** 环境变量控制：true → mock 模式，false → 真实 API 模式 */
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

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
  const { content, ...restProps } = db.properties as {
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
 * 侧边栏渲染所需的树节点结构。
 */
export interface PageTreeNode {
  id: string;
  parentId: string | null;
  type: 'page' | 'folder';
  title: string;
  icon?: string;
  isPublished?: boolean;
  slug?: string;
  contentIds: string[];
  children: PageTreeNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 三、API 1：侧边栏目录树全量加载
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 递归将后端的树状结构解析为前端需要的树和扁平数组
 */
function processTreeResponse(nodes: any[]): { tree: PageTreeNode[]; flatPages: BlockData[] } {
  const tree: PageTreeNode[] = [];
  const flatPages: BlockData[] = [];

  for (const node of nodes) {
    const treeNode: PageTreeNode = {
      id: node.id,
      parentId: node.parent_id || null,
      type: node.type as 'page' | 'folder',
      title: node.title || '未命名',
      icon: node.icon,
      isPublished: true, // 根据需求修改
      slug: undefined, // 根据需求修改
      contentIds: node.content_ids || [],
      children: [],
    };

    // 组装用于 store 的 flatPages
    flatPages.push({
      id: treeNode.id,
      parentId: treeNode.parentId,
      type: treeNode.type,
      contentIds: treeNode.contentIds,
      props: {
        title: treeNode.title,
        icon: treeNode.icon,
      },
      content: [],
    } as unknown as BlockData);

    if (node.children && node.children.length > 0) {
      const { tree: childTree, flatPages: childFlatPages } = processTreeResponse(node.children);
      treeNode.children = childTree;
      flatPages.push(...childFlatPages);
    }

    tree.push(treeNode);
  }

  return { tree, flatPages };
}

/**
 * GET /admin/blocks/tree
 * 
 * 获取完整的侧边栏目录树
 */
export async function fetchPageTree(): Promise<{
  flatPages: BlockData[];
  tree: PageTreeNode[];
}> {
  if (USE_MOCK) {
    // 省略Mock处理或者直接沿用旧的树构建逻辑...
    return { flatPages: [], tree: [] };
  }

  const { data } = await apiClient.get<any[]>(`/admin/blocks/tree`);
  return processTreeResponse(data || []);
}

// ─────────────────────────────────────────────────────────────────────────────
// 四、API 2：某篇文章的所有 Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/pages/:pageId/blocks
 *
 * 返回指定 page 下的所有内容块（段落、标题、图片等），
 * 注意：不含 page 块本身，后端只返回其直接/间接子块。
 *
 * @param pageId - 目标 Page Block 的 UUID
 */
export async function fetchPageBlocks(pageId: string): Promise<BlockData[]> {
  if (USE_MOCK) {
    // Mock 模式：返回 initialMockData 中所有 parentId 等于 pageId 的子块
    return initialMockData.filter((b) => b.parentId === pageId);
  }

  const { data } = await apiClient.get<DbBlock[]>(`/admin/pages/${pageId}/blocks`);
  return hydrateBlocks(data);
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
 * @param payload - 由 store.getSyncPayload() 计算得出
 */
export async function syncBlocks(payload: BlockSyncPayload): Promise<void> {
  if (USE_MOCK) {
    console.log('[MockSync] 正在同步变更 (Mock 模式下仅打印日志):', payload);
    return Promise.resolve();
  }
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
    parent_id: params.parentId || null, // null 时后端会自动使用 root block
    path: '', // 后端会自动计算正确的 path
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

  if (USE_MOCK) {
    console.log('[MockCreate] 创建文件夹 (Mock 模式):', folderBlock);
    return hydrateBlock(folderBlock);
  }

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
    parent_id: params.parentId || null, // null 时后端会自动使用 root block
    path: '', // 后端会自动计算正确的 path
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

  if (USE_MOCK) {
    console.log('[MockCreate] 创建页面 (Mock 模式):', pageBlock);
    return hydrateBlock(pageBlock);
  }

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
  if (USE_MOCK) {
    console.log('[MockMove] 移动 block (Mock 模式):', params);
    return Promise.resolve();
  }

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
  if (USE_MOCK) {
    console.log('[MockDelete] 删除 block (Mock 模式):', id);
    return Promise.resolve();
  }

  await apiClient.delete(`/admin/pages/${id}`);
}
