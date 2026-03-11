/**
 * @file PageTreeSection.tsx
 * @description 页面目录树区域：标题、新建按钮、树形列表（支持懒加载）
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Folder, Plus, Loader2, AlertCircle, RefreshCw, FolderIcon, FileText } from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import { SidebarItem } from './SidebarItem';
import { type PageTreeNode, moveBlock } from '@/api/blocks';
import { type ActionMenuItem } from '@/components/ui/ActionMenu';
import { ActionMenuIcons } from '@/components/ui/ActionMenuIcons';
import { Tree, type NodeRendererProps, type MoveHandler } from 'react-arborist';

interface PageTreeSectionProps {
  tree: PageTreeNode[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onCreateFolder: (parentId?: string | null) => void;
  onCreatePage: (parentId?: string | null) => void;
  onRetry: () => void;
  onMoveComplete?: () => void;
}

export function PageTreeSection({
  tree,
  isLoading,
  isError,
  error,
  onCreateFolder,
  onCreatePage,
  onRetry,
  onMoveComplete,
}: PageTreeSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setTreeHeight(entry.contentRect.height);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Debug: 打印树数据
  useEffect(() => {
    console.log('[PageTreeSection] Tree data:', tree);
    console.log('[PageTreeSection] Tree height:', treeHeight);
  }, [tree, treeHeight]);

  const handleMove: MoveHandler<PageTreeNode> = async ({ dragIds, parentId, index }) => {
    const activeId = dragIds[0];
    if (!activeId) return;

    const blocksById = useBlockStore.getState().blocksById;
    const rootPageIds = useBlockStore.getState().rootPageIds;

    const activeNode = blocksById[activeId];
    if (!activeNode) return;

    const newParentId = parentId === '__REACT_ARBORIST_INTERNAL_ROOT__' ? null : parentId;

    let newSiblingsIds: string[] = [];
    if (newParentId === null) {
      newSiblingsIds = [...rootPageIds];
    } else {
      newSiblingsIds = [...(blocksById[newParentId]?.contentIds || [])];
    }

    let oldContentIds: string[] = [];
    if (activeNode.parentId !== newParentId) {
      if (activeNode.parentId === null) {
        oldContentIds = [...rootPageIds];
      } else {
        oldContentIds = [...(blocksById[activeNode.parentId]?.contentIds || [])];
      }
      oldContentIds = oldContentIds.filter(id => id !== activeId);
      newSiblingsIds = newSiblingsIds.filter(id => id !== activeId);
    } else {
      newSiblingsIds = newSiblingsIds.filter(id => id !== activeId);
    }

    const insertIndex = index >= 0 ? index : newSiblingsIds.length;
    newSiblingsIds.splice(insertIndex, 0, activeId);

    try {
      if (activeNode.parentId === newParentId) {
        useBlockStore.getState().reorderChildren(newParentId, newSiblingsIds);
      } else {
        useBlockStore.getState().moveNode(activeId, newParentId, newSiblingsIds, activeNode.parentId, oldContentIds);
      }

      await moveBlock({
        id: activeId,
        new_parent_id: newParentId,
        new_content_ids: newSiblingsIds,
      });
      onMoveComplete?.();
    } catch (err) {
      console.error('Move block failed:', err);
      onMoveComplete?.();
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-1 flex-1 overflow-hidden">
      {/* 标题和新建按钮 */}
      <div className="mb-1 px-2 flex justify-between items-center shrink-0">
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

      {isLoading && <LoadingState />}
      {isError && <ErrorState error={error} onRetry={onRetry} />}
      {!isLoading && !isError && tree.length === 0 && <EmptyState />}

      {/* 目录树 */}
      {!isLoading && !isError && tree.length > 0 && (
        <PageTreeContext.Provider value={{ onCreateFolder, onCreatePage }}>
          <div ref={containerRef} className="flex-1 min-h-[200px]" style={{ position: 'relative' }}>
            <Tree
              data={tree}
              width='100%'
              height={treeHeight}
              indent={16}
              rowHeight={36}
              padding={0}
              onMove={handleMove}
              disableDrag={false}
              disableDrop={false}
              idAccessor="id"
              childrenAccessor="children"
            >
              {PageTreeItem}
            </Tree>
          </div>
        </PageTreeContext.Provider>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部组件：状态展示
// ─────────────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-app-fg-light shrink-0">
      <Loader2 size={13} className="animate-spin" />
      <span>加载中...</span>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="mx-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 shrink-0">
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
    <div className="px-3 py-2 text-xs text-app-fg-light shrink-0">
      暂无页面，点击上方按钮创建
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部组件：树节点（用于 react-arborist）
// ─────────────────────────────────────────────────────────────────────────────

const PageTreeContext = React.createContext<{
  onCreateFolder: (parentId?: string | null) => void;
  onCreatePage: (parentId?: string | null) => void;
}>({
  onCreateFolder: () => { },
  onCreatePage: () => { },
});

const PageTreeItem = React.memo(function PageTreeItem({
  node,
  style,
  dragHandle,
}: NodeRendererProps<PageTreeNode>) {
  const { onCreateFolder, onCreatePage } = React.useContext(PageTreeContext);

  const activePageId = useBlockStore((s) => s.activePageId);
  const setActivePage = useBlockStore((s) => s.setActivePage);

  const data = node.data;
  const isActive = activePageId === data.id;
  const isExpanded = node.isOpen;
  const hasChildren = data.contentIds && data.contentIds.length > 0;

  const handleClick = useCallback(() => {
    if (data.type === 'page') {
      setActivePage(data.id);
    }
  }, [data.id, data.type, setActivePage]);

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      node.toggle();
    },
    [node],
  );

  const handleCreateFolder = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCreateFolder(data.id);
    },
    [data.id, onCreateFolder],
  );

  const handleCreatePage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCreatePage(data.id);
    },
    [data.id, onCreatePage],
  );

  const getIcon = () => {
    if (data.icon) return data.icon;

    if (data.type === 'folder') {
      return <FolderIcon size={16} className="text-app-fg-light" />;
    }
    return <FileText size={16} className="text-app-fg-light" />;
  };

  const actionItems: ActionMenuItem[] = React.useMemo(() => {
    const items: ActionMenuItem[] = [];
    if (data.type === 'folder') {
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
    items.push({
      id: 'rename',
      label: '重命名',
      icon: ActionMenuIcons.rename,
      shortcut: 'F2',
      divided: data.type === 'folder',
      onClick: () => {
        console.log('Rename:', data.id);
      },
    });
    items.push({
      id: 'copy-link',
      label: '复制链接',
      icon: ActionMenuIcons.copyLink,
      onClick: () => {
        console.log('Copy link:', data.id);
      },
    });
    items.push({
      id: 'delete',
      label: '删除',
      icon: ActionMenuIcons.trash,
      destructive: true,
      divided: true,
      onClick: () => {
        console.log('Delete:', data.id);
      },
    });
    return items;
  }, [data.type, data.id, handleCreateFolder, handleCreatePage]);

  const rightIndicator = data.type === 'page' && data.isPublished ? (
    <span className="w-1.5 h-1.5 rounded-full bg-green-400 opacity-70" title="已发布" />
  ) : undefined;

  // react-arborist will inject width, height, top, left, zIndex into style
  // It may also inject paddingLeft or marginLeft if configured, but we want 
  // our own clean full-width item. We handle indentation inside SidebarItem or via padding.
  const basePaddingLeft = 8; // default px-2 is 0.5rem = 8px
  const indent = node.level * 16;

  const mergedStyle: React.CSSProperties = {
    ...style,
    paddingLeft: `${basePaddingLeft + indent}px`,
    width: '100%',
  };

  return (
    <SidebarItem
      innerRef={dragHandle}
      style={mergedStyle}
      icon={getIcon()}
      label={data.title}
      active={isActive}
      depth={1}
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      actionItems={actionItems}
      rightIndicator={rightIndicator}
      onClick={handleClick}
      onChevronClick={handleChevronClick}
    />
  );
});
