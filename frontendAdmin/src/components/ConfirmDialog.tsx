/**
 * @file ConfirmDialog.tsx
 * @description 通用的确认对话框组件，外观与 CreateItemDialog 保持一致
 */

import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  isDestructive = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // 打开时自动聚焦到确认按钮
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
        <div 
          className="bg-card border border-border rounded-lg shadow-lg p-6"
          onKeyDown={handleKeyDown}
        >
          {/* 标题栏 */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-full ${isDestructive ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
                <AlertTriangle size={18} />
              </div>
              <h2 className="text-lg font-semibold text-app-fg-deeper">
                {title}
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

          {/* 详细文字内容 */}
          <div className="mb-6 mt-3 pl-2">
            <p className="text-sm text-app-fg-light leading-relaxed">
              {description}
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
              {cancelText}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                isDestructive 
                  ? 'bg-red-500 text-white hover:bg-red-600' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
