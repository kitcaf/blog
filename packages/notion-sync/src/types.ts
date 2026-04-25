/**
 * Notion 同步包的核心类型定义。
 *
 * 只描述同步链路实际读取和生成的字段，避免把完整 Notion API 类型搬进项目导致模型过重。
 */
export interface SyncPropertyNames {
  title: string
  status: string
  publishedStatus: string
  category: string
  tags: string
  publishedAt: string
  slug: string
  description: string
}

export interface SyncConfig {
  rootDir: string
  notionToken: string
  notionDatabaseId: string
  notionVersion: string
  outputPath: string
  siteName: string
  author: string
  displayTimeZone: string
  allowEmptySync: boolean
  descriptionMaxLength: number
  properties: SyncPropertyNames
}

export interface NotionDatabase {
  data_sources?: Array<{
    id: string
    name?: string
  }>
}

export interface NotionDataSource {
  id: string
  name?: string
  properties?: Record<string, NotionPropertySchema>
}

export interface NotionPropertySchema {
  type: string
}

export interface NotionRichTextAnnotations {
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  underline?: boolean
  code?: boolean
}

export interface NotionRichTextSegment {
  plain_text?: string
  href?: string | null
  text?: {
    link?: {
      url: string
    } | null
  }
  annotations?: NotionRichTextAnnotations
}

export type NotionRichText = NotionRichTextSegment[]

export interface NotionFormula {
  type?: string
  string?: string | null
  number?: number | null
  boolean?: boolean | null
  date?: {
    start?: string | null
  } | null
}

export interface NotionProperty {
  type: string
  title?: NotionRichText
  rich_text?: NotionRichText
  select?: { name?: string | null } | null
  status?: { name?: string | null } | null
  multi_select?: Array<{ name: string }>
  date?: { start?: string | null } | null
  url?: string | null
  email?: string | null
  phone_number?: string | null
  formula?: NotionFormula
  created_time?: string
  last_edited_time?: string
  checkbox?: boolean
}

export interface NotionPage {
  id: string
  properties?: Record<string, NotionProperty>
  created_time: string
  last_edited_time: string
  cover?: {
    type?: string
    external?: {
      url: string
    }
  } | null
}

export interface NotionRichTextBlockPayload {
  rich_text?: NotionRichText
}

export interface NotionCodeBlockPayload {
  rich_text?: NotionRichText
  language?: string
}

export interface NotionImageBlockPayload {
  type?: string
  external?: {
    url: string
  }
  caption?: NotionRichText
}

export interface NotionBlock {
  id: string
  type: string
  has_children?: boolean
  paragraph?: NotionRichTextBlockPayload
  heading_1?: NotionRichTextBlockPayload
  heading_2?: NotionRichTextBlockPayload
  heading_3?: NotionRichTextBlockPayload
  quote?: NotionRichTextBlockPayload
  bulleted_list_item?: NotionRichTextBlockPayload
  numbered_list_item?: NotionRichTextBlockPayload
  code?: NotionCodeBlockPayload
  image?: NotionImageBlockPayload
  [blockType: string]: unknown
}

export interface NotionFilter {
  property: string
  [condition: string]: unknown
}

export interface NotionClient {
  retrieveDatabase(databaseId: string): Promise<NotionDatabase>
  retrieveDataSource(dataSourceId: string): Promise<NotionDataSource>
  queryDataSource(input: {
    dataSourceId: string
    filter: NotionFilter
    filterProperties: string[]
  }): Promise<NotionPage[]>
  listBlockChildren(blockId: string): Promise<NotionBlock[]>
}

export interface RenderedBlock {
  html: string
  plainText: string
}

export interface RenderWarning {
  blockId: string
  blockType: string
  message: string
}

export interface RenderedContent extends RenderedBlock {
  warnings: RenderWarning[]
}

export interface ArticleDetail {
  sourceId: string
  slug: string
  title: string
  date: string
  publishedAt: string
  description: string
  tags: string[]
  category: string
  author: string
  cover?: string
  seoTitle?: string
  seoDescription?: string
  content: string
  readingTime?: number
  updatedAt?: string
}
