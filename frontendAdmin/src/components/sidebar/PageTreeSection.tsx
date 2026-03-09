/**
 * @file PageTreeSection.tsx
 * @description 页面目录树区域：标题、新建按钮、树形列表
 */

import React, { useState, useCallback } from 'react';
import { Folder, Plus, Loader2, AlertCircle, RefreshCw, ChevronRight, FolderIcon, FileText } from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import type { PageTreeNode } from '@/api/blocks';

interface PageTreeSectionProps {
  tree: PageTreeNode[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onCreateFolder: () => void;
  onCreatePage: () => void;
  onRetry: () => void;
}

export function PageTreeSection({
  tree,
  isLoading,
  isError,
  error,
  onCreateFolder,
  onCreatePage,
  onRetry,
}: PageTreeSectionProps) {
  return (
    <div className="mt-6 flex flex-col gap-1">
      {/* 标题和新建按钮 */}
      <div className="mb-1 px-2 flex justify-between items-center">
        <span className="text-xs font-medium text-app-fg-light">空间</span>
        <div className="flex gap-1">
          <button
            onClick={onCreateFolder}
            className="p-1 hover:bg-app-hover rounded transition-colors"
            aria-label="新建文件夹"
            title="新建文件夹"
          >
            <Folder size={12} className="text-app-fg-light hover:text-app-fg-deeper" />
          </button>
          <button
            onClick={onCreatePage}
            className="p-1 hover:bg-app-hover rounded transition-colors"
            aria-label="新建页面"
            title="新建页面"
          >
            <Plus size={12} className="text-app-fg-light hover:text-app-fg-deeper" />
          </button>
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading && <LoadingState />}

      {/* 错误状态 */}
      {isError && <ErrorState error={error} onRetry={onRetry} />}

      {/* 空状态 */}
      {!isLoading && !isError && tree.length === 0 && <EmptyState />}

      {/* 目录树 */}
      {!isLoading && !isError && tree.length > 0 && (
        <div>
          {tree.map((node) => (
            <PageTreeItem key={node.id} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部组件：状态展示
// ─────────────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-app-fg-light">
      <Loader2 size={13} className="animate-spin" />
      <span>加载中...</span>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
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
        onClick={onRetry}
      >
        <RefreshCw size={10} />
        重试
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-3 py-2 text-xs text-app-fg-light">
      暂无页面，点击上方按钮创建
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部组件：树节点（递归）
// ─────────────────────────────────────────────────────────────────────────────

interface PageTreeItemProps {
  node: PageTreeNode;
  depth: number;
}

const PageTreeItem = React.memo(function PageTreeItem({ node, depth }: PageTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children.length > 0;

  const activePageId = useBlockStore((s) => s.activePageId);
  const setActivePage = useBlockStore((s) => s.setActivePage);
  const isActive = activePageId === node.id;

  const handleClick = useCallback(() => {
    // 只有 page 类型才能激活（folder 不能打开编辑器）
    if (node.type === 'page') {
      setActivePage(node.id);
    }
    // 有子节点时切换展开状态
    if (hasChildren) {
      setIsExpanded((prev) => !prev);
    }
  }, [node.id, node.type, hasChildren, setActivePage]);

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsExpanded((prev) => !prev);
    },
    [],
  );

  // 获取默认图标（统一尺寸 14px）
  const getDefaultIcon = () => {
    if (node.type === 'folder') {
      return <FolderIcon size={14} className="text-app-fg-light shrink-0" />;
    }
    return <FileText size={14} className="text-app-fg-light shrink-0" />;
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        className={`
          group flex items-center gap-1.5 px-2 py-[5px] rounded-md cursor-pointer
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
            shrink-0 w-4 h-4 flex items-center justify-center
            transition-transform duration-150
            ${hasChildren ? 'text-app-fg-light hover:text-app-fg-deep' : 'opacity-0 pointer-events-none'}
            ${isExpanded ? 'rotate-90' : ''}
          `}
          onClick={hasChildren ? handleChevronClick : undefined}
          aria-hidden="true"
        >
          <ChevronRight size={12} />
        </span>

        {/* 图标：优先使用自定义图标，否则使用默认图标 */}
        {/* 统一容器尺寸确保对齐 */}
        <span className="shrink-0 w-[14px] h-[14px] flex items-center justify-center text-[14px] leading-none">
          {node.icon ? node.icon : getDefaultIcon()}
        </span>

        {/* 标题：使用 truncate 防止文字过长 */}
        <span className="flex-1 truncate text-[13px] min-w-0">{node.title}</span>

        {/* 发布状态（仅 page 类型显示） */}
        {node.type === 'page' && node.isPublished && (
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 opacity-70" title="已发布" />
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
});
