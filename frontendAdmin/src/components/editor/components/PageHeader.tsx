import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { AutoResizeTextarea } from './AutoResizeTextarea';

interface PageHeaderProps {
  initialTitle: string;
  onTitleChange: (newTitle: string) => void;
  onEnter: () => void;
  isPageLoaded: boolean;
}

/**
 * 页面头部组件（标题编辑）
 * 性能优化：通过 memo 和内部 state 隔离标题输入导致的重绘，避免 Tiptap 主体频繁更新
 */
export const PageHeader = memo(function PageHeader({
  initialTitle,
  onTitleChange,
  onEnter,
  isPageLoaded,
}: PageHeaderProps) {
  const [localTitle, setLocalTitle] = useState(initialTitle);
  const [isEditing, setIsEditing] = useState(false);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [prevInitialTitle, setPrevInitialTitle] = useState(initialTitle);

  if (initialTitle !== prevInitialTitle) {
    setPrevInitialTitle(initialTitle);
    if (!isEditing) {
      setLocalTitle(initialTitle);
    }
  }

  // 处理输入
  const handleChange = useCallback((val: string) => {
    setIsEditing(true);
    setLocalTitle(val);
    onTitleChange(val);
  }, [onTitleChange]);

  // 处理失焦
  const handleBlur = useCallback(() => {
    // 延迟重置编辑标志，给同步留出时间
    setTimeout(() => {
      setIsEditing(false);
    }, 1200);
  }, []);

  // 初始加载自动聚焦
  useEffect(() => {
    if (isPageLoaded && initialTitle === '未命名') {
      const timer = setTimeout(() => {
        titleTextareaRef.current?.focus();
        titleTextareaRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPageLoaded, initialTitle]);

  return (
    <div className="page-metadata">
      <AutoResizeTextarea
        textareaRef={titleTextareaRef}
        value={localTitle}
        onChange={handleChange}
        onEnter={onEnter}
        onBlur={handleBlur}
        placeholder="未命名"
        className="w-full text-4xl font-bold bg-transparent border-none outline-none resize-none
                   text-app-fg-deep placeholder:text-app-fg-light/40
                   focus:outline-none focus:ring-0 leading-[1.2] overflow-y-hidden
                   py-0 px-0 min-h-[3rem]"
      />
    </div>
  );
});
