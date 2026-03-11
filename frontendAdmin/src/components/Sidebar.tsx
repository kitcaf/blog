/**
 * @file Sidebar.tsx
 * @description 侧边栏主组件，组合各个子组件
 *
 * 数据流：
 *   usePageTreeQuery → GET /api/pages/tree → buildPageTree()
 *   → PageTreeNode[] → Zustand hydrate → 渲染目录树
 *
 * 组件结构：
 *   Sidebar (容器)
 *   ├── SidebarHeader (顶部)
 *   ├── SidebarNav (主导航)
 *   ├── PageTreeSection (目录树)
 *   ├── SidebarBottomNav (底部导航)
 *   └── SidebarFooter (用户信息)
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBlockStore } from '@/store/useBlockStore';
import { useSidebarStore } from '@/store/useSidebarStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePageTreeQuery } from '@/hooks/useBlocksQuery';
import { createFolder, createPage } from '@/api/blocks';
import { toast } from 'sonner';
import { CreateItemDialog } from './CreateItemDialog';
import {
  SidebarHeader,
  SidebarNav,
  SidebarBottomNav,
  PageTreeSection,
  SidebarFooter,
} from './sidebar/index';

export function Sidebar() {
  const navigate = useNavigate();
  const { tree, flatPages, isLoading, isError, error, refetch } = usePageTreeQuery();

  // Store
  const hydrate = useBlockStore((s) => s.hydrate);
  const setActivePage = useBlockStore((s) => s.setActivePage);
  const activePageId = useBlockStore((s) => s.activePageId);
  const { isOpen, width, setIsOpen, isResizing } = useSidebarStore();
  const { user, refreshToken, clearAuth } = useAuthStore();

  // 创建对话框状态
  const [createDialog, setCreateDialog] = useState<{
    isOpen: boolean;
    type: 'folder' | 'page';
    parentId?: string | null;
    parentTitle?: string;
  }>({
    isOpen: false,
    type: 'folder',
  });

  const [isCreating, setIsCreating] = useState(false);

  // 退出登录
  const handleLogout = useCallback(async () => {
    try {
      if (refreshToken) {
        const { logout } = await import('@/api/auth');
        await logout(refreshToken);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
      navigate('/login', { replace: true });
    }
  }, [clearAuth, navigate, refreshToken]);

  // 打开创建对话框
  const handleOpenCreateDialog = useCallback((type: 'folder' | 'page', parentId?: string | null) => {
    let parentTitle = '根目录';
    if (parentId) {
      const parentBlock = useBlockStore.getState().blocksById[parentId];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parentTitle = parentBlock ? ((parentBlock.props as any)?.title || '未命名文件夹') : '未命名文件夹';
    }
    
    console.log('[CreateDialog] Opening dialog:', { type, parentId, parentTitle });
    
    setCreateDialog({
      isOpen: true,
      type,
      parentId: parentId ?? null,
      parentTitle,
    });
  }, []);

  // 创建文件夹或页面
  const handleCreate = useCallback(async (title: string) => {
    if (isCreating) return;

    console.log('[Create] Starting creation:', { 
      type: createDialog.type, 
      title, 
      parentId: createDialog.parentId 
    });

    setIsCreating(true);
    try {
      if (createDialog.type === 'folder') {
        const result = await createFolder({
          title,
          parentId: createDialog.parentId,
        });
        console.log('[Create] Folder created:', result);
        toast.success(`文件夹 "${title}" 创建成功`);
      } else {
        const newPage = await createPage({
          title,
          parentId: createDialog.parentId,
        });
        console.log('[Create] Page created:', newPage);
        setActivePage(newPage.id);
        toast.success(`页面 "${title}" 创建成功`);
      }
      refetch();
    } catch (error: any) {
      console.error('创建失败:', error);
      toast.error(error.message || '创建失败');
    } finally {
      setIsCreating(false);
    }
  }, [createDialog, isCreating, refetch, setActivePage]);

  // 水合数据到 Store
  useEffect(() => {
    if (flatPages.length === 0) return;
    hydrate(flatPages);

    // 逻辑优化：寻找第一个页面作为活动页面，不强制要求 parentId === null
    if (!activePageId) {
      const firstPage = flatPages.find((b) => b.type === 'page');
      if (firstPage) {
        console.log('[Sidebar] Setting initial active page:', (firstPage.props as any).title, firstPage.id);
        setActivePage(firstPage.id);
      }
    }
  }, [flatPages, hydrate, activePageId, setActivePage]);

  return (
    <aside
      className={`h-full bg-app-bg border-r border-border flex flex-col shrink-0 overflow-hidden ${
        isResizing ? '' : 'transition-all duration-300'
      }`}
      style={{
        width: isOpen ? width : 0,
        opacity: isOpen ? 1 : 0,
        borderRightWidth: isOpen ? 1 : 0,
      }}
    >
      <div
        className="flex flex-col h-full overflow-y-auto overflow-x-hidden p-2 transition-opacity"
        style={{ width: `${width}px` }}
      >
        <SidebarHeader onHide={() => setIsOpen(false)} />
        
        <SidebarNav />

        <PageTreeSection
          tree={tree}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onCreateFolder={(parentId) => handleOpenCreateDialog('folder', parentId)}
          onCreatePage={(parentId) => handleOpenCreateDialog('page', parentId)}
          onRetry={() => window.location.reload()}
          onMoveComplete={refetch}
        />

        <SidebarBottomNav />
      </div>

      <SidebarFooter
        username={user?.username}
        email={user?.email}
        onLogout={handleLogout}
      />

      <CreateItemDialog
        isOpen={createDialog.isOpen}
        type={createDialog.type}
        parentTitle={createDialog.parentTitle}
        onClose={() => setCreateDialog({ ...createDialog, isOpen: false })}
        onConfirm={handleCreate}
      />
    </aside>
  );
}