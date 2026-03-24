import type {
  EditorStyleBindingTarget,
  NodeStyleConfig,
} from '@blog/types';

export interface EditorStyleFieldBoundary {
  field: string;
  target: EditorStyleBindingTarget;
  owner: 'theme' | 'extension' | 'node-view';
  rationale: string;
}

export const defaultNodeStyleConfig: NodeStyleConfig = {
  heading: {
    levels: [1, 2, 3],
    classNamePrefix: 'editor-heading',
  },
  callout: {
    defaultVariant: 'info',
  },
  imageBlock: {
    defaultAlignment: 'center',
    defaultWidth: 100,
  },
  video: {
    defaultAlignment: 'center',
    defaultWidth: 100,
  },
  table: {
    defaultWithHeaderRow: true,
    defaultStriped: false,
    defaultCompact: false,
  },
  mermaid: {
    defaultTheme: 'default',
  },
};

export const editorStyleFieldBoundaries: readonly EditorStyleFieldBoundary[] = [
  {
    field: 'global typography, spacing, and color tokens',
    target: 'css-variable',
    owner: 'theme',
    rationale:
      '标题字号、段落颜色、引用边框、代码块配色都属于全局展示层，应该通过 --editor-* CSS 变量统一下发。',
  },
  {
    field: 'heading level and future node-specific attrs',
    target: 'extension-attr',
    owner: 'extension',
    rationale:
      '标题等级、对齐方式这类需要参与文档语义和序列化的字段，应由 Tiptap Extension attrs 承载。',
  },
  {
    field: 'callout, imageBlock, video, table, mermaid interactive UI',
    target: 'node-view',
    owner: 'node-view',
    rationale:
      '复杂块节点的交互和结构比纯文本样式复杂，需要通过 React NodeView 管控渲染与编辑行为。',
  },
];
