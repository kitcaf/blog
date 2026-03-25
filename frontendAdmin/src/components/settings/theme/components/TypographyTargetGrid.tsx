import type { EditorThemeConfig } from '@blog/types';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { EditorTypographyTarget } from '@/store/useEditorPreferenceStore';
import { TYPOGRAPHY_TARGETS } from '../constants';
import {
  formatPixels,
  getTypographyConfig,
  getTypographyMetrics,
  getTypographyTargetMeta,
} from '../utils/typographyTheme';
import { SectionCard } from './SectionCard';

interface TypographyTargetGridProps {
  activeTarget: EditorTypographyTarget;
  onReset: () => void;
  onTargetChange: (target: EditorTypographyTarget) => void;
  theme: EditorThemeConfig;
}

export function TypographyTargetGrid({
  activeTarget,
  onReset,
  onTargetChange,
  theme,
}: TypographyTargetGridProps) {
  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-app-fg-deeper">主题</h2>

        <Button
          type="button"
          variant="outline"
          className="rounded-xl bg-app-bg"
          onClick={onReset}
        >
          <RotateCcw className="h-4 w-4" />
          重置
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {TYPOGRAPHY_TARGETS.map((target) => {
          const targetConfig = getTypographyConfig(target, theme);
          const targetMetrics = getTypographyMetrics(target, targetConfig);
          const targetMeta = getTypographyTargetMeta(target);
          const isActive = activeTarget === target;

          return (
            <button
              key={target}
              type="button"
              onClick={() => onTargetChange(target)}
              className={`rounded-2xl border px-4 py-4 text-left transition-all ${isActive
                ? 'border-app-fg-deeper/20 bg-app-hover shadow-sm'
                : 'border-border/80 bg-app-bg hover:border-app-fg-light hover:bg-app-hover/60'
                }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-app-fg-deeper">{targetMeta.label}</div>
                <span className="rounded-full border border-border/80 px-2 py-0.5 text-[11px] font-medium text-app-fg-light">
                  {targetMeta.badge}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-app-fg-light">
                  {formatPixels(targetMetrics.fontSizePx)}
                </div>
                <span
                  className="h-3 w-3 rounded-full border border-black/10"
                  style={{ backgroundColor: targetMetrics.colorHex }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}
