import type { CSSProperties } from 'react';

import type {
  EditorHeadingKey,
  EditorHeadingThemeConfig,
  EditorThemeConfig,
  EditorThemeCssVariableName,
} from '@blog/types';

export const EDITOR_THEME_ROOT_CLASS_NAME = 'editor-theme-root';

const HEADING_KEYS: readonly EditorHeadingKey[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

const HEADING_THEME_TOKEN_NAMES = HEADING_KEYS.flatMap((headingKey) => [
  `--editor-heading-${headingKey}-font-family`,
  `--editor-heading-${headingKey}-font-size`,
  `--editor-heading-${headingKey}-font-weight`,
  `--editor-heading-${headingKey}-line-height`,
  `--editor-heading-${headingKey}-color`,
  `--editor-heading-${headingKey}-margin-top`,
  `--editor-heading-${headingKey}-margin-bottom`,
  `--editor-heading-${headingKey}-padding-bottom`,
  `--editor-heading-${headingKey}-border-bottom`,
]) as EditorThemeCssVariableName[];

export const EDITOR_THEME_TOKEN_NAMES: readonly EditorThemeCssVariableName[] = [
  '--editor-text-color',
  '--editor-caret-color',
  '--editor-placeholder-color',
  '--editor-selection-bg',
  '--editor-selection-fg',
  '--editor-paragraph-font-family',
  '--editor-paragraph-font-size',
  '--editor-paragraph-font-weight',
  '--editor-paragraph-line-height',
  '--editor-paragraph-color',
  '--editor-paragraph-margin-top',
  '--editor-paragraph-margin-bottom',
  '--editor-paragraph-min-height',
  ...HEADING_THEME_TOKEN_NAMES,
  '--editor-blockquote-font-family',
  '--editor-blockquote-font-size',
  '--editor-blockquote-font-weight',
  '--editor-blockquote-line-height',
  '--editor-blockquote-color',
  '--editor-blockquote-margin-top',
  '--editor-blockquote-margin-bottom',
  '--editor-blockquote-border-color',
  '--editor-blockquote-border-width',
  '--editor-blockquote-padding-inline-start',
  '--editor-blockquote-font-style',
  '--editor-inline-code-background',
  '--editor-inline-code-color',
  '--editor-inline-code-border-radius',
  '--editor-inline-code-padding-inline',
  '--editor-inline-code-padding-block',
  '--editor-inline-code-font-size',
  '--editor-inline-code-font-family',
  '--editor-code-block-background',
  '--editor-code-block-color',
  '--editor-code-block-border-color',
  '--editor-code-block-border-radius',
  '--editor-code-block-margin-top',
  '--editor-code-block-margin-bottom',
  '--editor-code-block-padding-x',
  '--editor-code-block-padding-y',
  '--editor-code-block-font-size',
  '--editor-code-block-line-height',
  '--editor-code-block-font-family',
  '--editor-link-color',
  '--editor-link-hover-color',
  '--editor-link-underline-offset',
];

export type EditorThemeStyle = CSSProperties & Partial<Record<EditorThemeCssVariableName, string>>;

function buildHeadingThemeVariables(
  headingKey: EditorHeadingKey,
  headingConfig: EditorHeadingThemeConfig,
): Partial<Record<EditorThemeCssVariableName, string>> {
  return {
    [`--editor-heading-${headingKey}-font-family`]: headingConfig.fontFamily ?? 'inherit',
    [`--editor-heading-${headingKey}-font-size`]: headingConfig.fontSize,
    [`--editor-heading-${headingKey}-font-weight`]: headingConfig.fontWeight,
    [`--editor-heading-${headingKey}-line-height`]: headingConfig.lineHeight,
    [`--editor-heading-${headingKey}-color`]: headingConfig.color,
    [`--editor-heading-${headingKey}-margin-top`]: headingConfig.marginTop,
    [`--editor-heading-${headingKey}-margin-bottom`]: headingConfig.marginBottom,
    [`--editor-heading-${headingKey}-padding-bottom`]: headingConfig.paddingBottom ?? '0px',
    [`--editor-heading-${headingKey}-border-bottom`]: headingConfig.borderBottom ?? 'none',
  } as Partial<Record<EditorThemeCssVariableName, string>>;
}

export function buildEditorThemeStyle(themeConfig: EditorThemeConfig): EditorThemeStyle {
  const headingVariables = HEADING_KEYS.reduce<Partial<Record<EditorThemeCssVariableName, string>>>(
    (variables, headingKey) => ({
      ...variables,
      ...buildHeadingThemeVariables(headingKey, themeConfig.headings[headingKey]),
    }),
    {},
  );

  const themeVariables: Partial<Record<EditorThemeCssVariableName, string>> = {
    '--editor-text-color': themeConfig.textColor,
    '--editor-caret-color': themeConfig.caretColor,
    '--editor-placeholder-color': themeConfig.placeholderColor,
    '--editor-selection-bg': themeConfig.selection.backgroundColor,
    '--editor-selection-fg': themeConfig.selection.color,
    '--editor-paragraph-font-family': themeConfig.paragraph.fontFamily ?? 'inherit',
    '--editor-paragraph-font-size': themeConfig.paragraph.fontSize,
    '--editor-paragraph-font-weight': themeConfig.paragraph.fontWeight,
    '--editor-paragraph-line-height': themeConfig.paragraph.lineHeight,
    '--editor-paragraph-color': themeConfig.paragraph.color,
    '--editor-paragraph-margin-top': themeConfig.paragraph.marginTop,
    '--editor-paragraph-margin-bottom': themeConfig.paragraph.marginBottom,
    '--editor-paragraph-min-height': themeConfig.paragraph.minHeight,
    ...headingVariables,
    '--editor-blockquote-font-family': themeConfig.blockquote.fontFamily ?? 'inherit',
    '--editor-blockquote-font-size': themeConfig.blockquote.fontSize,
    '--editor-blockquote-font-weight': themeConfig.blockquote.fontWeight,
    '--editor-blockquote-line-height': themeConfig.blockquote.lineHeight,
    '--editor-blockquote-color': themeConfig.blockquote.color,
    '--editor-blockquote-margin-top': themeConfig.blockquote.marginTop,
    '--editor-blockquote-margin-bottom': themeConfig.blockquote.marginBottom,
    '--editor-blockquote-border-color': themeConfig.blockquote.borderColor,
    '--editor-blockquote-border-width': themeConfig.blockquote.borderWidth,
    '--editor-blockquote-padding-inline-start': themeConfig.blockquote.paddingInlineStart,
    '--editor-blockquote-font-style': themeConfig.blockquote.fontStyle,
    '--editor-inline-code-background': themeConfig.inlineCode.backgroundColor,
    '--editor-inline-code-color': themeConfig.inlineCode.textColor,
    '--editor-inline-code-border-radius': themeConfig.inlineCode.borderRadius,
    '--editor-inline-code-padding-inline': themeConfig.inlineCode.paddingInline,
    '--editor-inline-code-padding-block': themeConfig.inlineCode.paddingBlock,
    '--editor-inline-code-font-size': themeConfig.inlineCode.fontSize,
    '--editor-inline-code-font-family': themeConfig.inlineCode.fontFamily,
    '--editor-code-block-background': themeConfig.codeBlock.backgroundColor,
    '--editor-code-block-color': themeConfig.codeBlock.textColor,
    '--editor-code-block-border-color': themeConfig.codeBlock.borderColor,
    '--editor-code-block-border-radius': themeConfig.codeBlock.borderRadius,
    '--editor-code-block-margin-top': themeConfig.codeBlock.marginTop,
    '--editor-code-block-margin-bottom': themeConfig.codeBlock.marginBottom,
    '--editor-code-block-padding-x': themeConfig.codeBlock.paddingX,
    '--editor-code-block-padding-y': themeConfig.codeBlock.paddingY,
    '--editor-code-block-font-size': themeConfig.codeBlock.fontSize,
    '--editor-code-block-line-height': themeConfig.codeBlock.lineHeight,
    '--editor-code-block-font-family': themeConfig.codeBlock.fontFamily,
    '--editor-link-color': themeConfig.link.color,
    '--editor-link-hover-color': themeConfig.link.hoverColor,
    '--editor-link-underline-offset': themeConfig.link.underlineOffset,
    ...themeConfig.tokens,
  };

  return themeVariables as EditorThemeStyle;
}

export function getEditorThemeRootClassNames(themeConfig: Pick<EditorThemeConfig, 'rootClassName'>): string[] {
  return [EDITOR_THEME_ROOT_CLASS_NAME, themeConfig.rootClassName].filter(Boolean);
}
