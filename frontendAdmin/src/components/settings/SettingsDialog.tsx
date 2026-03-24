import { useEffect, useState } from 'react';
import { Palette, Settings2, X } from 'lucide-react';

import { ThemeConfigurator } from '@/components/editor/components/ThemeConfigurator';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsSectionId = 'theme';

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: typeof Palette;
}> = [
  {
    id: 'theme',
    label: '主题',
    description: '编辑器排版与色彩',
    icon: Palette,
  },
];

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('theme');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setActiveSection('theme');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex h-[84vh] w-[94vw] max-w-7xl overflow-hidden rounded-[28px] border border-border bg-app-bg shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
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
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === activeSection;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
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

          <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
            {activeSection === 'theme' ? <ThemeConfigurator /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
