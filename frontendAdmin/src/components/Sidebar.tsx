/**
 * @file Sidebar.tsx
 * @description 侧边栏主组件，组合各个子组件
 *
 * 数据流：
 *   usePageTreeQuery → GET /api/admin/blocks/tree → buildPageTree()
 *   → PageTreeNode[] → 直接渲染（不经过 Store）
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
import { useSidebarStore } from '@/store/useSidebarStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePageTreeQuery } from '@/hooks/useBlocksQuery';
import { createFolder, createPage, deletePage } from '@/api/blocks';
import { toast } from 'sonner';
import { CreateItemDialog } from './CreateItemDialog';
import { ConfirmDialog } from './ConfirmDialog';
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

  // 删除对话框状态
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    title: string;
  }>({
    isOpen: false,
    id: '',
    title: '',
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

  // 打开创建对话框（仅用于文件夹）
  const handleOpenCreateDialog = useCallback((type: 'folder' | 'page', parentId?: string | null) => {
    let parentTitle = '根目录';
    if (parentId) {
      // 从侧边栏树数据中查找父节点标题
      const findNodeTitle = (nodes: typeof tree, id: string): string | null => {
        for (const node of nodes) {
          if (node.id === id) return node.title;
          if (node.children) {
            const found = findNodeTitle(node.children, id);
            if (found) return found;
          }
        }
        return null;
      };
      
      parentTitle = findNodeTitle(tree, parentId) || '未命名文件夹';
    }
    
    console.log('[CreateDialog] Opening dialog:', { type, parentId, parentTitle });
    
    setCreateDialog({
      isOpen: true,
      type,
      parentId: parentId ?? null,
      parentTitle,
    });
  }, [tree]);

  // 直接创建页面（无对话框）
  const handleCreatePageDirect = useCallback(async (parentId?: string | null) => {
    if (isCreating) return;

    console.log('[CreatePage] Creating page directly:', { parentId });

    setIsCreating(true);
    try {
      const newPage = await createPage({
        title: '未命名',
        parentId: parentId ?? null,
      });
      console.log('[CreatePage] Page created:', newPage);
      
      // 刷新侧边栏
      await refetch();
      
      // 导航到新页面（会自动聚焦标题）
      navigate(`/page/${newPage.id}`);
      
      toast.success('页面创建成功');
    } catch (error: unknown) {
      const err = error as Error;
      console.error('创建页面失败:', err);
      toast.error(err.message || '创建页面失败');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, refetch, navigate]);

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
        // 使用路由导航到新页面
        navigate(`/page/${newPage.id}`);
        toast.success(`页面 "${title}" 创建成功`);
      }
      refetch();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('创建失败:', err);
      toast.error(err.message || '创建失败');
    } finally {
      setIsCreating(false);
    }
  }, [createDialog, isCreating, refetch, navigate]);

  // 取代原先直接弹出的确认框，改为打开自制弹窗
  const handleOpenDeleteDialog = useCallback((id: string, title: string) => {
    setDeleteDialog({ isOpen: true, id, title });
  }, []);

  // 执行真正的删除请求
  const handleConfirmDelete = useCallback(async () => {
    const { id, title } = deleteDialog;
    if (!id) return;

    try {
      await deletePage(id);
      toast.success(`"${title}" 删除成功`);
      // 如果删除的是当前页面，导航到首页
      if (window.location.pathname.includes(id)) {
        navigate('/');
      }
      refetch();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || '删除失败');
    }
  }, [deleteDialog, navigate, refetch]);

  // 侧边栏数据完全由 React Query 管理，不需要额外处理
  useEffect(() => {
    // flatPages 仅用于调试或其他用途，侧边栏直接使用 tree 渲染
    if (flatPages.length > 0) {
      console.log('[Sidebar] Loaded pages count:', flatPages.length);
    }
  }, [flatPages]);

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
      {/* 固定顶部 */}
      <div className="shrink-0 p-2" style={{ width: `${width}px` }}>
        <SidebarHeader onHide={() => setIsOpen(false)} />
        <SidebarNav />
      </div>

      {/* 可滚动中间 */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2" style={{ width: `${width}px` }}>
        <PageTreeSection
          tree={tree}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onCreateFolder={(parentId) => handleOpenCreateDialog('folder', parentId)}
          onCreatePage={handleCreatePageDirect}
          onDeleteNode={handleOpenDeleteDialog}
          onRetry={() => window.location.reload()}
          onMoveComplete={refetch}
        />
      </div>

      {/* 固定底部 */}
      <div className="shrink-0" style={{ width: `${width}px` }}>
        <div className="p-2">
          <SidebarBottomNav />
        </div>
        <SidebarFooter
          username={user?.username}
          email={user?.email}
          onLogout={handleLogout}
        />
      </div>

      <CreateItemDialog
        isOpen={createDialog.isOpen}
        type={createDialog.type}
        parentTitle={createDialog.parentTitle}
        onClose={() => setCreateDialog({ ...createDialog, isOpen: false })}
        onConfirm={handleCreate}
      />

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="确认删除"
        description={`确定要删除 "${deleteDialog.title}" 吗？此操作将彻底删除该项目及内部所有结构且无法恢复。`}
        confirmText="删除"
        isDestructive={true}
        onClose={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
        onConfirm={handleConfirmDelete}
      />
    </aside>
  );
}