import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Admin access (AUDIT.md Phase 7).
 *
 * One shared password, deliberately. The shop is one or two people, there are no
 * roles to distinguish and no per-user audit requirement beyond `actor: 'admin'`
 * on the order events — so a users table would be machinery with nothing to hold.
 * Whenever a second person needs their own login, this module is the only place
 * that changes: everything above it asks `requireAdmin()` and gets a session.
 *
 * ## Configuration
 *
 * | Variable                | What it is                                          |
 * | ----------------------- | --------------------------------------------------- |
 * | `ADMIN_PASSWORD`        | The password. No default — unset means no admin.     |
 * | `ADMIN_SESSION_SECRET`  | Optional HMAC key for the session cookie. Defaults  |
 * |                         | to the password, so one variable is enough.          |
 *
 * ## What the cookie is
 *
 * `<expiry>.<hmac(expiry)>` — a signed expiry and nothing else. There is no
 * session store, so there is nothing to read from the database on each request,
 * and the cookie cannot be edited to extend itself without the secret. It is
 * `HttpOnly`, `SameSite=Lax` and `Secure` outside development, so it is not
 * readable from JavaScript and not sent from another site's form post.
 *
 * Changing `ADMIN_PASSWORD` invalidates every existing session, because the
 * password is the default signing key. That is the intended behaviour: the way you
 * log everyone out is to change the password.
 */

const COOKIE_NAME = 'admin_session'

/** How long a login lasts. Long enough for a working day, not a month. */
const SESSION_MS = 12 * 60 * 60 * 1000

/** Where an unauthenticated request is sent. */
export const ADMIN_LOGIN_PATH = '/admin/login'

/** True once a password is configured and the admin can be used at all. */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD)
}

function signingKey(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || ''
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url')
}

/**
 * Constant-time string comparison.
 *
 * `timingSafeEqual` throws on unequal lengths, which would itself leak the length,
 * so both sides are hashed to a fixed 32 bytes first. Used for the password and
 * for the cookie signature alike.
 */
function equals(a: string, b: string): boolean {
  const digest = (value: string) => createHmac('sha256', 'compare').update(value).digest()
  return timingSafeEqual(digest(a), digest(b))
}

/** True when `entered` is the configured admin password. */
export function isCorrectPassword(entered: string): boolean {
  const expected = process.env.ADMIN_PASSWORD

  // No password configured is not "any password works". It is "no admin".
  if (!expected) return false

  return equals(entered, expected)
}

/** A fresh signed session value, valid for `SESSION_MS`. */
export function newSessionValue(now = Date.now()): string {
  const expiresAt = String(now + SESSION_MS)
  // A nonce so two logins in the same millisecond do not produce the same cookie.
  const payload = `${expiresAt}.${randomBytes(8).toString('base64url')}`
  return `${payload}.${sign(payload)}`
}

/** True when the cookie value is intact and has not expired. */
export function isValidSessionValue(value: string | undefined, now = Date.now()): boolean {
  if (!value || !signingKey()) return false

  const parts = value.split('.')
  if (parts.length !== 3) return false

  const [expiresAt, nonce, signature] = parts

  if (!equals(signature, sign(`${expiresAt}.${nonce}`))) return false

  const expiry = Number(expiresAt)
  return Number.isSafeInteger(expiry) && expiry > now
}

/** Write the session cookie. Called from the login action. */
export async function startAdminSession(): Promise<void> {
  const store = await cookies()

  store.set(COOKIE_NAME, newSessionValue(), {
    httpOnly: true,
    sameSite: 'lax',
    // Off in development, where the dev server is plain HTTP and a Secure cookie
    // would simply never be stored.
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: SESSION_MS / 1000,
  })
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies()
  store.delete({ name: COOKIE_NAME, path: '/admin' })
}

/** True when the current request carries a valid session. */
export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies()
  return isValidSessionValue(store.get(COOKIE_NAME)?.value)
}

/**
 * The gate. Every admin page and every admin action calls this first.
 *
 * Redirects rather than returning a boolean, so forgetting to check is not
 * possible in a caller that uses the result — and so an expired session lands on
 * the login form instead of a stack trace. Called in the page *and* in the action:
 * a Server Action is its own POST endpoint, and a page-level check does not guard
 * it (see the Server Actions note in `checkout/actions.ts`).
 */
export async function requireAdmin(): Promise<void> {
  if (!(await hasAdminSession())) redirect(ADMIN_LOGIN_PATH)
}

/** The cookie name, exported for the tests and nothing else. */
export const __cookieName = COOKIE_NAME
