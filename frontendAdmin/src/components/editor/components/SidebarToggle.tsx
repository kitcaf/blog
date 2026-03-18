import { memo } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { useSidebarStore } from '@/store/useSidebarStore';

/**
 * 侧边栏切换按钮
 * 
 * 职责：
 *  - 仅在侧边栏关闭时显示
 *  - 点击展开侧边栏
 * 
 * 性能优化：
 *  - 使用 memo 避免不必要的重渲染
 *  - 使用 Zustand 选择器只订阅 isOpen 状态
 */
export const SidebarToggle = memo(function SidebarToggle() {
  const isOpen = useSidebarStore(s => s.isOpen);
  const setIsOpen = useSidebarStore(s => s.setIsOpen);

  // 侧边栏打开时不显示
  if (isOpen) {
    return null;
  }

  return (
    <button
      className="p-1.5 rounded-md text-app-fg-light hover:text-app-fg-deeper hover:bg-app-hover transition-colors"
      onClick={() => setIsOpen(true)}
      title="展开侧边栏"
    >
      <PanelLeftOpen className="w-4 h-4" />
    </button>
  );
});
