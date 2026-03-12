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
 *   usePageTreeQuery     → GET /api/admin/blocks/tree      (侧边栏目录)
 *   usePageBlocksQuery   → GET /api/admin/pages/:id/blocks (文章内容)
 *   useBlockSyncMutation → PUT /api/admin/blocks           (批量同步)
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useBlockStore } from '@/store/useBlockStore';
import {
  fetchPageTree,
  fetchPageBlocks,
  fetchPageDetail,
  syncBlocks,
  type PageTreeNode,
} from '@/api/blocks';
import type { BlockData, BlockSyncPayload } from '@blog/types';

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
  /** 文章的所有内容块（段落、标题、图片等，不含 page 块本身） */
  blocks: BlockData[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * 加载指定 Page 的所有内容 Block。
 *
 * - 触发时机：路由参数 pageId 变化（用户点击侧边栏或直接访问 URL）
 * - gcTime=5min：切换到其他页面后仍缓存，快速切换回来无需重新请求
 * - enabled=!!pageId：pageId 为 null 时不发请求
 *
 * @param pageId - 目标 Page 的 UUID（为 null 时 hook 静默）
 */
export function usePageBlocksQuery(pageId: string | null): UsePageBlocksQueryResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: blockQueryKeys.pageBlocks(pageId ?? ''),
    queryFn: () => fetchPageBlocks(pageId!),
    enabled: !!pageId,
    staleTime: 30 * 1000,        // 30s 内认为数据新鲜（编辑场景：本地 Store 是 source of truth）
    gcTime: 5 * 60 * 1000,       // 缓存保留 5 分钟（切换页面后快速切回无需重新请求）
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
  });

  return {
    page: data ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook 3：批量同步 Mutation
// ─────────────────────────────────────────────────────────────────────────────

interface UseBlockSyncMutationOptions {
  /** 同步成功后的回调（可用于显示 Toast 或日志） */
  onSuccess?: () => void;
  /** 同步失败后的回调（可用于显示错误提示） */
  onError?: (error: Error) => void;
}

interface UseBlockSyncMutationResult {
  /** 触发同步，通常由防抖定时器在检测到 dirty blocks 时调用 */
  sync: (payload: BlockSyncPayload) => void;
  /** 当前是否有请求正在进行中 */
  isSyncing: boolean;
  /** 上次同步请求是否以失败告终 */
  isError: boolean;
}

/**
 * 批量同步 Block 变更。
 *
 * 成功后：
 *  1. 调用 store.clearDirtyState() 重置 dirty 集合
 *  2. 精确失效当前页面的 Block 缓存（refetchType: 'inactive'），
 *     避免立即重新请求打断编辑体验，仅在用户离开此页面后下次进来时刷新
 *
 * 失败后：
 *  - 不清除 dirty 状态（下次防抖触发时自动重试）
 *  - 触发 onError 回调（调用方可展示 Toast 提示）
 *
 * @param activePageId - 当前活跃页面 ID，用于精确失效对应缓存
 * @param options - 成功/失败回调
 */
export function useBlockSyncMutation(
  activePageId: string | null,
  options?: UseBlockSyncMutationOptions,
): UseBlockSyncMutationResult {
  const queryClient = useQueryClient();
  const clearDirtyState = useBlockStore((s) => s.clearDirtyState);

  const { mutate, isPending, isError } = useMutation({
    mutationFn: (payload: BlockSyncPayload) => syncBlocks(payload),

    onSuccess: () => {
      // 1. 清除 Store 的 dirty 标记（本次变更已持久化）
      clearDirtyState();

      // 2. 精确失效缓存：告知 React Query 该页面缓存已过期，
      //    但不立即重新请求（等用户下次进来时再拉取）
      if (activePageId) {
        void queryClient.invalidateQueries({
          queryKey: blockQueryKeys.pageBlocks(activePageId),
          refetchType: 'inactive', // 仅在组件不活跃时触发重新拉取
        });
      }

      options?.onSuccess?.();
    },

    onError: (error: Error) => {
      // 同步失败：保留 dirty 状态，等待下次重试
      console.error('[BlockSync] 同步失败:', error.message);
      options?.onError?.(error);
    },
  });

  return {
    sync: mutate,
    isSyncing: isPending,
    isError,
  };
}
