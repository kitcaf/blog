import { useCallback, useEffect } from 'react';

interface AutoResizeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * 自适应高度的 Textarea 组件
 */
export function AutoResizeTextarea({
  value,
  onChange,
  onEnter,
  onBlur,
  placeholder,
  className,
  textareaRef,
}: AutoResizeTextareaProps) {
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const target = e.currentTarget;
      onChange(target.value);

      // 延迟调整高度，确保内容已更新
      requestAnimationFrame(() => {
        target.style.height = 'auto';
        target.style.height = `${target.scrollHeight}px`;
      });
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onEnter();
      }
    },
    [onEnter]
  );

  // 初始化高度
  useEffect(() => {
    if (textareaRef?.current) {
      const target = textareaRef.current;
      target.style.height = 'auto';
      target.style.height = `${target.scrollHeight}px`;
    }
  }, [value, textareaRef]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      spellCheck={false}
      rows={1}
    />
  );
}
