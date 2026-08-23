export interface WorkerEnv {
  INGEST_TOKEN: string
  NOTION_TOKEN: string
  NOTION_DATA_SOURCE_ID: string
}

export const INGEST_CONFIG = {
  path: '/v1/ingest',
  tokenHeader: 'X-Kitcaf-Token',
  maxBodyBytes: 50 * 1024,
  payloadType: 'article',
  limits: {
    title: 200,
    category: 100,
    tag: 100,
    tagCount: 20
  }
} as const

export const NOTION_CONFIG = {
  apiBaseUrl: 'https://api.notion.com/v1',
  apiVersion: '2026-03-11',
  properties: {
    title: 'Title',
    status: 'Status',
    category: 'Category',
    tags: 'Tag',
    publishedAt: '日期'
  },
  values: {
    status: 'Published'
  }
} as const
