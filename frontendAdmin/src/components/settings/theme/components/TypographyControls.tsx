import type { ChangeEvent } from 'react';

import type { EditorTypographyPatch, EditorTypographyTarget } from '@/store/useEditorPreferenceStore';
import { COLOR_SWATCHES, FONT_WEIGHT_OPTIONS, TYPOGRAPHY_CONTROL_LIMITS } from '../constants';
import {
  formatPixels,
  formatPixelsToRem,
  getTypographyTargetMeta,
  parseColorToHex,
  type TypographyMetrics,
} from '../utils/typographyTheme';
import { HexColorField } from './HexColorField';
import { RangeControlCard } from './RangeControlCard';
import { SectionCard } from './SectionCard';

interface TypographyControlsProps {
  activeTarget: EditorTypographyTarget;
  metrics: TypographyMetrics;
  onPatch: (patch: EditorTypographyPatch) => void;
}

function FontWeightControl({
  fontWeight,
  onSelect,
}: {
  fontWeight: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-app-fg-lightest/20 px-4 py-4 lg:col-span-2">
      <span className="text-sm font-medium text-app-fg-deeper">字重</span>
      <div className="grid grid-cols-4 gap-2">
        {FONT_WEIGHT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${fontWeight === option.value
              ? 'border-app-fg-deeper bg-app-hover text-app-fg-deeper'
              : 'border-border text-app-fg-light hover:bg-app-hover hover:text-app-fg'
              }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorControl({
  activeTarget,
  colorHex,
  onChange,
}: {
  activeTarget: EditorTypographyTarget;
  colorHex: string;
  onChange: (value: string) => void;
}) {
  function handlePickerChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value.toLowerCase());
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-app-fg-lightest/20 px-4 py-4 lg:col-span-2">
      <label className="flex items-center justify-between text-sm font-medium text-app-fg-deeper">
        <span>颜色</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={colorHex}
          onChange={handlePickerChange}
          className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-app-bg p-1"
        />

        <HexColorField
          key={`${activeTarget}-${colorHex}`}
          initialValue={colorHex}
          onCommit={onChange}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {COLOR_SWATCHES.map((swatch) => {
          const swatchColor = parseColorToHex(swatch.value);

          return (
            <button
              key={swatch.value}
              type="button"
              onClick={() => onChange(swatchColor)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-app-bg px-3 py-1.5 text-xs font-medium text-app-fg-light transition-colors hover:bg-app-hover hover:text-app-fg"
            >
              <span
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: swatchColor }}
              />
              {swatch.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TypographyControls({
  activeTarget,
  metrics,
  onPatch,
}: TypographyControlsProps) {
  const activeTargetMeta = getTypographyTargetMeta(activeTarget);

  function handleFontSizeChange(value: number) {
    onPatch({ fontSize: formatPixelsToRem(value) });
  }

  function handleMarginTopChange(value: number) {
    onPatch({ marginTop: formatPixelsToRem(value) });
  }

  function handleMarginBottomChange(value: number) {
    onPatch({ marginBottom: formatPixelsToRem(value) });
  }

  function handleLineHeightChange(value: number) {
    onPatch({ lineHeight: String(value) });
  }

  function handleColorChange(value: string) {
    onPatch({ color: value });
  }

  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-app-fg-deeper">
          {activeTargetMeta.label}样式
        </h3>

        <span className="rounded-full border border-border/80 bg-app-fg-lightest/40 px-2.5 py-1 text-xs font-medium text-app-fg-light">
          {activeTargetMeta.badge}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <RangeControlCard
          label="字号"
          value={metrics.fontSizePx}
          valueLabel={formatPixels(metrics.fontSizePx)}
          onChange={handleFontSizeChange}
          className="lg:col-span-2"
          {...TYPOGRAPHY_CONTROL_LIMITS.fontSize}
        />

        <FontWeightControl
          fontWeight={metrics.fontWeight}
          onSelect={(value) => onPatch({ fontWeight: value })}
        />

        <RangeControlCard
          label="上间距"
          value={metrics.marginTopPx}
          valueLabel={formatPixels(metrics.marginTopPx)}
          onChange={handleMarginTopChange}
          {...TYPOGRAPHY_CONTROL_LIMITS.marginTop}
        />

        <RangeControlCard
          label="下间距"
          value={metrics.marginBottomPx}
          valueLabel={formatPixels(metrics.marginBottomPx)}
          onChange={handleMarginBottomChange}
          {...TYPOGRAPHY_CONTROL_LIMITS.marginBottom}
        />

        <ColorControl
          activeTarget={activeTarget}
          colorHex={metrics.colorHex}
          onChange={handleColorChange}
        />

        <RangeControlCard
          label="行高"
          value={metrics.lineHeight}
          valueLabel={metrics.lineHeight.toFixed(2)}
          onChange={handleLineHeightChange}
          className="lg:col-span-2"
          {...TYPOGRAPHY_CONTROL_LIMITS.lineHeight}
        />
      </div>
    </SectionCard>
  );
}
