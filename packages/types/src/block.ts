/**
 * @file block.ts
 * @description Block 数据模型的核心类型定义。
 *
 * ┌─────────────────────────────────────────────────────┐
 * │                   架构分层说明                        │
 * ├─────────────────────────────────────────────────────┤
 * │  DbBlock          后端 PostgreSQL `blocks` 表的镜像  │
 * │                   用于 API 请求 / 响应的原始类型      │
 * │                                                     │
 * │  Block (及子类型)  前端"水合"后的工作类型             │
 * │                   从 DbBlock.properties 中解析出     │
 * │                   强类型的 props + content           │
 * ├─────────────────────────────────────────────────────┤
 * 
 *  数据流：                                           
 *    API Response (DbBlock)  
 *    React Query (useQuery / useMutation) 负责缓存、重试、乐观更新 DbBlock
 *      → hydrate()  → Block (前端 Zustand 状态)        
 *      → dehydrate() → DbBlock → PATCH /api/blocks    
 *
 * 与 Tiptap 内部 JSON 的映射关系（供 hydrate/dehydrate 参考）：
 *
 *  Tiptap JSON                    │  我们的 Block 类型
 *  ───────────────────────────────┼──────────────────────────
 *  node.type = "heading"          │  Block.type = "heading"
 *  node.attrs = { level: 1 }     │  Block.props = { level: 1 }
 *  node.content = [text nodes]   │  Block.content: InlineContent[]
 *  ───────────────────────────────┼──────────────────────────
 *  Tiptap 的 attrs  ≡  Block.props
 *  Tiptap 的 content ≡  Block.content (需要格式转换)
 */

// ─────────────────────────────────────────────
// 一、Block 类型枚举
// ─────────────────────────────────────────────

/** 所有支持的 Block 类型，与后端 blocks.type 字段对应 */
export type BlockType =
  // 容器类
  | 'page'               // 页面块（既是文章页，也是文件夹节点；侧边栏目录树的最小单元）
  // 文本类
  | 'paragraph'          // 普通段落
  | 'heading'            // 标题（H1/H2/H3，通过 props.level 区分）
  | 'quote'              // 引用块
  | 'callout'            // 高亮提示框（info / warning / error / success）
  // 列表类
  | 'bulletListItem'     // 无序列表项
  | 'numberedListItem'   // 有序列表项
  | 'checkListItem'      // 复选框列表项
  // 媒体类
  | 'image'              // 图片
  | 'video'              // 视频（预留）
  | 'file'               // 文件附件（预留）
  // 代码类
  | 'code'               // 代码块（含语法高亮语言标识）
  // 其他
  | 'divider'            // 分割线
  | 'table'              // 表格（预留）
  // Admin 专属智能块（未来从数据库实时拉取数据展示）
  | 'admin-stat-card'         // 数据统计卡片
  | 'admin-traffic-chart'     // 流量折线图
  | 'admin-recent-comments';  // 最新评论列表

// ─────────────────────────────────────────────
// 二、通用辅助类型
// ─────────────────────────────────────────────

/** 文本水平对齐方式 */
export type TextAlignment = 'left' | 'center' | 'right';

/** Callout 块的语义变体 */
export type CalloutVariant = 'info' | 'warning' | 'error' | 'success';

// ─────────────────────────────────────────────
// 三、内联内容（InlineContent）
// 对应 properties.content 数组，描述富文本中的各个行内节点。
// Tiptap 映射：Tiptap 的 text node marks → InlineStyle
// ─────────────────────────────────────────────

/** 内联文本/链接节点共享的样式属性 */
export interface InlineStyle {
  bold?: boolean;           // 粗体
  italic?: boolean;         // 斜体
  underline?: boolean;      // 下划线
  strikethrough?: boolean;  // 删除线
  code?: boolean;           // 行内代码
  textColor?: string;       // 文字颜色（CSS class 或 hex 值）
  backgroundColor?: string; // 背景颜色
}

/** 纯文本节点（对应 Tiptap text node） */
export interface InlineTextNode {
  type: 'text';
  text: string;
  styles?: InlineStyle;
}

/** 超链接节点（对应 Tiptap link mark） */
export interface InlineLinkNode {
  type: 'link';
  text: string;
  href: string;
  styles?: InlineStyle;
}

/** 内联内容的联合类型，对应后端 properties.content[] */
export type InlineContent = InlineTextNode | InlineLinkNode;

// ─────────────────────────────────────────────
// 四、Block Props（块级属性）
// 对应 Tiptap 的 node.attrs，从后端 properties JSONB 中解析。
// ─────────────────────────────────────────────

