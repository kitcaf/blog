import { INGEST_CONFIG, type WorkerEnv } from './config.js'
import { createNotionPage, type NotionTransport } from './notion.js'
import { validateArticlePayload } from './schema.js'

interface ErrorResponseBody {
  success: false
  error: string
  details?: string[]
}

const jsonResponse = (body: unknown, status: number, headers?: HeadersInit): Response => {
  return Response.json(body, {
    status,
    headers
  })
}

const errorResponse = (
  status: number,
  error: string,
  details?: string[],
  headers?: HeadersInit
): Response => {
  const body: ErrorResponseBody = {
    success: false,
    error,
    ...(details ? { details } : {})
  }

  return jsonResponse(body, status, headers)
}

const parseRequestJson = async (request: Request): Promise<unknown> => {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)

  if (declaredLength > INGEST_CONFIG.maxBodyBytes) {
    throw new RangeError('Request body is too large.')
  }

  const rawBody = await request.text()

  if (new TextEncoder().encode(rawBody).byteLength > INGEST_CONFIG.maxBodyBytes) {
    throw new RangeError('Request body is too large.')
  }

  return JSON.parse(rawBody) as unknown
}

export const handleRequest = async (
  request: Request,
  env: WorkerEnv,
  notionTransport: NotionTransport = fetch
): Promise<Response> => {
  const url = new URL(request.url)

  if (url.pathname !== INGEST_CONFIG.path) {
    return errorResponse(404, 'Not found.')
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'Method not allowed.', undefined, { Allow: 'POST' })
  }

  if (request.headers.get(INGEST_CONFIG.tokenHeader) !== env.INGEST_TOKEN) {
    return errorResponse(401, 'Unauthorized.')
  }

  const contentType = request.headers.get('content-type') ?? ''

  if (!contentType.toLowerCase().startsWith('application/json')) {
    return errorResponse(415, 'Content-Type must be application/json.')
  }

  let requestBody: unknown

  try {
    requestBody = await parseRequestJson(request)
  } catch (error) {
    if (error instanceof RangeError) {
      return errorResponse(413, error.message)
    }

    return errorResponse(400, 'Request body must contain valid JSON.')
  }

  const validationResult = validateArticlePayload(requestBody)

  if (!validationResult.success) {
    return errorResponse(400, 'Invalid ingest payload.', validationResult.errors)
  }

  const publishedAt = new Date().toISOString()

  try {
    const page = await createNotionPage({
      env,
      payload: validationResult.payload,
      markdown: validationResult.payload.content,
      publishedAt,
      transport: notionTransport
    })

    return jsonResponse({
      success: true,
      pageId: page.id,
      url: page.url
    }, 201)
  } catch (error) {
    console.error('Failed to create article in Notion.', error)
    return errorResponse(502, 'Failed to create Notion page.')
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env)
  }
} satisfies ExportedHandler<WorkerEnv>
