const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** A 400 response with a JSON error message. */
export const bad = (error: string) => Response.json({ error }, { status: 400 })

/**
 * Reads a request body that must be a JSON object. Returns the object, or the 400
 * response to send back, so callers write: `if (body instanceof Response) return body`.
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return bad('Request body must be valid JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return bad('Request body must be a JSON object')
  return body as Record<string, unknown>
}
