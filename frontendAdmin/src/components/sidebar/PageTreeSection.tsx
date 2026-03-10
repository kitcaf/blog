/**
 * @file PageTreeSection.tsx
 * @description 页面目录树区域：标题、新建按钮、树形列表
 */

import React, { useState, useCallback } from 'react';
import { Folder, Plus, Loader2, AlertCircle, RefreshCw, FolderIcon, FileText, ChevronRight } from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import { SidebarItem } from './SidebarItem';
import type { PageTreeNode } from '@/api/blocks';
import { ActionMenuIcons, type ActionMenuItem } from '@/components/ui/ActionMenu';

interface PageTreeSectionProps {
  tree: PageTreeNode[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onCreateFolder: (parentId?: string | null) => void;
  onCreatePage: (parentId?: string | null) => void;
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
            onClick={() => onCreateFolder(null)}
            className="p-1 hover:bg-app-hover rounded transition-colors"
            aria-label="新建文件夹"
            title="新建文件夹"
          >
            <Folder size={12} className="text-app-fg-light hover:text-app-fg-deeper" />
          </button>
          <button
            onClick={() => onCreatePage(null)}
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
            <PageTreeItem 
              key={node.id} 
              node={node} 
              depth={0}
              onCreateFolder={onCreateFolder}
              onCreatePage={onCreatePage}
            />
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
  onCreateFolder: (parentId?: string | null) => void;
  onCreatePage: (parentId?: string | null) => void;
}

const PageTreeItem = React.memo(function PageTreeItem({ 
  node, 
  depth,
  onCreateFolder,
  onCreatePage,
}: PageTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const [loadedChildren, setLoadedChildren] = useState<PageTreeNode[]>([]);
  const hasChildren = node.children.length > 0 || loadedChildren.length > 0;
  const displayChildren = loadedChildren.length > 0 ? loadedChildren : node.children;

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
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      
      // 如果是文件夹且未加载过子节点，则懒加载
      if (node.type === 'folder' && !isExpanded && loadedChildren.length === 0 && node.children.length === 0) {
        setIsLoadingChildren(true);
        try {
          const { fetchChildren } = await import('@/api/blocks');
          const { tree } = await fetchChildren(node.id);
          setLoadedChildren(tree);
        } catch (error) {
          console.error('加载子节点失败:', error);
        } finally {
          setIsLoadingChildren(false);
        }
      }
      
      setIsExpanded((prev) => !prev);
    },
    [node.id, node.type, node.children.length, isExpanded, loadedChildren.length],
  );

  const handleCreateFolder = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCreateFolder(node.id);
    },
    [node.id, onCreateFolder],
  );

  const handleCreatePage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCreatePage(node.id);
    },
    [node.id, onCreatePage],
  );

  // 获取图标（统一尺寸 16px）
  // 只有文件夹类型悬停时才显示展开箭头
  const getIcon = () => {
    // 文件夹类型 + 悬停时：显示展开箭头
    if (node.type === 'folder' && isHovered) {
      if (isLoadingChildren) {
        return <Loader2 size={16} className="text-app-fg-light animate-spin" />;
      }
      return (
        <ChevronRight 
          size={16} 
          className={`text-app-fg-light transition-transform cursor-pointer ${isExpanded ? 'rotate-90' : ''}`}
          onClick={handleChevronClick}
        />
      );
    }
    
    // 非悬停或非文件夹：显示默认图标
    if (node.icon) {
      return node.icon;
    }
    
    if (node.type === 'folder') {
      return <FolderIcon size={16} className="text-app-fg-light" />;
    }
    return <FileText size={16} className="text-app-fg-light" />;
  };

  // 构建操作菜单项
  const actionItems: ActionMenuItem[] = React.useMemo(() => {
    const items: ActionMenuItem[] = [];

    // 对于文件夹，支持新建子项
    if (node.type === 'folder') {
      items.push({
        id: 'create-folder',
        label: '新建文件夹',
        icon: ActionMenuIcons.createFolder,
        onClick: handleCreateFolder,
      });
      items.push({
        id: 'create-page',
        label: '新建页面',
        icon: ActionMenuIcons.createPage,
        onClick: handleCreatePage,
      });
    }

    // 通用操作：重命名
    items.push({
      id: 'rename',
      label: '重命名',
      icon: ActionMenuIcons.rename,
      shortcut: 'F2',
      divided: node.type === 'folder', // 如果上面有新建按钮，这里加上分割线
      onClick: () => {
        // TODO: Implement rename
        console.log('Rename clicked for', node.id);
      },
    });

    // 通用操作：复制链接
    items.push({
      id: 'copy-link',
      label: '复制链接',
      icon: ActionMenuIcons.copyLink,
      onClick: () => {
        // TODO: Implement copy link
        console.log('Copy link clicked for', node.id);
      },
    });

    // 通用操作：删除
    items.push({
      id: 'delete',
      label: '删除',
      icon: ActionMenuIcons.trash,
      destructive: true,
      divided: true,
      onClick: () => {
        // TODO: Implement delete
        console.log('Delete clicked for', node.id);
      },
    });

    return items;
  }, [node.type, node.id, handleCreateFolder, handleCreatePage]);

  // 右侧状态指示器（仅 page 类型显示发布状态）
  const rightIndicator = node.type === 'page' && node.isPublished ? (
    <span className="w-1.5 h-1.5 rounded-full bg-green-400 opacity-70" title="已发布" />
  ) : undefined;

  return (
    <div>
      <SidebarItem
        icon={getIcon()}
        label={node.title}
        active={isActive}
        depth={depth}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        actionItems={actionItems}
        rightIndicator={rightIndicator}
        onClick={handleClick}
        onChevronClick={handleChevronClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />

      {/* 子节点（展开时渲染） */}
      {isExpanded && (
        <div>
          {displayChildren.length > 0 ? (
            displayChildren.map((child) => (
              <PageTreeItem 
                key={child.id} 
                node={child} 
                depth={depth + 1}
                onCreateFolder={onCreateFolder}
                onCreatePage={onCreatePage}
              />
            ))
          ) : (
            // 空状态提示
            <div 
              className="text-xs text-app-fg-light py-1.5 px-2"
              style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
            >
              暂无内容
            </div>
          )}
        </div>
      )}
    </div>
  );
});
