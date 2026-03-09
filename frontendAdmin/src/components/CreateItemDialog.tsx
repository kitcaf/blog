/**
 * @file CreateItemDialog.tsx
 * @description 创建文件夹/页面的对话框组件
 */

import { useState, useEffect, useRef } from 'react';
import { X, Folder, FileText } from 'lucide-react';

interface CreateItemDialogProps {
  isOpen: boolean;
  type: 'folder' | 'page';
  onClose: () => void;
  onConfirm: (title: string) => void;
  parentTitle?: string;
}

export function CreateItemDialog({
  isOpen,
  type,
  onClose,
  onConfirm,
  parentTitle,
}: CreateItemDialogProps) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 重置表单并聚焦输入框
  useEffect(() => {
    if (isOpen) {
      // 延迟聚焦，确保对话框动画完成
      const timer = setTimeout(() => {
        setTitle('');
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle) {
      onConfirm(trimmedTitle);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const typeText = type === 'folder' ? '文件夹' : '页面';
  const Icon = type === 'folder' ? Folder : FileText;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-card border border-border rounded-lg shadow-lg p-6">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icon size={20} className="text-app-fg" />
              <h2 className="text-lg font-semibold text-app-fg-deeper">
                新建{typeText}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-app-hover rounded-md transition-colors"
              aria-label="关闭"
            >
              <X size={18} className="text-app-fg-light" />
            </button>
          </div>

          {/* 父级提示 */}
          {parentTitle && (
            <div className="mb-4 px-3 py-2 bg-app-hover rounded-md">
              <p className="text-xs text-app-fg-light">
                将创建在：<span className="text-app-fg font-medium">{parentTitle}</span>
              </p>
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label
                htmlFor="item-title"
                className="block text-sm font-medium text-app-fg-deep mb-2"
              >
                {typeText}名称
              </label>
              <input
                ref={inputRef}
                id="item-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`输入${typeText}名称`}
                className="w-full px-3 py-2 bg-app-bg border border-border rounded-md
                         text-app-fg-deeper placeholder:text-app-fg-light
                         focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring
                         transition-colors"
                maxLength={100}
              />
              <p className="mt-1 text-xs text-app-fg-light">
                {title.length}/100 字符
              </p>
            </div>

            {/* 按钮组 */}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-app-fg
                         hover:bg-app-hover rounded-md transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground
                         rounded-md hover:bg-primary/90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
