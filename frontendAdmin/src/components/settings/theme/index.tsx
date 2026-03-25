/**
 * @file index.tsx
 * @description 主题设置区域组件
 */

import { ThemeConfigurator } from './components/ThemeConfigurator';

export function ThemeSection() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(244,244,245,0.32),transparent_28%)] px-6 py-5">
      <ThemeConfigurator />
    </div>
  );
}
