import { useState } from 'react';
import type {
  EditorHeadingThemeConfig,
  EditorParagraphThemeConfig,
} from '@blog/types';
import { RotateCcw, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  useEditorPreferenceStore,
  type EditorTypographyPatch,
  type EditorTypographyTarget,
} from '@/store/useEditorPreferenceStore';
import { useEditorConfig } from '@/components/editor/hooks/useEditorConfig';
import { StylePreview } from './StylePreview';

type TypographyThemeConfig = EditorParagraphThemeConfig | EditorHeadingThemeConfig;

const TYPOGRAPHY_TARGETS: Array<{
  id: EditorTypographyTarget;
  label: string;
  description: string;
  badge: string;
}> = [
  { id: 'h1', label: '一级标题', description: '文章最高层级标题', badge: 'H1' },
  { id: 'h2', label: '二级标题', description: '章节标题', badge: 'H2' },
  { id: 'h3', label: '三级标题', description: '小节标题', badge: 'H3' },
  { id: 'paragraph', label: '正文', description: '默认段落排版', badge: 'P' },
];

const FONT_WEIGHT_OPTIONS = [
  { label: '常规', value: '400' },
  { label: '中等', value: '500' },
  { label: '半粗', value: '600' },
  { label: '粗体', value: '700' },
] as const;

const COLOR_SWATCHES = [
  { label: '深色', value: 'var(--color-fg-deeper)' },
  { label: '正文', value: 'var(--color-fg-deep)' },
  { label: '柔和', value: 'var(--color-fg)' },
  { label: '次级', value: 'var(--color-fg-light)' },
  { label: '蓝色', value: '#2563eb' },
  { label: '砖红', value: '#b45309' },
] as const;

const REM_BASE = 16;

function parseLengthToPixels(value: string, fallback: number): number {
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith('rem')) {
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed * REM_BASE : fallback;
  }

  if (normalized.endsWith('px')) {
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPixelsToRem(value: number): string {
  const remValue = Math.round((value / REM_BASE) * 1000) / 1000;
  return `${remValue}rem`;
}

function formatPixels(value: number): string {
  return `${Math.round(value)}px`;
}

function parseLineHeight(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseColorToHex(value: string): string {
  const normalized = value.trim();
  if (/^#([0-9a-f]{3})$/i.test(normalized)) {
    const [hash, r, g, b] = normalized;
    return `${hash}${r}${r}${g}${g}${b}${b}`;
  }

  if (/^#([0-9a-f]{6})$/i.test(normalized)) {
    return normalized;
  }

  const variableMatch = normalized.match(/^var\((--[^)]+)\)$/);
  if (variableMatch && typeof window !== 'undefined') {
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(variableMatch[1])
      .trim();
    return parseColorToHex(resolved);
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const [red = '0', green = '0', blue = '0'] = rgbMatch[1].split(',').map((item) => item.trim());
    const toHex = (channel: string) => {
      const parsed = Number.parseInt(channel, 10);
      if (!Number.isFinite(parsed)) {
        return '00';
      }
      return parsed.toString(16).padStart(2, '0');
    };

    return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  }

  return '#18181b';
}

function getTypographyConfig(
  target: EditorTypographyTarget,
  paragraph: EditorParagraphThemeConfig,
  headings: {
    h1: EditorHeadingThemeConfig;
    h2: EditorHeadingThemeConfig;
    h3: EditorHeadingThemeConfig;
  },
): TypographyThemeConfig {
  if (target === 'paragraph') {
    return paragraph;
  }

  return headings[target];
}

function ThemeMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-app-bg px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.12em] text-app-fg-light">{label}</div>
      <div className="mt-1 text-sm font-medium text-app-fg-deeper">{value}</div>
    </div>
  );
}

