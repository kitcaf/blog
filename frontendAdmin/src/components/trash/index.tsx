/**
 * @file index.tsx
 * @description 回收站对话框入口
 * 
 * 特性：
 * - 批量操作：支持全选、批量删除
 * - 键盘导航：支持 Esc 关闭
 * - 骨架加载：优雅的加载状态
 */

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import {
  fetchTrashItems,
  restoreTrashItem,
  deleteTrashItem,
  batchDeleteTrashItems,
} from '@/api/trash';
import TrashSkeleton from './Skeleton';
import TrashItem from './TrashItem.tsx';
import { Trash2, X } from 'lucide-react';

interface TrashDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TrashDialog({ isOpen, onClose }: TrashDialogProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 获取回收站列表
  const { data: trashItems = [], isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: fetchTrashItems,
    enabled: isOpen,
  });

  // 恢复项目
  const restoreMutation = useMutation({
    mutationFn: restoreTrashItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['pageTree'] });
    },
  });

  // 永久删除单个项目
  const deleteMutation = useMutation({
    mutationFn: deleteTrashItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
  });

  // 批量永久删除
  const batchDeleteMutation = useMutation({
    mutationFn: batchDeleteTrashItems,
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
  });

  // 关闭时清空选中
  useEffect(() => {
    if (!isOpen && selectedIds.size > 0) {
      queueMicrotask(() => setSelectedIds(new Set()));
    }
  }, [isOpen, selectedIds.size]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === trashItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trashItems.map((item) => item.id)));
    }
  }, [selectedIds.size, trashItems]);

  // 切换单个选中
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // 批量删除
  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要永久删除选中的 ${selectedIds.size} 个项目吗？此操作不可恢复！`)) {
      return;
    }
    batchDeleteMutation.mutate(Array.from(selectedIds));
  }, [selectedIds, batchDeleteMutation]);

  // 恢复单个
  const handleRestore = useCallback((id: string) => {
    restoreMutation.mutate(id);
  }, [restoreMutation]);

  // 删除单个
  const handleDelete = useCallback((id: string) => {
    if (!confirm('确定要永久删除此项目吗？此操作不可恢复！')) {
      return;
    }
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-[90vw] max-w-4xl h-[80vh] bg-app-bg rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Trash2 className="w-5 h-5 text-app-fg" />
            <h2 className="text-lg font-semibold text-app-fg-deeper">回收站</h2>
            {trashItems.length > 0 && (
              <span className="text-sm text-app-fg-light">
                {trashItems.length} 个项目
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-app-hover transition-colors"
          >
            <X className="w-5 h-5 text-app-fg" />
          </button>
        </div>

        {/* Toolbar */}
        {trashItems.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-app-fg-lightest shrink-0">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === trashItems.length && trashItems.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-border cursor-pointer"
                />
                <span className="text-sm text-app-fg">全选</span>
              </label>
              {selectedIds.size > 0 && (
                <span className="text-sm text-app-fg-light">
                  已选中 {selectedIds.size} 项
                </span>
              )}
            </div>
            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {batchDeleteMutation.isPending ? '删除中...' : '永久删除选中项'}
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          {isLoading ? (
            <TrashSkeleton />
          ) : trashItems.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {trashItems.map((item) => (
                <TrashItem
                  key={item.id}
                  item={item}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={() => handleToggleSelect(item.id)}
                  onRestore={() => handleRestore(item.id)}
                  onDelete={() => handleDelete(item.id)}
                  isRestoring={restoreMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-5 py-3 border-t border-border/50 bg-app-bg/50 shrink-0">
          <div className="text-xs text-app-fg-light flex items-center justify-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-app-hover text-app-fg-deeper font-mono text-xs">Esc</kbd> 关闭
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 空状态组件
function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-app-fg-light">
        <Trash2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
        <p className="text-sm">回收站是空的</p>
      </div>
    </div>
  );
}
