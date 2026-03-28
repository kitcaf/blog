/**
 * @file PublishDialog.tsx
 * @description 文章发布对话框
 * 
 * 功能：
 * - 单篇文章发布/取消发布
 * - 配置发布元数据（描述、标签、分类、slug）
 * - 显示发布状态和预览链接
 * 
 * 性能优化：
 * - 使用受控组件，避免 useEffect 同步状态
 * - 表单状态在对话框关闭时重置
 */

import { useState, useCallback, useMemo } from 'react';
import { X, Send, Globe, Tag, FolderOpen, Link2, Loader2 } from 'lucide-react';
import { usePublishPage, useUnpublishPage, useUpdatePageMeta } from '@/hooks/usePublishMutations';
import { useBlogCategories } from '@/hooks/useBlogCategories';

interface PublishDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pageId: string;
  pageTitle: string;
  isPublished: boolean;
  currentMeta?: {
    description?: string;
    tags?: string[];
    categoryId?: string;
    slug?: string;
    publishedAt?: string;
  };
}

export function PublishDialog({
  isOpen,
  onClose,
  pageId,
  pageTitle,
  isPublished,
  currentMeta,
}: PublishDialogProps) {
  // 使用 useMemo 计算初始值，避免每次渲染都创建新对象
  const initialDescription = useMemo(() => currentMeta?.description || '', [currentMeta?.description]);
  const initialTags = useMemo(() => currentMeta?.tags || [], [currentMeta?.tags]);
  const initialCategoryId = useMemo(() => currentMeta?.categoryId || '', [currentMeta?.categoryId]);
  const initialSlug = useMemo(() => currentMeta?.slug || '', [currentMeta?.slug]);

  const [description, setDescription] = useState(initialDescription);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [slug, setSlug] = useState(initialSlug);

  const publishMutation = usePublishPage();
  const unpublishMutation = useUnpublishPage();
  const updateMetaMutation = useUpdatePageMeta();
  const { data: categories = [] } = useBlogCategories();

  // 重置表单并关闭
  const handleClose = useCallback(() => {
    setDescription(initialDescription);
    setTags(initialTags);
    setCategoryId(initialCategoryId);
    setSlug(initialSlug);
    setTagInput('');
    onClose();
  }, [initialDescription, initialTags, initialCategoryId, initialSlug, onClose]);

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

  // 发布文章
  const handlePublish = useCallback(() => {
    publishMutation.mutate({
      pageId,
      options: {
        category_id: categoryId ? { set: true, value: categoryId } : undefined,
        tags: tags.length > 0 ? { set: true, value: tags } : undefined,
        slug: slug ? { set: true, value: slug } : undefined,
      },
    }, {
      onSuccess: () => {
        handleClose();
      },
    });
  }, [pageId, categoryId, tags, slug, publishMutation, handleClose]);

  // 取消发布
  const handleUnpublish = useCallback(() => {
    if (!confirm('确定要取消发布吗？文章将从博客中移除。')) {
      return;
    }
    unpublishMutation.mutate(pageId, {
      onSuccess: () => {
        handleClose();
      },
    });
  }, [pageId, unpublishMutation, handleClose]);

  // 更新元数据（不改变发布状态）
  const handleUpdateMeta = useCallback(() => {
    updateMetaMutation.mutate({
      pageId,
      meta: {
        description: { set: true, value: description || null },
        tags: { set: true, value: tags.length > 0 ? tags : null },
        category_id: { set: true, value: categoryId || null },
        slug: slug ? { set: true, value: slug } : undefined,
      },
    }, {
      onSuccess: () => {
        handleClose();
      },
    });
  }, [pageId, description, tags, categoryId, slug, updateMetaMutation, handleClose]);

  if (!isOpen) return null;

  const isLoading = publishMutation.isPending || unpublishMutation.isPending || updateMetaMutation.isPending;

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
              <h2 className="text-lg font-semibold text-app-fg-deeper">
                {isPublished ? '更新发布' : '发布文章'}
              </h2>
              <p className="text-sm text-app-fg-light mt-0.5">{pageTitle}</p>
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
          {/* 发布状态 */}
          {isPublished && currentMeta?.publishedAt && (
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <Globe className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                已发布于 {new Date(currentMeta.publishedAt).toLocaleString('zh-CN')}
              </span>
            </div>
          )}

          {/* 描述 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-app-fg-deeper">
              <Tag className="w-4 h-4" />
              文章描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简短描述文章内容（用于SEO和预览）"
              className="w-full px-3 py-2 bg-app-bg border border-border rounded-lg text-sm text-app-fg placeholder:text-app-fg-light focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              rows={3}
            />
          </div>

          {/* 标签 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-app-fg-deeper">
              <Tag className="w-4 h-4" />
              标签
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
          </div>

          {/* 分类 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-app-fg-deeper">
              <FolderOpen className="w-4 h-4" />
              分类
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
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-app-fg-deeper">
              <Link2 className="w-4 h-4" />
              URL Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="留空自动生成（标题-随机哈希）"
              className="w-full px-3 py-2 bg-app-bg border border-border rounded-lg text-sm text-app-fg placeholder:text-app-fg-light focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <p className="text-xs text-app-fg-light">
              文章访问地址：/blog/{slug || '标题-随机哈希'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            {isPublished && (
              <button
                onClick={handleUnpublish}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                取消发布
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-app-fg hover:bg-app-hover rounded-lg transition-colors disabled:opacity-50"
            >
              取消
            </button>
            {isPublished ? (
              <button
                onClick={handleUpdateMeta}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                更新元数据
              </button>
            ) : (
              <button
                onClick={handlePublish}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                立即发布
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

