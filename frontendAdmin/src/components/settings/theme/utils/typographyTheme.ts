import type {
  EditorHeadingThemeConfig,
  EditorParagraphThemeConfig,
  EditorThemeConfig,
} from '@blog/types';

import type { EditorTypographyTarget } from '@/store/useEditorPreferenceStore';
import { TARGET_DEFAULT_FONT_SIZE, TYPOGRAPHY_TARGET_META } from '../constants';

const REM_BASE = 16;
const DEFAULT_LINE_HEIGHT = 1.5;
const DEFAULT_MARGIN_BOTTOM = 8;
const DEFAULT_MARGIN_TOP = 16;
const FALLBACK_COLOR = '#18181b';

export type TypographyThemeConfig = EditorParagraphThemeConfig | EditorHeadingThemeConfig;

export interface TypographyMetrics {
  colorHex: string;
  fontSizePx: number;
  fontWeight: string;
  lineHeight: number;
  marginBottomPx: number;
  marginTopPx: number;
}

export function parseLengthToPixels(value: string, fallback: number): number {
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

export function formatPixelsToRem(value: number): string {
  const remValue = Math.round((value / REM_BASE) * 1000) / 1000;
  return `${remValue}rem`;
}

export function formatPixels(value: number): string {
  return `${Math.round(value)}px`;
}

export function parseLineHeight(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseColorToHex(value: string): string {
  const normalized = value.trim();

  if (/^#([0-9a-f]{3})$/i.test(normalized)) {
    const [hash, red, green, blue] = normalized;
    return `${hash}${red}${red}${green}${green}${blue}${blue}`;
  }

  if (/^#([0-9a-f]{6})$/i.test(normalized)) {
    return normalized.toLowerCase();
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

  return FALLBACK_COLOR;
}

export function normalizeHexInput(value: string): string | null {
  const normalized = value.trim();

  if (/^#([0-9a-f]{3})$/i.test(normalized)) {
    const [hash, red, green, blue] = normalized;
    return `${hash}${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }

  if (/^#([0-9a-f]{6})$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  return null;
}

export function getTypographyConfig(
  target: EditorTypographyTarget,
  theme: EditorThemeConfig,
): TypographyThemeConfig {
  if (target === 'paragraph') {
    return theme.paragraph;
  }

  return theme.headings[target];
}

export function getTypographyMetrics(
  target: EditorTypographyTarget,
  config: TypographyThemeConfig,
): TypographyMetrics {
  return {
    colorHex: parseColorToHex(config.color),
    fontSizePx: parseLengthToPixels(config.fontSize, TARGET_DEFAULT_FONT_SIZE[target]),
    fontWeight: String(config.fontWeight),
    lineHeight: parseLineHeight(config.lineHeight, DEFAULT_LINE_HEIGHT),
    marginBottomPx: parseLengthToPixels(config.marginBottom, DEFAULT_MARGIN_BOTTOM),
    marginTopPx: parseLengthToPixels(config.marginTop, DEFAULT_MARGIN_TOP),
  };
}

export function getTypographyTargetMeta(target: EditorTypographyTarget) {
  return TYPOGRAPHY_TARGET_META[target];
}
