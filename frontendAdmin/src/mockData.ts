import type { BlockData } from '@blog/types';

const ROOT_PAGE_ID = 'page-root';

/**
 * 初始化 Mock 数据，这里只是模拟一个页面的数据
 *
 * 结构说明：
 *  - page-root：顶层 Page（文章页），contentIds 决定子块渲染顺序
 *  - 其余 block：parentId 指向 page-root，path=/page-root/block-id/
 *
 * 此结构与后端 DbBlock 水合后完全一致，切换为真实 API 时无需修改 Store。
 */
export const initialMockData: BlockData[] = [
  {
    id: ROOT_PAGE_ID,
    type: 'page',
    parentId: null,
    path: `/${ROOT_PAGE_ID}/`,
    contentIds: [
      'block-1', 'block-2', 'block-3',
      'block-4', 'block-5', 'block-6',
      'block-7', 'block-8', 'block-9',
    ],
    props: {
      title: 'Welcome to Block Editor',
      icon: '📝',
      isPublished: false,
    },
    content: [],
  },
  {
    id: 'block-1',
    type: 'heading',
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-1/`,
    contentIds: [],
    props: { level: 1 },
    content: [{ type: 'text', text: 'Welcome to Notion-like Block Editor', styles: { bold: true } }],
  },
  {
    id: 'block-2',
    type: 'paragraph',
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-2/`,
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
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-3/`,
    contentIds: [],
    props: { level: 2 },
    content: [{ type: 'text', text: 'Key Features in our Model' }],
  },
  {
    id: 'block-4',
    type: 'bulletListItem',
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-4/`,
    contentIds: [],
    props: {},
    content: [{ type: 'text', text: 'Normalized store — O(1) block lookups with Record<id, Block>' }],
  },
  {
    id: 'block-5',
    type: 'bulletListItem',
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-5/`,
    contentIds: [],
    props: {},
    content: [{ type: 'text', text: 'Dirty tracking with Set<string> for debounced batch sync' }],
  },
  {
    id: 'block-6',
    type: 'bulletListItem',
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-6/`,
    contentIds: [],
    props: {},
    content: [{ type: 'text', text: 'Fine-grained subscriptions via selector functions — minimal re-renders' }],
  },
  {
    id: 'block-7',
    type: 'callout',
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-7/`,
    contentIds: [],
    props: { variant: 'info' },
    content: [{ type: 'text', text: 'Pro tip: The store\'s getSyncPayload() dehydrates Block → DbBlock format, ready to POST to /api/blocks/sync.' }],
  },
  {
    id: 'block-8',
    type: 'image',
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-8/`,
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
    parentId: ROOT_PAGE_ID,
    path: `/${ROOT_PAGE_ID}/block-9/`,
    contentIds: [],
    props: { language: 'typescript' },
    content: [
      {
        type: 'text',
        text: `// Zustand Store — 核心 Action 用法示例
const { updateBlockContent, addBlock, getSyncPayload } = useBlockStore(selectActions);

// 更新某块的内联内容（防抖后同步）
updateBlockContent('block-1', [{ type: 'text', text: 'New heading' }]);

// 获取待同步 payload（供 React Query useMutation 调用）
const payload = getSyncPayload();
// POST /api/blocks/sync — payload: { updated_blocks, deleted_blocks }`,
      },
    ],
  },
];
