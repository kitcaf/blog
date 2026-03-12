/**
 * @file MainContent.tsx
 * @description 主内容区（基于路由参数加载页面）
 *
 * 职责：
 *  - 从路由参数 pageId 获取当前页面 ID
 *  - 触发 usePageBlocksQuery 加载对应文章的 Block
 *  - 数据加载成功后，通过局部 useEffect 补充水合（合并到 Store 的 blocksById）
 *  - 渲染加载/错误/空状态，以及 TiptapEditor
 *
 * 注意：侧边栏的 usePageTreeQuery 只加载 page 类型的块（目录结构），
 * 本组件的 usePageBlocksQuery 加载具体文章内的所有内容块（段落、标题等）。
 * 二者互不干扰，各自缓存独立。
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, FileText, AlertCircle, RefreshCw, PanelLeftOpen } from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import { useSidebarStore } from '@/store/useSidebarStore';
import { TiptapEditor } from './editor/TiptapEditor';
import { usePageBlocksQuery } from '@/hooks/useBlocksQuery';

export function MainContent() {
  // 从路由参数获取 pageId
  const { pageId } = useParams<{ pageId?: string }>();
  const blocksById = useBlockStore((s) => s.blocksById);

  // 获取侧边栏的开关状态，以及设置方法
  const { isOpen, setIsOpen } = useSidebarStore();

  // 加载当前活跃页面的内容 Blocks
  const { blocks, isLoading, isError, error } = usePageBlocksQuery(pageId ?? null);

  // 将 API 返回的内容 Block 合并到 Store
  useEffect(() => {
    if (blocks.length === 0) return;

    // 水合页面数据到 Store（用于编辑器）
    useBlockStore.getState().hydratePage(blocks);

  }, [blocks, pageId]);

  // ── 空状态：未选中页面 ────────────────────────────────────────────────────

  if (!pageId) {
    return (
      <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
        <EmptyState
          icon="📝"
          title="从侧边栏选择一个页面，或新建页面开始创作"
        />
      </main>
    );
  }

  // ── 活跃页面存在，但对应的 page 块还未水合进 Store ─────────────────────

  const activePage = blocksById[pageId];

  // ── 加载中 ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
        <div className="flex flex-col items-center justify-center h-full gap-3 text-app-fg-light">
          <Loader2 size={28} className="animate-spin opacity-40" />
          <p className="text-sm">加载文章中...</p>
        </div>
      </main>
    );
  }

  // ── 加载失败 ─────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
        <div className="flex flex-col items-center justify-center h-full gap-4 text-app-fg-light max-w-sm mx-auto text-center">
          <AlertCircle size={36} className="text-red-400 opacity-70" />
          <div>
            <p className="text-sm font-medium text-app-fg-deep mb-1">加载文章内容失败</p>
            <p className="text-xs text-app-fg-light">{error?.message ?? '请检查网络连接'}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-app-hover hover:bg-app-fg/10
                       text-sm text-app-fg-deep transition-colors"
          >
            <RefreshCw size={14} />
            重试
          </button>
        </div>
      </main>
    );
  }

  // ── 正常渲染编辑器 ───────────────────────────────────────────────────────
  return (
    <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
      {!isOpen && (
        <button
          className="absolute top-4 left-4 z-50 p-2 text-app-fg-light hover:text-app-fg-deeper hover:bg-app-hover rounded-md transition-colors"
          onClick={() => setIsOpen(true)}
          title="展开侧边栏"
        >
          <PanelLeftOpen size={20} />
        </button>
      )}

      {/* 调整最大宽度为百分比，避免硬编码像素 */}
      <div className="w-full max-w-[65%] mx-auto px-8 py-16 md:py-24 pb-48 transition-all duration-300">
        {/* 页面标题（从 page 块的 props 读取） */}
        {activePage?.type === 'page' && (
          <div className="mb-8">
          </div>
        )}

        {/* Tiptap 富文本编辑器 */}
        <TiptapEditor pageId={pageId} />
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 空状态组件
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-app-fg-light select-none">
      <FileText size={48} className="opacity-10" />
      <div className="text-5xl opacity-20">{icon}</div>
      <p className="text-sm max-w-xs text-center leading-relaxed">{title}</p>
    </div>
  );
}
