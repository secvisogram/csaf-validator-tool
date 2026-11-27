import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'

export type MockRequest = {
  method: string
  path: string
  /** The parsed JSON body, or the raw text when it is not JSON. */
  body: unknown
}

export type MockResponse = {
  status?: number
  /** Sent as JSON unless it is a string. */
  body?: unknown
  headers?: Record<string, string>
}

export type MockHandler = (
  request: MockRequest,
) => MockResponse | Promise<MockResponse>

export type Mock = {
  /** The base URL without a trailing slash. */
  url: string
  requests: MockRequest[]
  close: () => Promise<void>
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return text === '' ? undefined : JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * A local stand-in for a validator service or a document host, on its own
 * origin so the browser applies real CORS rules to it. With `cors: false` it
 * sends no CORS headers at all.
 */
export async function startMock(
  handler: MockHandler,
  { cors = true }: { cors?: boolean } = {},
): Promise<Mock> {
  const requests: MockRequest[] = []
  const server = createServer(async (request, response) => {
    const corsHeaders: Record<string, string> = cors
      ? {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        }
      : {}
    if (request.method === 'OPTIONS') {
      response.writeHead(cors ? 204 : 403, corsHeaders)
      response.end()
      return
    }
    const seen: MockRequest = {
      method: request.method ?? 'GET',
      path: new URL(request.url ?? '/', 'http://x').pathname,
      body: await readBody(request),
    }
    requests.push(seen)
    const answer = await handler(seen)
    const isText = typeof answer.body === 'string'
    response.writeHead(answer.status ?? 200, {
      ...corsHeaders,
      'content-type': isText ? 'text/plain' : 'application/json',
      ...answer.headers,
    })
    response.end(
      answer.body === undefined
        ? undefined
        : isText
          ? (answer.body as string)
          : JSON.stringify(answer.body),
    )
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections()
        server.close(() => done())
      }),
  }
}
