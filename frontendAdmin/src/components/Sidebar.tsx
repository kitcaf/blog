/**
 * @file Sidebar.tsx
 * @description 侧边栏组件，接入 React Query 加载页面目录树。
 *
 * 数据流：
 *   usePageTreeQuery → GET /api/pages/tree → buildPageTree()（在 API 层）
 *   → PageTreeNode[] → Zustand hydrate（部分） → 渲染目录树
 *
 * 性能：
 *  - 目录树 staleTime=5min，切换路由不重复请求
 *  - PageTreeItem 订阅单个 pageId 的标题，精确 re-render
 *  - 展开/折叠状态本地维护（Set<string>），不污染全局 Store
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Search,
  Home,
  Settings,
  Trash,
  Plus,
  UserPlus,
  ChevronRight,
  FileText,
  Loader2,
  AlertCircle,
  RefreshCw,
  PanelLeftClose,
} from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import { useSidebarStore } from '@/store/useSidebarStore';
import { usePageTreeQuery } from '@/hooks/useBlocksQuery';
import type { PageTreeNode } from '@/api/blocks';

// ─────────────────────────────────────────────────────────────────────────────
// 主侧边栏
// ─────────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { tree, flatPages, isLoading, isError, error } = usePageTreeQuery();

  // 将 API 加载的 data 注入 Zustand Store（仅 flatPages 变化时执行）
  const hydrate = useBlockStore((s) => s.hydrate);
  const setActivePage = useBlockStore((s) => s.setActivePage);
  const activePageId = useBlockStore((s) => s.activePageId);

  // 侧边栏状态控制
  const { isOpen, width, setIsOpen } = useSidebarStore();

  useEffect(() => {
    if (flatPages.length === 0) return;
    hydrate(flatPages);

    // 若当前没有激活的页面，默认激活第一个根级 page
    if (!activePageId) {
      const firstPage = flatPages.find((b) => b.type === 'page' && b.parentId === null);
      if (firstPage) setActivePage(firstPage.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatPages]); // 仅 flatPages 变化时执行（hydrate/setActivePage 引用稳定）

  return (
    <aside 
      className="h-full bg-app-bg border-r border-border flex flex-col shrink-0 transition-all duration-300 overflow-hidden"
      style={{ 
        width: isOpen ? width : 0,
        opacity: isOpen ? 1 : 0,
        borderRightWidth: isOpen ? 1 : 0
      }}
    >
      <div 
        className="flex flex-col h-full overflow-y-auto overflow-x-hidden p-2 transition-opacity"
        style={{ width: width }} // 保持内部尺寸一致避免挤压文本变乱
      >
        {/* Workspace Switcher & Hide Toggle */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 p-2 hover:bg-app-hover rounded-md cursor-pointer flex-1">
            <div className="w-5 h-5 bg-app-hover rounded flex items-center justify-center text-xs font-medium text-app-fg-deeper">
              A
            </div>
            <span className="text-sm font-medium truncate text-app-fg-deep">个人工作区</span>
          </div>
          <button 
            className="p-1.5 text-app-fg-light hover:text-app-fg-deeper hover:bg-app-hover rounded-md transition-colors shrink-0"
            onClick={() => setIsOpen(false)}
            title="隐藏侧边栏"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* 主导航 */}
        <nav className="space-y-0.5">
          <SidebarNavItem icon={<Search size={16} />} label="搜索" />
          <SidebarNavItem icon={<Home size={16} />} label="主页" active />
        </nav>

        {/* 页面目录树 */}
        <div className="mt-6 flex flex-col gap-1">
          <div className="mb-1 px-2 text-xs font-medium text-app-fg-light flex justify-between items-center group cursor-pointer">
            <span className="group-hover:text-app-fg-deep transition-colors">页面</span>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-app-fg-deeper"
              aria-label="新建页面"
              title="新建页面"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* 加载中 */}
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-app-fg-light">
              <Loader2 size={13} className="animate-spin" />
              <span>加载中...</span>
            </div>
          )}

          {/* 加载出错 */}
          {isError && (
            <div className="mx-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-red-400 mb-1">
                <AlertCircle size={12} />
                <span>加载失败</span>
              </div>
              <p className="text-[11px] text-app-fg-light leading-snug">
                {error?.message ?? '无法连接到服务器'}
              </p>
              <button
                className="mt-1.5 flex items-center gap-1 text-[11px] text-app-fg hover:text-app-fg-deep transition-colors"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={10} />
                重试
              </button>
            </div>
          )}

          {/* 目录树节点 */}
          {!isLoading && !isError && tree.length === 0 && (
            <div className="px-3 py-2 text-xs text-app-fg-light">暂无页面</div>
          )}

          {!isLoading &&
            !isError &&
            tree.map((node) => (
              <PageTreeItem key={node.id} node={node} depth={0} />
            ))}
        </div>

        {/* 底部导航 */}
        <div className="mt-auto pt-4 space-y-0.5">
          <SidebarNavItem icon={<Settings size={16} />} label="设置" />
          <SidebarNavItem icon={<Trash size={16} />} label="回收站" />
        </div>
      </div>

      {/* 邀请按钮 */}
      <div className="p-2 border-t border-border">
        <div className="flex items-center gap-2 p-2 hover:bg-app-hover rounded-md cursor-pointer">
          <UserPlus size={16} className="text-app-fg-light" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-app-fg-deep">邀请成员</span>
            <span className="text-xs text-app-fg-light">与团队协作创作。</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 目录树节点（递归）
