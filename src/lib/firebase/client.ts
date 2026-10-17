import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirebaseConfig } from './config'

/** The Firebase app, created once (safe to call from any client component). */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig())
}

/**
 * Google Analytics, or null when it can't run: on the server, without a measurement id,
 * or in a browser that blocks it. Browser only, so it is imported lazily.
 */
export async function getFirebaseAnalytics() {
  if (typeof window === 'undefined' || !getFirebaseConfig().measurementId) return null
  const { getAnalytics, isSupported } = await import('firebase/analytics')
  return (await isSupported()) ? getAnalytics(getFirebaseApp()) : null
}
