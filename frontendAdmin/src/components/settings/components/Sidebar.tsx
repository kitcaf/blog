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
    <aside className="relative flex w-[248px] shrink-0 flex-col border-r border-border/70 bg-app-fg-lightest/25 backdrop-blur-xl">
      <div className="border-b border-border/70 px-5 py-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-app-bg px-3 py-1 text-xs font-medium text-app-fg-light">
          <Settings2 className="h-3.5 w-3.5" />
          设置
        </div>
      </div>

      <nav className="flex-1 space-y-2 p-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeSection;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                isActive
                  ? 'border-app-fg-deeper/20 bg-app-bg shadow-[0_10px_24px_rgba(0,0,0,0.06)]'
                  : 'border-transparent bg-transparent hover:border-border hover:bg-app-hover/70',
              )}
            >
              <div
                className={cn(
                  'rounded-xl p-2 shadow-sm transition-colors',
                  isActive
                    ? 'bg-app-hover text-app-fg-deeper'
                    : 'bg-app-bg text-app-fg-light group-hover:text-app-fg-deeper',
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-app-fg-deeper">{section.label}</div>
                <div className="mt-0.5 text-xs text-app-fg-light">{section.description}</div>
              </div>
              {isActive ? <div className="ml-auto h-2.5 w-2.5 rounded-full bg-app-fg-deeper" /> : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
