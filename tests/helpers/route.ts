type RouteHandler = (request: Request, context?: any) => Response | Promise<Response>

interface CallOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  /** Dynamic route params, for example { id: '...' } for /api/members/[id]/profile. */
  params?: Record<string, string>
  query?: Record<string, string>
}

/**
 * Calls a Next.js App Router handler (GET, POST, ...) directly with a standard
 * Request. No server needs to be running. Returns the status and parsed JSON.
 */
export async function callRoute(
  handler: RouteHandler,
  path: string,
  { method = 'POST', body, headers = {}, params, query }: CallOptions = {}
): Promise<{ status: number; json: any; response: Response }> {
  const url = new URL(path, 'http://localhost:3000')
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v)

  const request = new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  })
  // Next 15+ passes params as a Promise.
  const response = await handler(request, { params: Promise.resolve(params ?? {}) })
  const text = await response.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: response.status, json, response }
}
