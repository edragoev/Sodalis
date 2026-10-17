import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

// Server only: uses the service-account credentials, which must never reach the browser.

function requireEnv(name: string): string {
  const value = process.env[name]
  // Name the variable only; never echo any value, since two of them are credentials.
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

/** Firebase Cloud Messaging for the server. The app is created once and reused. */
export function getAdminMessaging() {
  if (getApps().length === 0) {
    const projectId = requireEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
    const clientEmail = requireEnv('FIREBASE_CLIENT_EMAIL')
    // Hosts store the key with literal "\n"; the SDK needs real newlines.
    const privateKey = requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  }
  return getMessaging()
}
