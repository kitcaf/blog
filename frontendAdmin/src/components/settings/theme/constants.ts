import type { EditorTypographyTarget } from '@/store/useEditorPreferenceStore';

export const TYPOGRAPHY_TARGETS: EditorTypographyTarget[] = ['h1', 'h2', 'h3', 'paragraph'];

export const TYPOGRAPHY_TARGET_META: Record<
  EditorTypographyTarget,
  {
    badge: string;
    label: string;
  }
> = {
  h1: { label: '一级标题', badge: 'H1' },
  h2: { label: '二级标题', badge: 'H2' },
  h3: { label: '三级标题', badge: 'H3' },
  paragraph: { label: '正文', badge: 'P' },
};

export const FONT_WEIGHT_OPTIONS = [
  { label: '常规', value: '400' },
  { label: '中等', value: '500' },
  { label: '半粗', value: '600' },
  { label: '粗体', value: '700' },
] as const;

export const COLOR_SWATCHES = [
  { label: '深色', value: 'var(--color-fg-deeper)' },
  { label: '正文', value: 'var(--color-fg-deep)' },
  { label: '柔和', value: 'var(--color-fg)' },
  { label: '次级', value: 'var(--color-fg-light)' },
  { label: '蓝色', value: '#2563eb' },
  { label: '砖红', value: '#b45309' },
] as const;

export const TARGET_DEFAULT_FONT_SIZE: Record<EditorTypographyTarget, number> = {
  h1: 36,
  h2: 30,
  h3: 24,
  paragraph: 16,
};

export const TYPOGRAPHY_CONTROL_LIMITS = {
  fontSize: { min: 12, max: 64, step: 1 },
  lineHeight: { min: 1, max: 2, step: 0.05 },
  marginBottom: { min: 0, max: 48, step: 1 },
  marginTop: { min: 0, max: 64, step: 1 },
} as const;