// ─────────────────────────────────────────────────────────────────────────────

interface PageTreeItemProps {
  node: PageTreeNode;
  depth: number;
}

function PageTreeItem({ node, depth }: PageTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children.length > 0;

  const activePageId = useBlockStore((s) => s.activePageId);
  const setActivePage = useBlockStore((s) => s.setActivePage);
  const isActive = activePageId === node.id;

  const handleClick = useCallback(() => {
    setActivePage(node.id);
    if (hasChildren) setIsExpanded((prev) => !prev);
  }, [node.id, hasChildren, setActivePage]);

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsExpanded((prev) => !prev);
    },
    [],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        className={`
          group flex items-center gap-1 px-2 py-[5px] rounded-md cursor-pointer
          text-sm transition-colors select-none
          ${isActive
            ? 'bg-app-hover text-app-fg-deeper'
            : 'text-app-fg hover:bg-app-hover hover:text-app-fg-deeper'
          }
        `}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        {/* 展开/折叠箭头 */}
        <span
          className={`
            flex-shrink-0 w-4 h-4 flex items-center justify-center
            transition-transform duration-150
            ${hasChildren ? 'text-app-fg-light hover:text-app-fg-deep' : 'opacity-0 pointer-events-none'}
            ${isExpanded ? 'rotate-90' : ''}
          `}
          onClick={hasChildren ? handleChevronClick : undefined}
          aria-hidden="true"
        >
          <ChevronRight size={12} />
        </span>

        {/* 图标 */}
        <span className="flex-shrink-0 text-[14px] leading-none">
          {node.icon ?? <FileText size={14} className="text-app-fg-light" />}
        </span>

        {/* 标题 */}
        <span className="flex-1 truncate text-[13px]">{node.title}</span>

        {/* 发布状态 */}
        {node.isPublished && (
          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 opacity-70" title="已发布" />
        )}
      </div>

      {/* 子节点（展开时渲染） */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <PageTreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 通用导航项
// ─────────────────────────────────────────────────────────────────────────────

function SidebarNavItem({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm font-medium transition-colors
        ${active ? 'bg-app-hover text-app-fg-deeper' : 'text-app-fg hover:bg-app-hover hover:text-app-fg-deeper'}`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
