/**
 * Notion API 轻量客户端。
 *
 * 统一处理请求头、分页、限流重试和错误信息，让同步流程只关心“拿到哪些 Notion 数据”。
 */
import type {
  NotionBlock,
  NotionClient,
  NotionDataSource,
  NotionDatabase,
  NotionFilter,
  NotionPage,
  SyncConfig
} from './types.js'

const NOTION_API_BASE_URL = 'https://api.notion.com/v1'
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 500

interface NotionErrorBody {
  code?: string
  message?: string
}

interface NotionRequestErrorDetails {
  status: number
  code?: string
  body?: unknown
}

interface NotionPaginatedResponse<T> {
  results?: T[]
  has_more?: boolean
  next_cursor?: string | null
}

type NotionMethod = 'GET' | 'POST'

const wait = (durationMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, durationMs))

export class NotionRequestError extends Error {
  status: number
  code?: string
  body?: unknown

  constructor(message: string, details: NotionRequestErrorDetails) {
    super(message)
    this.name = 'NotionRequestError'
    this.status = details.status
    this.code = details.code
    this.body = details.body
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const getStringField = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const fieldValue = value[key]
  return typeof fieldValue === 'string' ? fieldValue : undefined
}

const toNotionErrorBody = (payload: unknown): NotionErrorBody => ({
  code: getStringField(payload, 'code'),
  message: getStringField(payload, 'message')
})

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

const safeJson = async (response: Response): Promise<unknown | undefined> => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

const buildNotionHeaders = (config: SyncConfig): Record<string, string> => ({
  Authorization: `Bearer ${config.notionToken}`,
  'Content-Type': 'application/json',
  'Notion-Version': config.notionVersion
})

const getRetryDelay = (response: Response, attemptIndex: number): number => {
  const retryAfter = response.headers.get('retry-after')

  if (retryAfter) {
    const retryAfterSeconds = Number.parseFloat(retryAfter)

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000
    }
  }

  return BASE_RETRY_DELAY_MS * 2 ** attemptIndex
}

const shouldRetry = (status: number): boolean => {
  return status === 429 || status === 503 || status === 504
}

const formatErrorMessage = (method: NotionMethod, endpoint: string, status: number, payload: unknown): string => {
  const notionErrorBody = toNotionErrorBody(payload)
  const notionCode = notionErrorBody.code ? ` ${notionErrorBody.code}` : ''
  const notionMessage = notionErrorBody.message ? `: ${notionErrorBody.message}` : ''
  return `Notion ${method} ${endpoint} failed with ${status}${notionCode}${notionMessage}`
}

export const createNotionClient = (config: SyncConfig): NotionClient => {
  const request = async <T>(method: NotionMethod, endpoint: string, body?: unknown): Promise<T> => {
    const url = `${NOTION_API_BASE_URL}${endpoint}`

    for (let attemptIndex = 0; attemptIndex <= DEFAULT_MAX_RETRIES; attemptIndex += 1) {
      let response

      try {
        response = await fetch(url, {
          method,
          headers: buildNotionHeaders(config),
          body: body === undefined ? undefined : JSON.stringify(body)
        })
      } catch (error) {
        if (attemptIndex === DEFAULT_MAX_RETRIES) {
          throw new Error(`Unable to reach Notion ${method} ${endpoint}: ${getErrorMessage(error)}`)
        }

        await wait(BASE_RETRY_DELAY_MS * 2 ** attemptIndex)
        continue
      }

      if (response.ok) {
        if (response.status === 204) {
          return undefined as T
        }

        return await safeJson(response) as T
      }

      const payload = await safeJson(response)
      const notionErrorBody = toNotionErrorBody(payload)

      if (shouldRetry(response.status) && attemptIndex < DEFAULT_MAX_RETRIES) {
        await wait(getRetryDelay(response, attemptIndex))
        continue
      }

      throw new NotionRequestError(
        formatErrorMessage(method, endpoint, response.status, payload),
        {
          status: response.status,
          code: notionErrorBody.code,
          body: payload
        }
      )
    }

    throw new Error(`Notion ${method} ${endpoint} exhausted retry attempts.`)
  }

  const getPaginatedResults = async <T>(
    endpointBuilder: () => string,
    bodyBuilder: (startCursor: string | undefined) => Record<string, unknown>
  ): Promise<T[]> => {
    const results: T[] = []
    let startCursor: string | undefined

    do {
      const response = await request<NotionPaginatedResponse<T>>('POST', endpointBuilder(), {
        ...bodyBuilder(startCursor),
        page_size: DEFAULT_PAGE_SIZE
      })

      results.push(...(response.results ?? []))
      startCursor = response.has_more ? response.next_cursor ?? undefined : undefined
    } while (startCursor)

    return results
  }

  const getPaginatedChildren = async (blockId: string): Promise<NotionBlock[]> => {
    const results: NotionBlock[] = []
    let startCursor: string | undefined

    do {
      const params = new URLSearchParams({ page_size: String(DEFAULT_PAGE_SIZE) })

      if (startCursor) {
        params.set('start_cursor', startCursor)
      }

      const response = await request<NotionPaginatedResponse<NotionBlock>>(
        'GET',
        `/blocks/${blockId}/children?${params.toString()}`
      )
      results.push(...(response.results ?? []))
      startCursor = response.has_more ? response.next_cursor ?? undefined : undefined
    } while (startCursor)

    return results
  }

  return {
    retrieveDatabase(databaseId: string) {
      return request<NotionDatabase>('GET', `/databases/${databaseId}`)
    },
    retrieveDataSource(dataSourceId: string) {
      return request<NotionDataSource>('GET', `/data_sources/${dataSourceId}`)
    },
    queryDataSource({
      dataSourceId,
      filter,
      filterProperties
    }: {
      dataSourceId: string
      filter: NotionFilter
      filterProperties: string[]
    }) {
      const endpoint = () => {
        const params = new URLSearchParams()

        for (const propertyName of filterProperties) {
          params.append('filter_properties[]', propertyName)
        }

        const query = params.toString()
        return `/data_sources/${dataSourceId}/query${query ? `?${query}` : ''}`
      }

      return getPaginatedResults<NotionPage>(endpoint, (startCursor) => ({
        filter,
        result_type: 'page',
        start_cursor: startCursor
      }))
    },
    listBlockChildren(blockId: string) {
      return getPaginatedChildren(blockId)
    }
  }
}