/** 所有 Block 都可能拥有的通用属性 */
export interface BaseBlockProps {
  textColor?: string;            // 文字颜色
  backgroundColor?: string;      // 背景颜色
  textAlignment?: TextAlignment; // 文本对齐方式
}

/**
 * Page 块（页面/文件夹）的专有属性。
 * Page 在本系统中扮演双重角色：
 *  1. 侧边栏目录树的节点（通过 title/icon 展示）
 *  2. 博客文章（通过 isPublished/slug/description 控制发布和 SEO）
 */
export interface PageBlockProps extends BaseBlockProps {
  /** 页面标题，侧边栏直接读取此字段，无需遍历子块 */
  title: string;
  /** 页面图标，支持 Emoji（'📄'）或图片 URL */
  icon?: string;
  /** 封面图 URL */
  coverImage?: string;
  /** 是否作为博客文章对外发布，默认 false */
  isPublished?: boolean;
  /** 文章的自定义 URL slug，例如: 'my-first-post'（对应访问路径 /blog/my-first-post） */
  slug?: string;
  /** 文章摘要，用于 SEO meta description 和列表页卡片预览 */
  description?: string;
}

/** Heading 块的专有属性（对应 Tiptap HeadingNode 的 attrs.level） */
export interface HeadingBlockProps extends BaseBlockProps {
  level: 1 | 2 | 3;
}

/** Code 块的专有属性（对应 Tiptap CodeBlockLowlight 的 attrs.language） */
export interface CodeBlockProps extends BaseBlockProps {
  language: string; // 如 'typescript', 'go', 'sql'
}

/** Image / Video 块的专有属性 */
export interface ImageBlockProps extends BaseBlockProps {
  url: string;
  caption?: string;
  width?: number; // 宽度百分比，如 100 表示全宽
  alignment?: 'left' | 'center' | 'right' | 'full';
}

/** CheckListItem 块的专有属性 */
export interface CheckListBlockProps extends BaseBlockProps {
  checked: boolean;
}

/** Callout 块的专有属性（使用 variant 避免与外层 block.type 命名冲突） */
export interface CalloutBlockProps extends BaseBlockProps {
  variant: CalloutVariant;
}

// ─────────────────────────────────────────────
// 五、前端 Block 核心接口（与后端数据库字段完全对齐）
// ─────────────────────────────────────────────

/**
 * 前端 Block 的基础接口。
 *
 * 后端 blocks 表字段映射：
 *  id          → blocks.id          (UUID，由前端生成，本地优先)
 *  type        → blocks.type
 *  parentId    → blocks.parent_id   (camelCase；根节点为 null)
 *  path        → blocks.path        (物化路径，侧边栏批量加载的关键)
 *  contentIds  → blocks.content_ids (子块有序 ID 数组，拖拽排序只改此字段)
 *  props       → blocks.properties  (JSONB 拆解为强类型)
 *  content     → blocks.properties.content
 *  createdAt   → blocks.created_at
 *  updatedAt   → blocks.updated_at
 *  deletedAt   → blocks.deleted_at  (null = 未删除)
 */
export interface BaseBlock<T extends BlockType, P extends BaseBlockProps = BaseBlockProps> {
  /** 唯一标识，UUID，由前端生成（支持离线编辑） */
  id: string;
  /** Block 类型 */
  type: T;
  /** 直系父节点 ID，根节点为 null */
  parentId: string | null;
  /**
   * 物化路径，格式：'/root-uuid/parent-uuid/this-uuid/'
   * 支持用单条 SQL + LIKE 查询任意子树，无需递归
   */
  path: string;
  /**
   * 子块 ID 有序数组。
   * 拖拽排序时只需更新父节点的此字段，子块本身无需变动。
   */
  contentIds: string[];
  /** 块级属性（从 DbBlock.properties除去props外的属性对共同中解析，对应 Tiptap node.attrs） */
  props: P;
  /** 内联富文本内容（从 DbBlock.properties.content 解析，对应 Tiptap node.content） */
  content: InlineContent[];
  // 服务端时间戳，API 响应中携带，前端只读
  createdAt?: string;
  updatedAt?: string;
  /** null 表示正常，有值表示已软删除 */
  deletedAt?: string | null;
}

// ─────────────────────────────────────────────
// 六、具体 Block 类型定义
// ─────────────────────────────────────────────

export interface PageBlock extends BaseBlock<'page', PageBlockProps> {}

