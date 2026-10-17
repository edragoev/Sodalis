// FCM only accepts an absolute HTTPS URL for a notification's click link, so push code needs the
// app's public origin. Both helpers return null rather than a URL FCM would reject.

type Env = Record<string, string | undefined>

function httpsOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

/**
 * The app's public origin: NEXT_PUBLIC_APP_URL if set, otherwise the Vercel production domain.
 * An explicit but invalid setting is not replaced by the fallback, so a typo gets noticed.
 */
export function getAppUrl(env: Env): string | null {
  const explicit = env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return httpsOrigin(explicit)

  // Vercel gives the domain without a scheme.
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  return vercel ? httpsOrigin(`https://${vercel}`) : null
}

/** An absolute HTTPS URL for `path` on the app, or null when `appUrl` is missing or unusable. */
export function absoluteUrl(appUrl: string | null | undefined, path: string): string | null {
  const origin = appUrl ? httpsOrigin(appUrl) : null
  return origin ? new URL(path, origin).href : null
}
