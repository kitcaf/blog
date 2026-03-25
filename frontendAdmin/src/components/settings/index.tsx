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
    description: '编辑器排版与色彩',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex h-[84vh] w-[94vw] max-w-7xl overflow-hidden rounded-[28px] border border-border bg-app-bg shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <Sidebar
          sections={SETTINGS_SECTIONS}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <h3 className="text-xl font-semibold text-app-fg-deeper">{activeSectionMeta?.label}</h3>
              <p className="mt-2 text-sm leading-6 text-app-fg-light">
                {activeSectionMeta?.description}。修改会实时作用到编辑器根节点的 CSS 变量，不会重建 Tiptap 实例。
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-app-fg-light transition-colors hover:bg-app-hover hover:text-app-fg-deeper"
              aria-label="关闭设置"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {activeSection === 'theme' && <ThemeSection />}
        </div>
      </div>
    </div>
  );
}
