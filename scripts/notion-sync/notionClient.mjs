const NOTION_API_BASE_URL = 'https://api.notion.com/v1'
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 500

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))

export class NotionRequestError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'NotionRequestError'
    this.status = details.status
    this.code = details.code
    this.body = details.body
  }
}

const safeJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

const buildNotionHeaders = (config) => ({
  Authorization: `Bearer ${config.notionToken}`,
  'Content-Type': 'application/json',
  'Notion-Version': config.notionVersion
})

const getRetryDelay = (response, attemptIndex) => {
  const retryAfter = response.headers.get('retry-after')

  if (retryAfter) {
    const retryAfterSeconds = Number.parseFloat(retryAfter)

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000
    }
  }

  return BASE_RETRY_DELAY_MS * 2 ** attemptIndex
}

const shouldRetry = (status) => {
  return status === 429 || status === 503 || status === 504
}

const formatErrorMessage = (method, endpoint, status, payload) => {
  const notionCode = payload?.code ? ` ${payload.code}` : ''
  const notionMessage = payload?.message ? `: ${payload.message}` : ''
  return `Notion ${method} ${endpoint} failed with ${status}${notionCode}${notionMessage}`
}

export const createNotionClient = (config) => {
  const request = async (method, endpoint, body) => {
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
          throw new Error(`Unable to reach Notion ${method} ${endpoint}: ${error.message}`)
        }

        await wait(BASE_RETRY_DELAY_MS * 2 ** attemptIndex)
        continue
      }

      if (response.ok) {
        if (response.status === 204) {
          return undefined
        }

        return safeJson(response)
      }

      const payload = await safeJson(response)

      if (shouldRetry(response.status) && attemptIndex < DEFAULT_MAX_RETRIES) {
        await wait(getRetryDelay(response, attemptIndex))
        continue
      }

      throw new NotionRequestError(
        formatErrorMessage(method, endpoint, response.status, payload),
        {
          status: response.status,
          code: payload?.code,
          body: payload
        }
      )
    }

    throw new Error(`Notion ${method} ${endpoint} exhausted retry attempts.`)
  }

  const getPaginatedResults = async (endpointBuilder, bodyBuilder) => {
    const results = []
    let startCursor

    do {
      const response = await request('POST', endpointBuilder(), {
        ...bodyBuilder(startCursor),
        page_size: DEFAULT_PAGE_SIZE
      })

      results.push(...(response.results ?? []))
      startCursor = response.has_more ? response.next_cursor : undefined
    } while (startCursor)

    return results
  }

  const getPaginatedChildren = async (blockId) => {
    const results = []
    let startCursor

    do {
      const params = new URLSearchParams({ page_size: String(DEFAULT_PAGE_SIZE) })

      if (startCursor) {
        params.set('start_cursor', startCursor)
      }

      const response = await request('GET', `/blocks/${blockId}/children?${params.toString()}`)
      results.push(...(response.results ?? []))
      startCursor = response.has_more ? response.next_cursor : undefined
    } while (startCursor)

    return results
  }

  return {
    retrieveDatabase(databaseId) {
      return request('GET', `/databases/${databaseId}`)
    },
    retrieveDataSource(dataSourceId) {
      return request('GET', `/data_sources/${dataSourceId}`)
    },
    queryDataSource({ dataSourceId, filter, filterProperties }) {
      const endpoint = () => {
        const params = new URLSearchParams()

        for (const propertyName of filterProperties) {
          params.append('filter_properties[]', propertyName)
        }

        const query = params.toString()
        return `/data_sources/${dataSourceId}/query${query ? `?${query}` : ''}`
      }

      return getPaginatedResults(endpoint, (startCursor) => ({
        filter,
        result_type: 'page',
        start_cursor: startCursor
      }))
    },
    listBlockChildren(blockId) {
      return getPaginatedChildren(blockId)
    }
  }
}
