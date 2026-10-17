export type FirebaseConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string // only needed for Analytics
}

export type FirebaseVapidConfig = {
  vapidKey?: string
}

/**
 * Firebase web config, read from NEXT_PUBLIC_FIREBASE_* variables (see .env.example).
 *
 * Each variable is read as a literal `process.env.NEXT_PUBLIC_…`: Next.js only inlines
 * public variables into browser code when the name is written out in full.
 */
export function getFirebaseConfig(): FirebaseConfig {
  const values = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
  const names: Record<keyof typeof values, string> = {
    apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
    authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
  }
  // authDomain and storageBucket are not needed for push, so they may be blank.
  const optional = new Set<keyof typeof values>(['authDomain', 'storageBucket'])

  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    if (!optional.has(key) && !values[key]?.trim()) {
      throw new Error(`Missing ${names[key]}. Add it to .env.local (see .env.example).`)
    }
  }

  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || undefined
  return { ...(values as Omit<FirebaseConfig, 'measurementId'>), measurementId }
}

export function getFirebaseVapidKey(): string | undefined {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() || undefined
}

/**
 * True when browser push can work here: the Firebase web config is complete and there is a web
 * push key. The app uses this to hide the notifications button instead of failing when Firebase
 * has not been set up (for example a fresh checkout without these variables).
 */
export function isPushConfigured(): boolean {
  try {
    getFirebaseConfig()
  } catch {
    return false
  }
  return !!getFirebaseVapidKey()
}
