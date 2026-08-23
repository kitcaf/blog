import assert from 'node:assert/strict'
import { INGEST_CONFIG, NOTION_CONFIG, type WorkerEnv } from '../src/config.js'
import { handleRequest } from '../src/index.js'
import { validateArticlePayload } from '../src/schema.js'

const articleMarkdown = '\n# Talking About My Weekend\n\n```text\nKeep this whitespace unchanged.\n```\n'

const validPayload = {
  type: 'article',
  title: 'Talking About My Weekend',
  category: 'English Learning',
  tags: ['English', 'Speaking'],
  content: articleMarkdown
}

const env: WorkerEnv = {
  INGEST_TOKEN: 'test-ingest-token',
  NOTION_TOKEN: 'test-notion-token',
  NOTION_DATA_SOURCE_ID: 'test-data-source-id'
}

const createRequest = (token = env.INGEST_TOKEN, body: unknown = validPayload): Request => {
  return new Request(`https://worker.test${INGEST_CONFIG.path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [INGEST_CONFIG.tokenHeader]: token
    },
    body: JSON.stringify(body)
  })
}

const getProperty = (requestBody: Record<string, unknown>, propertyName: string): Record<string, unknown> => {
  const properties = requestBody.properties as Record<string, Record<string, unknown>>
  return properties[propertyName]
}

const run = async (): Promise<void> => {
  const validationResult = validateArticlePayload(validPayload)
  assert.equal(validationResult.success, true)

  if (!validationResult.success) {
    throw new Error('Expected valid article payload.')
  }

  assert.equal(validationResult.payload.content, articleMarkdown)

  const invalidResult = validateArticlePayload({
    ...validPayload,
    content: '   ',
    tags: ['English', 42]
  })
  assert.equal(invalidResult.success, false)

  let notionRequestBody: Record<string, unknown> | undefined
  const notionTransport = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    notionRequestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return Response.json({
      id: 'notion-page-id',
      url: 'https://www.notion.so/notion-page-id'
    })
  }

  const successResponse = await handleRequest(createRequest(), env, notionTransport)
  assert.equal(successResponse.status, 201)
  assert.deepEqual(await successResponse.json(), {
    success: true,
    pageId: 'notion-page-id',
    url: 'https://www.notion.so/notion-page-id'
  })

  assert.ok(notionRequestBody)
  assert.equal(notionRequestBody.markdown, articleMarkdown)
  assert.deepEqual(notionRequestBody.parent, {
    type: 'data_source_id',
    data_source_id: env.NOTION_DATA_SOURCE_ID
  })
  assert.deepEqual(getProperty(notionRequestBody, NOTION_CONFIG.properties.category), {
    type: 'select',
    select: { name: validPayload.category }
  })
  assert.deepEqual(getProperty(notionRequestBody, NOTION_CONFIG.properties.status), {
    type: 'select',
    select: { name: NOTION_CONFIG.values.status }
  })
  assert.deepEqual(getProperty(notionRequestBody, NOTION_CONFIG.properties.tags), {
    type: 'multi_select',
    multi_select: validPayload.tags.map((name) => ({ name }))
  })
  const unauthorizedResponse = await handleRequest(createRequest('wrong-token'), env, notionTransport)
  assert.equal(unauthorizedResponse.status, 401)

  console.log('ingest tests passed')
}

await run()
