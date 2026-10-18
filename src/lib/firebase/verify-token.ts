import { buildTestPush, type TokenMessaging } from './test-push'
import { isDeadTokenError } from './dead-token'

/**
 * Asks FCM to validate a stored token with a dry run, which delivers nothing to the device.
 * Returns 'dead' when Firebase says the token will never work again. Any other failure is
 * rethrown: it is transient, and says nothing about the token.
 */
export async function checkToken(messaging: TokenMessaging, token: string): Promise<'valid' | 'dead'> {
  try {
    await messaging.send(buildTestPush(token), true)
    return 'valid'
  } catch (err) {
    if (isDeadTokenError(err)) return 'dead'
    throw err
  }
}
