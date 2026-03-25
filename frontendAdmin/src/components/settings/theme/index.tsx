/**
 * @file index.tsx
 * @description 主题设置区域组件
 */

import { ThemeConfigurator } from './components/ThemeConfigurator';

export function ThemeSection() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
      <ThemeConfigurator />
    </div>
  );
}
