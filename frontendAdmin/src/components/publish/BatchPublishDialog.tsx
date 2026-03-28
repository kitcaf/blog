/**
 * @file BatchPublishDialog.tsx
 * @description 批量发布文件夹对话框
 * 
 * 功能：
 * - 批量发布文件夹下所有文章
 * - 统一配置标签和分类
 * - 显示发布进度和结果
 */

import { useState, useCallback, useMemo } from 'react';
import { X, FolderOpen, Tag, Loader2, CheckCircle2, Send } from 'lucide-react';
import { usePublishSubtree } from '@/hooks/usePublishMutations';
import { useBlogCategories } from '@/hooks/useBlogCategories';

interface BatchPublishDialogProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  folderTitle: string;
}

export function BatchPublishDialog({
  isOpen,
  onClose,
  folderId,
  folderTitle,
}: BatchPublishDialogProps) {
  const initialTags = useMemo(() => [] as string[], []);
  const initialCategoryId = useMemo(() => '', []);

  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId);

  const publishMutation = usePublishSubtree();
  const { data: categories = [] } = useBlogCategories();

  // 重置表单并关闭
  const handleClose = useCallback(() => {
    setTags(initialTags);
    setCategoryId(initialCategoryId);
    setTagInput('');
    onClose();
  }, [initialTags, initialCategoryId, onClose]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  }, [handleClose]);

  // 添加标签
  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  // 删除标签
  const handleRemoveTag = useCallback((tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  }, [tags]);

  // 标签输入键盘事件
  const handleTagInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }, [tagInput, tags, handleAddTag]);

  // 批量发布
  const handleBatchPublish = useCallback(() => {
    if (!confirm(`确定要批量发布文件夹"${folderTitle}"下的所有文章吗？`)) {
      return;
    }

    publishMutation.mutate({
      folderId,
      options: {
        category_id: categoryId ? { set: true, value: categoryId } : undefined,
        tags: tags.length > 0 ? { set: true, value: tags } : undefined,
      },
    }, {
      onSuccess: () => {
        handleClose();
      },
    });
  }, [folderId, folderTitle, categoryId, tags, publishMutation, handleClose]);

  if (!isOpen) return null;

  const isLoading = publishMutation.isPending;
  const isSuccess = publishMutation.isSuccess;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-[90vw] max-w-2xl max-h-[85vh] bg-app-bg rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Send className="w-5 h-5 text-app-fg" />
            <div>
              <h2 className="text-lg font-semibold text-app-fg-deeper">批量发布</h2>
              <p className="text-sm text-app-fg-light mt-0.5">
                文件夹：{folderTitle}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-app-hover transition-colors"
          >
            <X className="w-5 h-5 text-app-fg" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* 成功提示 */}
          {isSuccess && publishMutation.data && (
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                成功发布 {publishMutation.data.published_count} 篇文章
              </span>
            </div>
          )}

          {/* 说明 */}
          <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              将批量发布此文件夹下的所有文章（包括子文件夹）。已发布的文章将保持原有设置，未发布的文章将使用下方配置。
            </p>
          </div>

          {/* 标签 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-app-fg-deeper">
              <Tag className="w-4 h-4" />
              统一标签（可选）
            </label>
            <div className="flex flex-wrap gap-2 p-2 bg-app-bg border border-border rounded-lg min-h-[42px]">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-sm"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-blue-900 dark:hover:text-blue-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                onBlur={handleAddTag}
                placeholder={tags.length === 0 ? '输入标签，按回车添加' : ''}
                className="flex-1 min-w-[120px] px-2 py-1 bg-transparent text-sm text-app-fg placeholder:text-app-fg-light focus:outline-none"
              />
            </div>
            <p className="text-xs text-app-fg-light">
              为所有未发布的文章添加这些标签
            </p>
          </div>

          {/* 分类 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-app-fg-deeper">
              <FolderOpen className="w-4 h-4" />
              统一分类（可选）
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 bg-app-bg border border-border rounded-lg text-sm text-app-fg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">无分类</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-app-fg-light">
              为所有未发布的文章设置此分类
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-app-fg hover:bg-app-hover rounded-lg transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleBatchPublish}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            批量发布
          </button>
        </div>
      </div>
    </div>
  );
}

