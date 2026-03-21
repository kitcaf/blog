/**
 * @file useBlocksQuery.ts
 * @description React Query hooks，对应核心 API
 *
 * 数据流架构：
 *
 *   [ PostgreSQL / Go API ]
 *         ↑ ↓ (HTTP)
 *   [ React Query ]          ← 本文件：缓存、重试、后台刷新
 *         ↑ ↓
 *   [ 调用方（Sidebar / MainContent）] ← 读取数据并决定何时写入 Store
 *         ↑ ↓
 *   [ Zustand Store ]        ← 编辑器：Dirty Tracking、编辑缓存
 *         ↑ ↓
 *   [ React UI ]
 *
 * 设计原则：
 *  - Hook 只负责数据获取与缓存，不直接操作 Store
 *  - Store 的写入由"调用方"在 useEffect 中完成，保证单向数据流
 *  - 侧边栏数据完全由 React Query 管理，不经过 Store
 *  - 编辑器数据：React Query 加载 → Store 缓存 → Tiptap 编辑
 *
 * 三个 Hook：
 *   usePageTreeQuery   → GET /api/admin/blocks/tree      (侧边栏目录)
 *   usePageBlocksQuery → GET /api/admin/pages/:id/blocks (page block + 文章内容)
 *   usePageDetailQuery → GET /api/admin/pages/:id        (页面元数据)
 */

import {
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  fetchPageTree,
  fetchPageBlocks,
  fetchPageDetail,
  type PageTreeNode,
} from '@/api/blocks';
import type { BlockData } from '@blog/types';

// ─────────────────────────────────────────────────────────────────────────────
// Query Key 工厂（集中管理，保证缓存失效的精确性）
// ─────────────────────────────────────────────────────────────────────────────

export const blockQueryKeys = {
  /** 侧边栏目录树 */
  pageTree: () => ['pageTree'] as const,
  /** 某篇文章的内容 Block 列表 */
  pageBlocks: (pageId: string) => ['pageBlocks', pageId] as const,
  /** 单个页面详情（page 块本身） */
  pageDetail: (pageId: string) => ['pageDetail', pageId] as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Hook 1：侧边栏目录树
// ─────────────────────────────────────────────────────────────────────────────

interface UsePageTreeQueryResult {
  /** 树形结构，供侧边栏递归渲染 */
  tree: PageTreeNode[];
  /** 扁平列表，供调用方 hydrate 到 Zustand Store */
  flatPages: BlockData[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** 手动触发重新请求 */
  refetch: () => void;
}

/**
 * 加载并缓存侧边栏目录树。
 *
 * - 只拉取 type='page 、 foloder' 的块（由后端过滤），不含文章段落内容。
 * - staleTime=5min：目录结构变化频率低，避免频繁请求。
 * - 返回 flatPages，供 Sidebar 在 useEffect 中 hydrate 到 Store。
 *
 * @param options - 可覆盖 useQuery 默认配置
 */
export function usePageTreeQuery(
  options?: Partial<UseQueryOptions<{ flatPages: BlockData[]; tree: PageTreeNode[] }>>,
): UsePageTreeQueryResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: blockQueryKeys.pageTree(),
    queryFn: fetchPageTree,
    staleTime: 10 * 60 * 1000, // 5 分钟内不重新请求
    ...options,
  });

  return {
    tree: data?.tree ?? [],
    flatPages: data?.flatPages ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 已移除懒加载 Hook，统一使用全量目录树缓存
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Hook 2：某篇文章的内容 Block 列表
// ─────────────────────────────────────────────────────────────────────────────

interface UsePageBlocksQueryResult {
  /** 页面完整文档快照：第 1 项是 page block，后续是正文块 */
  blocks: BlockData[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * 加载指定 Page 的完整文档 Block 列表。
 *
 * - 触发时机：路由参数 pageId 变化（用户点击侧边栏或直接访问 URL）
 * - gcTime=5min：切换到其他页面后仍缓存，快速切换回来无需重新请求
 * - enabled=!!pageId：pageId 为 null 时不发请求
 * - refetchOnMount=false：编辑场景下，本地 Store 是 source of truth，避免重新获取
 * - 返回约定：数组第 1 项始终是 page block，本地编辑器据此拆分标题和正文
 *
 * @param pageId - 目标 Page 的 UUID（为 null 时 hook 静默）
 */
export function usePageBlocksQuery(pageId: string | null): UsePageBlocksQueryResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: blockQueryKeys.pageBlocks(pageId ?? ''),
    queryFn: () => fetchPageBlocks(pageId!),
    enabled: !!pageId,
    staleTime: 60 * 1000 * 30,        // 30分钟内认为数据新鲜（编辑场景：本地 Store 是 source of truth）
    gcTime: 5 * 60 * 1000,            // 缓存保留 5 分钟（切换页面后快速切回无需重新请求）
    refetchOnMount: false,            // 组件挂载时不重新获取（避免编辑时触发重渲染）
    refetchOnWindowFocus: false,      // 窗口聚焦时不重新获取（编辑场景下避免干扰）
  });

  return {
    blocks: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook 2.5：单个页面详情（page 块本身）
// ─────────────────────────────────────────────────────────────────────────────

interface UsePageDetailQueryResult {
  /** 页面块本身（包含 title 等元数据） */
  page: BlockData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * 加载指定 Page 块的详细信息（包含 title、icon 等元数据）。
 * 就是加载一个块
 * @param pageId - 目标 Page 的 UUID（为 null 时 hook 静默）
 */
export function usePageDetailQuery(pageId: string | null): UsePageDetailQueryResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: blockQueryKeys.pageDetail(pageId ?? ''),
    queryFn: () => fetchPageDetail(pageId!),
    enabled: !!pageId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,            // 组件挂载时不重新获取（避免编辑时触发重渲染）
    refetchOnWindowFocus: false,      // 窗口聚焦时不重新获取（编辑场景下避免干扰）
  });

  return {
    page: data ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