export function ThemeConfigurator() {
  const [activeTarget, setActiveTarget] = useState<EditorTypographyTarget>('h1');
  const { editorPreference, resetEditorPreference } = useEditorConfig();
  const updateTypographyTarget = useEditorPreferenceStore((state) => state.updateTypographyTarget);

  const currentConfig = getTypographyConfig(
    activeTarget,
    editorPreference.theme.paragraph,
    editorPreference.theme.headings,
  );

  const fontSizePx = parseLengthToPixels(currentConfig.fontSize, activeTarget === 'h1' ? 36 : 16);
  const marginTopPx = parseLengthToPixels(currentConfig.marginTop, 16);
  const marginBottomPx = parseLengthToPixels(currentConfig.marginBottom, 8);
  const lineHeight = parseLineHeight(currentConfig.lineHeight, 1.5);
  const fontWeight = String(currentConfig.fontWeight);
  const colorHex = parseColorToHex(currentConfig.color);

  const applyPatch = (patch: EditorTypographyPatch) => {
    updateTypographyTarget(activeTarget, patch);
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-app-fg-lightest/40 px-5 py-4">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-app-bg px-3 py-1 text-xs font-medium text-app-fg-light">
            <Sparkles className="h-3.5 w-3.5" />
            主题设置
          </div>
          <h2 className="mt-3 text-xl font-semibold text-app-fg-deeper">
            调整标题和正文的视觉层级
          </h2>
          <p className="mt-2 text-sm leading-6 text-app-fg">
            这里控制的是整个编辑器的全局排版主题。每次修改都会即时反映到右侧预览，也会同步更新当前打开的文章编辑器。
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="rounded-xl bg-app-bg"
          onClick={resetEditorPreference}
        >
          <RotateCcw className="h-4 w-4" />
          恢复默认
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] overflow-hidden">
        <div className="min-w-0 space-y-5 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TYPOGRAPHY_TARGETS.map((target) => {
              const targetConfig = getTypographyConfig(
                target.id,
                editorPreference.theme.paragraph,
                editorPreference.theme.headings,
              );
              const isActive = activeTarget === target.id;

              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => setActiveTarget(target.id)}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                    isActive
                      ? 'border-app-fg-deeper bg-app-bg shadow-sm'
                      : 'border-border bg-app-bg/70 hover:border-app-fg-light hover:bg-app-hover'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-app-fg-deeper">{target.label}</div>
                      <div className="mt-1 text-xs text-app-fg-light">{target.description}</div>
                    </div>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-app-fg-light">
                      {target.badge}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <ThemeMetric label="字号" value={formatPixels(parseLengthToPixels(targetConfig.fontSize, 16))} />
                    <ThemeMetric label="颜色" value={targetConfig.color} />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-app-bg px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-app-fg-deeper">
                  {TYPOGRAPHY_TARGETS.find((item) => item.id === activeTarget)?.label}样式
                </h3>
                <p className="mt-1 text-sm text-app-fg-light">
                  聚焦最核心的字号、颜色、字重和上下间距配置。
                </p>
              </div>
              <span className="rounded-full bg-app-hover px-2.5 py-1 text-xs font-medium text-app-fg-light">
                即时预览
              </span>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="flex items-center justify-between text-sm font-medium text-app-fg-deeper">
                  <span>字号</span>
                  <span className="text-xs text-app-fg-light">{formatPixels(fontSizePx)}</span>
                </label>
                <input
                  type="range"
                  min={12}
                  max={64}
                  step={1}
                  value={fontSizePx}
                  onChange={(event) => applyPatch({ fontSize: formatPixelsToRem(Number(event.target.value)) })}
                  className="w-full accent-app-fg-deeper"
                />
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-app-fg-deeper">字重</span>
                <div className="grid grid-cols-4 gap-2">
                  {FONT_WEIGHT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => applyPatch({ fontWeight: option.value })}
                      className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                        fontWeight === option.value
                          ? 'border-app-fg-deeper bg-app-hover text-app-fg-deeper'
                          : 'border-border text-app-fg-light hover:bg-app-hover hover:text-app-fg'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center justify-between text-sm font-medium text-app-fg-deeper">
                  <span>上间距</span>
                  <span className="text-xs text-app-fg-light">{formatPixels(marginTopPx)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={64}
                  step={1}
                  value={marginTopPx}
                  onChange={(event) => applyPatch({ marginTop: formatPixelsToRem(Number(event.target.value)) })}
                  className="w-full accent-app-fg-deeper"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center justify-between text-sm font-medium text-app-fg-deeper">
                  <span>下间距</span>
                  <span className="text-xs text-app-fg-light">{formatPixels(marginBottomPx)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={48}
                  step={1}
                  value={marginBottomPx}
                  onChange={(event) => applyPatch({ marginBottom: formatPixelsToRem(Number(event.target.value)) })}
                  className="w-full accent-app-fg-deeper"
                />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="flex items-center justify-between text-sm font-medium text-app-fg-deeper">
                  <span>颜色</span>
                  <span className="text-xs text-app-fg-light">{currentConfig.color}</span>
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="color"
                    value={colorHex}
                    onChange={(event) => applyPatch({ color: event.target.value })}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-app-bg p-1"
                  />

                  <input
                    type="text"
                    value={currentConfig.color}
                    onChange={(event) => applyPatch({ color: event.target.value })}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-app-bg px-3 py-2 text-sm text-app-fg-deeper outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/40"
                    placeholder="例如 #18181b 或 var(--color-fg-deeper)"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.value}
                      type="button"
                      onClick={() => applyPatch({ color: swatch.value })}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-app-bg px-3 py-1.5 text-xs font-medium text-app-fg-light transition-colors hover:bg-app-hover hover:text-app-fg"
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-black/10"
                        style={{ backgroundColor: swatch.value }}
                      />
                      {swatch.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="flex items-center justify-between text-sm font-medium text-app-fg-deeper">
                  <span>行高</span>
                  <span className="text-xs text-app-fg-light">{lineHeight.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={2}
                  step={0.05}
                  value={lineHeight}
                  onChange={(event) => applyPatch({ lineHeight: event.target.value })}
                  className="w-full accent-app-fg-deeper"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 overflow-y-auto">
          <StylePreview theme={editorPreference.theme} />
        </div>
      </div>
    </div>
  );
}
