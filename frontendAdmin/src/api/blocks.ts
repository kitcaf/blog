/**
 * @file blocks.ts
 * @description Block 相关的 3 个核心 API 函数。
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  API 1  GET  /api/pages/tree   → 侧边栏目录树（仅含 page 块）    │
 * │  API 2  GET  /api/pages/:id/blocks → 某篇文章的所有子 Block      │
 * │  API 3  POST /api/blocks/sync  → 防抖后批量提交变更               │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 设计原则：
 *  - 函数只负责网络请求与原始数据转换（DbBlock → Block）
 *  - 不依赖任何 Zustand Store，保证单向数据流
 *  - 数据 hydrate 逻辑封装在此文件，与 Store 解耦
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
 * 后端返回扁平的 page DbBlock 列表（仅查 type='page'），
 * 前端在内存中通过 parent_id 组装成树，O(n) 复杂度。
 */
export interface PageTreeNode {
  id: string;
  parentId: string | null;
  title: string;
  icon?: string;
  isPublished?: boolean;
  children: PageTreeNode[];
}

/**
 * 将扁平的 page Block 数组组装成嵌套树结构（O(n)）。
 * 利用 Map 做 id → node 的快速查找，避免嵌套循环。
 */
function buildPageTree(pages: Block[]): PageTreeNode[] {
  // 过滤确保只处理 page 类型
  const nodeMap = new Map<string, PageTreeNode>();

  for (const page of pages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = page.props as any;
    nodeMap.set(page.id, {
      id: page.id,
      parentId: page.parentId,
      title: props?.title ?? '未命名页面',
      icon: props?.icon,
      isPublished: props?.isPublished,
      children: [],
    });
  }

  const roots: PageTreeNode[] = [];

  for (const node of nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // 孤立节点（父页面不在响应中，降级为根节点）
        roots.push(node);
      }
    }
  }

  return roots;
}

// ─────────────────────────────────────────────────────────────────────────────
// 三、API 1：侧边栏目录树
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/pages/tree
 *
 * 后端仅返回 type='page' 的 DbBlock（不含段落、标题等内容块），
 * 前端在内存中组装树，供侧边栏渲染。
 *
 * 对应 SQL（极快，命中物化路径索引）：
 *   SELECT id, parent_id, properties FROM blocks
 *   WHERE type = 'page' AND deleted_at IS NULL;
 */
export async function fetchPageTree(): Promise<{
  flatPages: BlockData[];
  tree: PageTreeNode[];
}> {
  if (USE_MOCK) {
    // Mock 模式：直接从内存数据过滤出 page 类型的块并构树
    const flatPages = initialMockData.filter((b) => b.type === 'page');
    // 注意：initialMockData 已经是 BlockData[] 格式，无需 hydrateBlocks
    const tree = buildPageTree(flatPages as unknown as Block[]);
    return { flatPages, tree };
  }

  const { data } = await apiClient.get<DbBlock[]>('/api/pages/tree');
  const flatPages = hydrateBlocks(data);
  const tree = buildPageTree(flatPages);
  return { flatPages, tree };
}

// ─────────────────────────────────────────────────────────────────────────────
// 四、API 2：某篇文章的所有 Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/pages/:pageId/blocks
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

  const { data } = await apiClient.get<DbBlock[]>(`/api/pages/${pageId}/blocks`);
  return hydrateBlocks(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// 五、API 3：批量同步（防抖后调用）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/blocks/sync
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
  await apiClient.post('/api/blocks/sync', payload);
}