export interface ParagraphBlock extends BaseBlock<'paragraph'> {}
export interface HeadingBlock extends BaseBlock<'heading', HeadingBlockProps> {}
export interface QuoteBlock extends BaseBlock<'quote'> {}
export interface CalloutBlock extends BaseBlock<'callout', CalloutBlockProps> {}

export interface BulletListItemBlock extends BaseBlock<'bulletListItem'> {}
export interface NumberedListItemBlock extends BaseBlock<'numberedListItem'> {}
export interface CheckListItemBlock extends BaseBlock<'checkListItem', CheckListBlockProps> {}

export interface ImageBlock extends BaseBlock<'image', ImageBlockProps> {}
export interface VideoBlock extends BaseBlock<'video', ImageBlockProps> {}
export interface FileBlock extends BaseBlock<'file'> {}

export interface CodeBlock extends BaseBlock<'code', CodeBlockProps> {}
export interface DividerBlock extends BaseBlock<'divider'> {}
export interface TableBlock extends BaseBlock<'table'> {}

export interface AdminStatCardBlock extends BaseBlock<'admin-stat-card'> {}
export interface AdminTrafficChartBlock extends BaseBlock<'admin-traffic-chart'> {}
export interface AdminRecentCommentsBlock extends BaseBlock<'admin-recent-comments'> {}

/** 所有 Block 类型的联合类型，前端的核心工作单元 */
export type Block =
  | PageBlock
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | CalloutBlock
  | BulletListItemBlock
  | NumberedListItemBlock
  | CheckListItemBlock
  | ImageBlock
  | VideoBlock
  | FileBlock
  | CodeBlock
  | DividerBlock
  | TableBlock
  | AdminStatCardBlock
  | AdminTrafficChartBlock
  | AdminRecentCommentsBlock;

/** `Block` 的语义别名，表示"一条 Block 数据" */
export type BlockData = Block;

// ─────────────────────────────────────────────
// 七、DbBlock —— 与后端 API 原始响应完全对应
// ─────────────────────────────────────────────

/**
 * 后端 `/api/blocks` 接口返回的原始数据结构，
 * 与 PostgreSQL blocks 表字段一一对应（snake_case）。
 *
 * 使用场景：
 *  - API 层（axios）的响应/请求类型声明
 *  - `dehydrate(Block): DbBlock` 的返回类型（序列化发往后端）
 *
 * properties 字段约定示例：
 * ```json
 * {
 *   "title": "My Page",          // PageBlock 专有
 *   "level": 1,                  // HeadingBlock 专有
 *   "language": "typescript",    // CodeBlock 专有
 *   "checked": false,            // CheckListItem 专有
 *   "variant": "warning",        // CalloutBlock 专有
 *   "content": [                 // 所有文本块共有
 *     { "type": "text", "text": "Hello", "styles": { "bold": true } }
 *   ]
 * }
 * ```
 */
export interface DbBlock {
  id: string; /** 唯一标识，UUID，由前端生成（支持离线编辑） */
  parent_id: string | null; /** 父块 ID，null 表示根块 */
  path: string; /** 物化路径，格式：'/root-uuid/parent-uuid/this-uuid/' */
  type: BlockType; /** 块类型: 'page', 'h1', 'paragraph', 'code_block' 等 */
  content_ids: string[]; /** 子块有序 ID 数组，拖拽排序时只需更新父节点的此字段 */
  properties: Record<string, unknown>;   /** 存储所有动态属性（props + content）的 JSONB 字段 */
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─────────────────────────────────────────────
// 八、API 通信类型
// ─────────────────────────────────────────────

/**
 * 增量更新的 DbBlock 类型。
 * `Partial<DbBlock>` 使所有字段可选（增量更新只发变动字段），
 * `& { id: string }` 通过交叉类型确保 `id` 始终必填——
 * 后端没有 id 就无法定位要更新哪一条记录。
 */
export type BlockUpdateDelta = Partial<DbBlock> & { id: string };

/**
 * POST /api/blocks/sync 请求体。
 * 对应核心技术文档中的"本地优先 + 防抖 + 批量同步"方案：
 *  1. 编辑时修改前端 Zustand 状态（0 延迟）
 *  2. 防抖 1.5s 后收集所有变动，打包成此结构发送给后端
 */
export interface BlockSyncPayload {
  /** 新增或修改的 Block，id 必填，其他字段为增量（仅发送变动部分） */
  updated_blocks: BlockUpdateDelta[];
  /** 软删除的 Block ID 列表（后端将 deleted_at 设为当前时间） */
  deleted_blocks: string[];
}
