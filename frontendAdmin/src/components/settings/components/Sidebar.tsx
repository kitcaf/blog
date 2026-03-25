/**
 * @file Sidebar.tsx
 * @description 设置侧边栏导航组件
 */

import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SettingsSection, SettingsSectionId } from '../types';

interface SidebarProps {
  sections: SettingsSection[];
  activeSection: SettingsSectionId;
  onSectionChange: (sectionId: SettingsSectionId) => void;
}

export function Sidebar({ sections, activeSection, onSectionChange }: SidebarProps) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-app-fg-lightest/35">
      <div className="border-b border-border px-5 py-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-app-bg px-3 py-1 text-xs font-medium text-app-fg-light">
          <Settings2 className="h-3.5 w-3.5" />
          设置
        </div>
        <h2 className="mt-3 text-lg font-semibold text-app-fg-deeper">工作台设置</h2>
        <p className="mt-2 text-sm leading-6 text-app-fg-light">
          左侧负责模块切换，右侧展示当前模块的完整配置界面。
        </p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeSection;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                isActive
                  ? 'border-app-fg-deeper bg-app-bg shadow-sm'
                  : 'border-transparent bg-transparent hover:border-border hover:bg-app-hover/70',
              )}
            >
              <div className="mt-0.5 rounded-xl bg-app-bg p-2 text-app-fg-deeper shadow-sm">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-app-fg-deeper">{section.label}</div>
                <div className="mt-1 text-xs leading-5 text-app-fg-light">{section.description}</div>
              </div>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-4 text-xs leading-5 text-app-fg-light">
        未来如果增加更多设置项，这里继续沿用同一套侧栏导航结构即可。
      </div>
    </aside>
  );
}
