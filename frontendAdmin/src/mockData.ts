import type { BlockData } from '@blog/types';

/**
 * 初始化 Mock 数据
 * 模拟一篇文章的 Block 数组，结构与后端 API 响应水合后的数据一致
 */
export const initialMockData: BlockData[] = [
  {
    id: 'block-1',
    type: 'heading',
    parentId: null,
    path: '/block-1/',
    contentIds: [],
    props: { level: 1 },
    content: [{ type: 'text', text: 'Welcome to Notion-like Block Editor', styles: { bold: true } }],
  },
  {
    id: 'block-2',
    type: 'paragraph',
    parentId: null,
    path: '/block-2/',
    contentIds: [],
    props: {},
    content: [
      { type: 'text', text: 'This is a basic block rendering engine built with React and TypeScript. Everything here is a ' },
      { type: 'text', text: 'Block', styles: { code: true } },
      { type: 'text', text: ', which means every piece of content can be moved, modified, or transformed independently.' },
    ],
  },
  {
    id: 'block-3',
    type: 'heading',
    parentId: null,
    path: '/block-3/',
    contentIds: [],
    props: { level: 2 },
    content: [{ type: 'text', text: 'Key Features in our Model' }],
  },
  {
    id: 'block-4',
    type: 'bulletListItem',
    parentId: null,
    path: '/block-4/',
    contentIds: [],
    props: {},
    content: [{ type: 'text', text: 'Flat JSON array data structure' }],
  },
  {
    id: 'block-5',
    type: 'bulletListItem',
    parentId: null,
    path: '/block-5/',
    contentIds: [],
    props: {},
    content: [{ type: 'text', text: 'Atomic UI blocks mapping via switch/case' }],
  },
  {
    id: 'block-6',
    type: 'bulletListItem',
    parentId: null,
    path: '/block-6/',
    contentIds: [],
    props: {},
    content: [{ type: 'text', text: 'A clean and resilient dark-themed UI' }],
  },
  {
    id: 'block-7',
    type: 'callout',
    parentId: null,
    path: '/block-7/',
    contentIds: [],
    props: { variant: 'info' },
    content: [{ type: 'text', text: 'Pro tip: Building the core model strictly using TypeScript interfaces will save you lots of headache when you add drag-and-drop later!' }],
  },
  {
    id: 'block-8',
    type: 'image',
    parentId: null,
    path: '/block-8/',
    contentIds: [],
    props: {
      url: 'https://images.unsplash.com/photo-1618477247222-ac60ceb0a416?auto=format&fit=crop&q=80&w=800&h=400',
      caption: 'A dark, aesthetic workspace.',
      alignment: 'center',
    },
    content: [],
  },
  {
    id: 'block-9',
    type: 'code',
    parentId: null,
    path: '/block-9/',
    contentIds: [],
    props: { language: 'typescript' },
    content: [
      {
        type: 'text',
        text: `export interface BaseBlock<T extends BlockType, P extends BaseBlockProps> {
  id: string;
  type: T;
  parentId: string | null;   // → DB: parent_id
  path: string;              // → DB: path (物化路径)
  contentIds: string[];      // → DB: content_ids (子块排序)
  props: P;
  content: InlineContent[];
}`,
      },
    ],
  },
];
