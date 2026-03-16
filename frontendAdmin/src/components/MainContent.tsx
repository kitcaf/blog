/**
 * @file MainContent.tsx
 * @description 主内容区（基于路由参数加载页面）
 *
 * 职责：
 *  - 从路由参数 pageId 获取当前页面 ID
 *  - 渲染 TiptapEditor（编辑器自己负责加载数据）
 *
 * 注意：TiptapEditor 内部会调用 usePageDetailQuery 和 usePageBlocksQuery
 * 来加载页面数据，MainContent 只负责路由和布局。
 */

import { useParams } from 'react-router-dom';
import { PanelLeftOpen } from 'lucide-react';
import { useSidebarStore } from '@/store/useSidebarStore';
import { TiptapEditor } from './editor/TiptapEditor';
import { ArticleNavBar } from './editor/components/ArticleNavBar';

export function MainContent() {
  // 从路由参数获取 pageId
  const { pageId } = useParams<{ pageId?: string }>();

  // 获取侧边栏的开关状态，以及设置方法
  const { isOpen, setIsOpen } = useSidebarStore();

  // ── 空状态：未选中页面 ────────────────────────────────────────────────────
  if (!pageId) {
    return (
      <main className="flex-1 h-full bg-app-bg overflow-y-auto relative">
        <div className="flex flex-col items-center justify-center h-full gap-3 text-app-fg-light select-none">
          <div className="text-5xl opacity-20">📝</div>
          <p className="text-sm max-w-xs text-center leading-relaxed">
            从侧边栏选择一个页面，或新建页面开始创作
          </p>
        </div>
      </main>
    );
  }

  // ── 正常渲染编辑器（上下布局：ArticleNavBar + TiptapEditor）───────────────
  return (
    <main className="flex-1 h-full bg-app-bg flex flex-col relative">
      {!isOpen && (
        <button
          className="absolute top-4 left-4 z-50 p-2 text-app-fg-light hover:text-app-fg-deeper hover:bg-app-hover rounded-md transition-colors"
          onClick={() => setIsOpen(true)}
          title="展开侧边栏"
        >
          <PanelLeftOpen size={20} />
        </button>
      )}

      {/* 顶部：ArticleNavBar 全宽 */}
      <ArticleNavBar />

      {/* 底部：TiptapEditor 容器（可滚动） */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[65%] mx-auto px-8 py-16 md:py-24 pb-48 transition-all duration-300">
          <TiptapEditor pageId={pageId} />
        </div>
      </div>
    </main>
  );
}
