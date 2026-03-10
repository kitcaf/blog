/**
 * @file SidebarItem.tsx
 * @description 统一的侧边栏项组件，支持导航和目录树
 * 
 * 设计原则：
 * - 统一样式：gap-2 px-2 py-1.5 text-sm font-medium
 * - 支持层级缩进：depth * 16px
 * - 支持展开/折叠箭头
 * - 支持悬停按钮
 * - 文字自动截断（...）
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';

interface SidebarItemProps {
  /** 图标（React 节点或 emoji） */
  icon: React.ReactNode;
  /** 标题文字 */
  label: string;
  /** 是否激活 */
  active?: boolean;
  /** 层级深度（0 = 一级，1 = 二级...） */
  depth?: number;
  /** 是否有子节点 */
  hasChildren?: boolean;
  /** 是否展开 */
  isExpanded?: boolean;
  /** 悬停时显示的操作按钮 */
  hoverActions?: React.ReactNode;
  /** 右侧状态指示器（如发布状态点） */
  rightIndicator?: React.ReactNode;
  /** 点击事件 */
  onClick?: () => void;
  /** 箭头点击事件 */
  onChevronClick?: (e: React.MouseEvent) => void;
  /** 鼠标进入事件 */
  onMouseEnter?: () => void;
  /** 鼠标离开事件 */
  onMouseLeave?: () => void;
}

export const SidebarItem = React.memo(function SidebarItem({
  icon,
  label,
  active = false,
  depth = 0,
  hasChildren = false,
  isExpanded = false,
  hoverActions,
  rightIndicator,
  onClick,
  onChevronClick,
  onMouseEnter,
  onMouseLeave,
}: SidebarItemProps) {
  // 一级项使用更大的字体和间距
  const isTopLevel = depth === 0;
  const textSize = isTopLevel ? 'text-[15px]' : 'text-sm';
  const iconSize = isTopLevel ? 'w-[18px] h-[18px]' : 'w-[16px] h-[16px]';
  const verticalPadding = isTopLevel ? 'py-2' : 'py-1.5';
  
  // 一级项图标对齐"空间"标题（px-2 = 8px）
  // 箭头宽度 16px + gap 8px = 24px，所以一级项 paddingLeft 需要减去 24px
  // 即：8px - 24px = -16px，但我们用 pl-2 (8px) 然后箭头用负 margin 来实现
  const paddingLeft = isTopLevel ? 8 : 8 + depth * 8;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`
        group flex items-center gap-2 px-2 ${verticalPadding} rounded-md cursor-pointer
        ${textSize} font-medium transition-colors select-none
        ${active
          ? 'bg-app-hover text-app-fg-deeper'
          : 'text-app-fg hover:bg-app-hover hover:text-app-fg-deeper'
        }
      `}
      style={{ paddingLeft: `${paddingLeft}px` }}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {/* 展开/折叠箭头 */}
      {/* 一级项：箭头使用负 margin 让图标左对齐 */}
      <span
        className={`
          shrink-0 w-4 h-4 flex items-center justify-center
          transition-transform duration-150
          ${hasChildren ? 'text-app-fg-light hover:text-app-fg-deep' : 'opacity-0 pointer-events-none'}
          ${isExpanded ? 'rotate-90' : ''}
          ${isTopLevel ? '-ml-6' : ''}
        `}
        onClick={hasChildren ? onChevronClick : undefined}
        aria-hidden="true"
      >
        <ChevronRight size={12} />
      </span>

      {/* 图标：一级项 18px，其他 16px */}
      <span className={`shrink-0 ${iconSize} flex items-center justify-center text-[14px] leading-none`}>
        {icon}
      </span>

      {/* 标题：自动截断 */}
      <span className="flex-1 truncate min-w-0">{label}</span>

      {/* 悬停操作按钮 */}
      {hoverActions && (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {hoverActions}
        </div>
      )}

      {/* 右侧状态指示器 */}
      {rightIndicator && !hoverActions && (
        <div className="shrink-0">
          {rightIndicator}
        </div>
      )}
    </div>
  );
});
