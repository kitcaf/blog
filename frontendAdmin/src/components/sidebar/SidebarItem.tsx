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
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';

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
  /** 悬停时显示的操作菜单项，不再传递 ReactNode，而是传递标准化对象数组 */
  actionItems?: ActionMenuItem[];
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
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 自定义 ref */
  innerRef?: React.Ref<HTMLDivElement>;
  /** 是否隐藏左侧的固定展开箭头，以便在 icon 中自定义行为 */
  hideChevron?: boolean;
}

export const SidebarItem = React.memo(function SidebarItem({
  icon,
  label,
  active = false,
  depth = 0,
  hasChildren = false,
  isExpanded = false,
  actionItems,
  rightIndicator,
  onClick,
  onChevronClick,
  onMouseEnter,
  onMouseLeave,
  style,
  innerRef,
  hideChevron = false,
}: SidebarItemProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  // 一级项使用更大的字体和间距
  const isTopLevel = depth === 0;
  const textSize = isTopLevel ? 'text-[15px]' : 'text-sm';
  const iconSize = isTopLevel ? 'w-[18px] h-[18px]' : 'w-[16px] h-[16px]';
  const verticalPadding = isTopLevel ? 'py-2' : 'py-1.5';

  const handleMouseEnter = () => {
    setIsHovered(true);
    onMouseEnter?.();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onMouseLeave?.();
  };

  return (
    <div
      ref={innerRef}
      style={style}
      role="treeitem"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        group flex items-center gap-2 px-2 ${verticalPadding} rounded-md cursor-pointer
        ${textSize} font-medium transition-colors select-none touch-none
        ${active
          ? 'bg-app-hover text-app-fg-deeper'
          : 'text-app-fg hover:bg-app-hover hover:text-app-fg-deeper'
        }
      `}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {/* 展开/折叠箭头 */}
      {!hideChevron && (
        <span
          className={`
            shrink-0 w-4 h-4 flex items-center justify-center
            transition-transform duration-150
            ${hasChildren ? 'text-app-fg-light hover:text-app-fg-deep' : 'opacity-0 pointer-events-none'}
            ${isExpanded ? 'rotate-90' : ''}
          `}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={hasChildren ? onChevronClick : undefined}
          aria-hidden="true"
        >
          <ChevronRight size={12} />
        </span>
      )}

      {/* 图标：一级项 18px，其他 16px */}
      <span className={`shrink-0 ${iconSize} flex items-center justify-center text-[14px] leading-none`}>
        {icon}
      </span>

      {/* 标题：自动截断 */}
      <span className="flex-1 truncate min-w-0">{label}</span>

      {/* 悬停操作菜单 */}
      {actionItems && actionItems.length > 0 && (
        <div 
          className={`shrink-0 transition-opacity duration-150 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionMenu 
            items={actionItems} 
            align="end" 
            menuWidth="w-56"
          />
        </div>
      )}

      {/* 右侧状态指示器 */}
      {rightIndicator && (!actionItems || actionItems.length === 0) && (
        <div className="shrink-0">
          {rightIndicator}
        </div>
      )}
    </div>
  );
});
