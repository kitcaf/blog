import { NOTION_CONFIG, type WorkerEnv } from './config.js'
import type { ArticlePayload } from './schema.js'

export type NotionTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface CreatedNotionPage {
  id: string
  url: string
}

interface NotionPageResponse {
  id?: string
  url?: string
  code?: string
  message?: string
}

const createText = (content: string) => [{
  type: 'text',
  text: { content }
}]

const buildNotionProperties = (payload: ArticlePayload, publishedAt: string): Record<string, unknown> => ({
  [NOTION_CONFIG.properties.title]: {
    type: 'title',
    title: createText(payload.title)
  },
  [NOTION_CONFIG.properties.status]: {
    type: 'select',
    select: { name: NOTION_CONFIG.values.status }
  },
  [NOTION_CONFIG.properties.category]: {
    type: 'select',
    select: { name: payload.category }
  },
  [NOTION_CONFIG.properties.tags]: {
    type: 'multi_select',
    multi_select: payload.tags.map((name) => ({ name }))
  },
  [NOTION_CONFIG.properties.publishedAt]: {
    type: 'date',
    date: { start: publishedAt }
  }
})

const parseNotionResponse = async (response: Response): Promise<NotionPageResponse> => {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json')
    ? await response.json() as NotionPageResponse
    : {}
}

export const createNotionPage = async ({
  env,
  payload,
  markdown,
  publishedAt,
  transport = fetch
}: {
  env: WorkerEnv
  payload: ArticlePayload
  markdown: string
  publishedAt: string
  transport?: NotionTransport
}): Promise<CreatedNotionPage> => {
  const response = await transport(`${NOTION_CONFIG.apiBaseUrl}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_CONFIG.apiVersion
    },
    body: JSON.stringify({
      parent: {
        type: 'data_source_id',
        data_source_id: env.NOTION_DATA_SOURCE_ID
      },
      properties: buildNotionProperties(payload, publishedAt),
      markdown
    })
  })
  const responseBody = await parseNotionResponse(response)

  if (!response.ok) {
    const notionMessage = responseBody.message ? `: ${responseBody.message}` : ''
    throw new Error(`Notion create page failed with ${response.status}${notionMessage}`)
  }

  if (!responseBody.id || !responseBody.url) {
    throw new Error('Notion create page response is missing id or url.')
  }

  return {
    id: responseBody.id,
    url: responseBody.url
  }
}
