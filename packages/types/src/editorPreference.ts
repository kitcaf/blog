import type { CalloutVariant, ImageBlockProps } from './block';

export type EditorThemeCssVariableName = `--editor-${string}`;

export type EditorStyleBindingTarget = 'css-variable' | 'extension-attr' | 'node-view';

export interface EditorTextStyleConfig {
  fontFamily?: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  marginTop: string;
  marginBottom: string;
}

export interface EditorParagraphThemeConfig extends EditorTextStyleConfig {
  minHeight: string;
}

export interface EditorHeadingThemeConfig extends EditorTextStyleConfig {
  paddingBottom?: string;
  borderBottom?: string;
}

export type EditorHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type EditorHeadingKey = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export type EditorHeadingThemeMap = Record<EditorHeadingKey, EditorHeadingThemeConfig>;

export interface EditorBlockquoteThemeConfig extends EditorTextStyleConfig {
  borderColor: string;
  borderWidth: string;
  paddingInlineStart: string;
  fontStyle: 'normal' | 'italic';
}

export interface EditorInlineCodeThemeConfig {
  backgroundColor: string;
  textColor: string;
  borderRadius: string;
  paddingInline: string;
  paddingBlock: string;
  fontSize: string;
  fontFamily: string;
}

export interface EditorCodeBlockThemeConfig {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: string;
  marginTop: string;
  marginBottom: string;
  paddingX: string;
  paddingY: string;
  fontSize: string;
  lineHeight: string;
  fontFamily: string;
}

export interface EditorLinkThemeConfig {
  color: string;
  hoverColor: string;
  underlineOffset: string;
}

export interface EditorSelectionThemeConfig {
  backgroundColor: string;
  color: string;
}

export interface EditorThemeConfig {
  rootClassName: string;
  textColor: string;
  caretColor: string;
  placeholderColor: string;
  selection: EditorSelectionThemeConfig;
  paragraph: EditorParagraphThemeConfig;
  headings: EditorHeadingThemeMap;
  blockquote: EditorBlockquoteThemeConfig;
  inlineCode: EditorInlineCodeThemeConfig;
  codeBlock: EditorCodeBlockThemeConfig;
  link: EditorLinkThemeConfig;
  tokens?: Partial<Record<EditorThemeCssVariableName, string>>;
}

export interface HeadingNodeStyleConfig {
  levels: readonly EditorHeadingLevel[];
  classNamePrefix: string;
}

export interface CalloutNodeStyleConfig {
  defaultVariant: CalloutVariant;
}

export interface MediaNodeStyleConfig {
  defaultAlignment: NonNullable<ImageBlockProps['alignment']>;
  defaultWidth: number;
}

export interface TableNodeStyleConfig {
  defaultWithHeaderRow: boolean;
  defaultStriped: boolean;
  defaultCompact: boolean;
}

export interface MermaidNodeStyleConfig {
  defaultTheme: 'default' | 'neutral' | 'dark';
}

export interface NodeStyleConfig {
  heading: HeadingNodeStyleConfig;
  callout: CalloutNodeStyleConfig;
  imageBlock: MediaNodeStyleConfig;
  video: MediaNodeStyleConfig;
  table: TableNodeStyleConfig;
  mermaid: MermaidNodeStyleConfig;
}

export interface EditorPreference {
  version: 1;
  theme: EditorThemeConfig;
  nodeStyles: NodeStyleConfig;
}
