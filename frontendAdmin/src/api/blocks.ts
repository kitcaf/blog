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

/**
 * 将扁平的 Block 数组组装成嵌套树结构（O(n)）。
 */
function buildPageTree(blocks: Block[]): PageTreeNode[] {
  console.log('[Sidebar] Building tree with blocks count:', blocks.length);
  const nodeMap = new Map<string, PageTreeNode>();

  for (const block of blocks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = block.props as any;
    nodeMap.set(block.id, {
      id: block.id,
      parentId: block.parentId,
      type: block.type as 'page' | 'folder',
      title: props?.title || '未命名',
      icon: props?.icon,
      isPublished: block.publishedAt != null,
      slug: block.slug ?? undefined,
      contentIds: block.contentIds,
      children: [],
    });
  }

  const roots: PageTreeNode[] = [];

  for (const node of nodeMap.values()) {
    // 逻辑优化：如果 parentId 缺失，或者指向一个不在当前列表中的节点，则将其视为根节点
    const parent = node.parentId ? nodeMap.get(node.parentId) : null;
    
    if (parent) {
      parent.children.push(node);
    } else {
      console.log('[Sidebar] Root node detected:', node.title, node.id);
      roots.push(node);
    }
  }

  console.log('[Sidebar] Tree built, roots count:', roots.length);
  return roots;
}


// ─────────────────────────────────────────────────────────────────────────────
// 三、API 1：侧边栏目录树（懒加载）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/blocks/tree?parent_id=xxx
 *
 * 获取某个节点的直接子节点（第一层）
 * @param parentId - 父节点 ID，不传或传 null 返回根节点
 */
export async function fetchChildren(parentId?: string | null): Promise<{
  children: BlockData[];
  tree: PageTreeNode[];
}> {
  if (USE_MOCK) {
    // Mock 模式：过滤出对应的子节点
    const children = initialMockData.filter((b) => 
      (parentId ? b.parentId === parentId : b.parentId === null) &&
      (b.type === 'page' || b.type === 'folder')
    );
    const tree = buildPageTree(children as unknown as Block[]);
    return { children, tree };
  }

  // 真实 API 模式
  const params = parentId ? { parent_id: parentId } : {};
  const { data } = await apiClient.get<DbBlock[]>(
    `/admin/blocks/tree`,
    { params }
  );
  
  const children = hydrateBlocks(data);
  const tree = buildPageTree(children);
  return { children, tree };
}

export async function fetchPageTree(): Promise<{
  flatPages: BlockData[];
  tree: PageTreeNode[];
}> {
  if (USE_MOCK) {
    // Mock 模式：直接返回根节点
    const { children, tree } = await fetchChildren(null);
    return { flatPages: children, tree };
  }

  // 真实环境：后端 GetTree 在 parent_id=null 时会自动查询用户的 root block
  // 并返回 root block 的子节点（真正的一级目录），所以只需要查询一次
  const { children, tree } = await fetchChildren(null);
  
  return { flatPages: children, tree };
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
