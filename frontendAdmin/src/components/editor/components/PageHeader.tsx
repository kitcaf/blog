import { useEffect, useRef, memo } from 'react';
import { AutoResizeTextarea } from './AutoResizeTextarea';

interface PageHeaderProps {
  value: string;
  onChange: (newTitle: string) => void;
  onEnter: () => void;
  onBlur?: () => void;
  isPageLoaded: boolean;
}

/**
 * 页面头部纯展示组件。
 * 只负责渲染标题输入框，不关心数据来源和同步时机。
 */
export const PageHeader = memo(function PageHeader({
  value,
  onChange,
  onEnter,
  onBlur,
  isPageLoaded,
}: PageHeaderProps) {
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 初始加载自动聚焦
  useEffect(() => {
    if (isPageLoaded && value === '未命名') {
      const timer = setTimeout(() => {
        titleTextareaRef.current?.focus();
        titleTextareaRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPageLoaded, value]);

  return (
    <div className="page-metadata">
      <AutoResizeTextarea
        textareaRef={titleTextareaRef}
        value={value}
        onChange={onChange}
        onEnter={onEnter}
        onBlur={onBlur}
        placeholder="未命名"
        className="w-full text-4xl font-bold bg-transparent border-none outline-none resize-none
                   text-app-fg-deep placeholder:text-app-fg-light/40
                   focus:outline-none focus:ring-0 leading-[1.2] overflow-y-hidden
                   py-0 px-0 min-h-[3rem]"
      />
    </div>
  );
});
