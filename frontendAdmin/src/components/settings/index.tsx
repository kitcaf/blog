/**
 * @file index.tsx
 * @description 设置对话框入口
 * 
 * 特性：
 * - 模块化架构：侧边栏 + 内容区域
 * - 键盘导航：支持 Esc 关闭
 * - 可扩展：易于添加新的设置模块
 */

import { useCallback, useEffect, useState } from 'react';
import { Palette, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ThemeSection } from './theme';
import type { SettingsDialogProps, SettingsSection, SettingsSectionId } from './types';

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'theme',
    label: '主题',
    description: '编辑器外观',
    icon: Palette,
  },
];

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('theme');

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSectionChange = useCallback((sectionId: SettingsSectionId) => {
    setActiveSection(sectionId);
  }, []);

  if (!isOpen) return null;

  const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex h-[86vh] w-[94vw] max-w-[1180px] overflow-hidden rounded-[30px] border border-border/80 bg-app-bg shadow-[0_36px_120px_rgba(0,0,0,0.28)] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(24,24,27,0.06),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(24,24,27,0.04),transparent_36%)]" />

        <Sidebar
          sections={SETTINGS_SECTIONS}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 px-6 py-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-app-fg-light">Settings</div>
              <h3 className="mt-2 text-2xl font-semibold text-app-fg-deeper">{activeSectionMeta?.label}</h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border bg-app-bg p-2 text-app-fg-light transition-colors hover:bg-app-hover hover:text-app-fg-deeper"
                aria-label="关闭设置"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {activeSection === 'theme' && <ThemeSection />}
        </div>
      </div>
    </div>
  );
}
