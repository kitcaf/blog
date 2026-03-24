import { useState, useEffect } from 'react';
import { Trash2, RotateCcw, X, Folder, FileText, AlertCircle } from 'lucide-react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import {
  fetchTrashItems,
  restoreTrashItem,
  deleteTrashItem,
  batchDeleteTrashItems,
  type TrashItem,
} from '@/api/trash';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface TrashDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TrashDialog({ isOpen, onClose }: TrashDialogProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 获取回收站列表
  const { data: trashItems = [], isLoading, refetch } = useQuery({
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
    if (!isOpen) {
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  const handleSelectAll = () => {
    if (selectedIds.size === trashItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trashItems.map((item) => item.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要永久删除选中的 ${selectedIds.size} 个项目吗？此操作不可恢复！`)) {
      return;
    }
    batchDeleteMutation.mutate(Array.from(selectedIds));
  };

  const handleRestore = (id: string) => {
    restoreMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (!confirm('确定要永久删除此项目吗？此操作不可恢复！')) {
      return;
    }
    deleteMutation.mutate(id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-4xl max-h-[80vh] bg-app-bg rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Trash2 className="w-5 h-5 text-app-fg" />
            <h2 className="text-lg font-semibold text-app-fg-deeper">回收站</h2>
            <span className="text-sm text-app-fg-light">
              {trashItems.length} 个项目
            </span>
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
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-app-fg-lightest">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === trashItems.length && trashItems.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-border"
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
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-app-fg-light">加载中...</div>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Trash2 className="w-16 h-16 text-app-fg-lighter mb-4" />
              <p className="text-app-fg-light">回收站是空的</p>
            </div>
          ) : (
            <div className="space-y-2">
              {trashItems.map((item) => (
                <TrashItemRow
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
      </div>
    </div>
  );
}

interface TrashItemRowProps {
  item: TrashItem;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRestore: () => void;
  onDelete: () => void;
  isRestoring: boolean;
  isDeleting: boolean;
}

function TrashItemRow({
  item,
  isSelected,
  onToggleSelect,
  onRestore,
  onDelete,
  isRestoring,
  isDeleting,
}: TrashItemRowProps) {
  const Icon = item.type === 'folder' ? Folder : FileText;
  const childrenText = [];
  if (item.child_folder_count > 0) {
    childrenText.push(`${item.child_folder_count} 个文件夹`);
  }
  if (item.child_page_count > 0) {
    childrenText.push(`${item.child_page_count} 篇文章`);
  }

  return (
    <div
      className={`
        flex items-center gap-4 p-4 rounded-lg border transition-all
        ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-app-hover'}
      `}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="w-4 h-4 rounded border-border flex-shrink-0"
      />

      {/* Icon & Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="text-2xl flex-shrink-0">{item.icon}</div>
        <Icon className="w-4 h-4 text-app-fg-light flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-app-fg-deeper truncate">{item.title}</div>
          <div className="flex items-center gap-2 text-xs text-app-fg-light mt-1">
            <span>
              删除于 {formatDistanceToNow(new Date(item.deleted_at), { addSuffix: true, locale: zhCN })}
            </span>
            {childrenText.length > 0 && (
              <>
                <span>•</span>
                <span>包含 {childrenText.join('、')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onRestore}
          disabled={isRestoring || isDeleting}
          className="p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/20 text-green-600 dark:text-green-400 disabled:opacity-50 transition-colors"
          title="恢复"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={isRestoring || isDeleting}
          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
          title="永久删除"
        >
          <AlertCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
