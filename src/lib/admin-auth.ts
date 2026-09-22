import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Admin access (AUDIT.md Phase 7).
 *
 * One shared password, deliberately. The shop is one or a few people and there
 * are no roles to distinguish — a users table would be machinery with nothing to
 * hold. What the order-management back office does need, and this module now
 * carries, is *attribution*: "who changed this order's status" and "who wrote
 * this note" have to name a person, not just say "admin", even though everyone
 * signs in with the same password. So the session records a self-declared name
 * alongside the expiry — nothing verifies it is truthful, the same way nothing
 * verifies which of the shop's few staff is at the keyboard today. That is a
 * label for the audit trail, not an identity, and it is not a permission system:
 * every session can still do everything every other session can.
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
 * `<expiry>.<nonce>.<name>.<hmac(expiry.nonce.name)>` — a signed expiry, a nonce
 * and a name, nothing else. There is no session store, so there is nothing to
 * read from the database on each request, and the cookie cannot be edited —
 * including the name — without the secret, because the signature covers the
 * whole payload. It is `HttpOnly`, `SameSite=Lax` and `Secure` outside
 * development, so it is not readable from JavaScript and not sent from another
 * site's form post.
 *
 * Changing `ADMIN_PASSWORD` invalidates every existing session, because the
 * password is the default signing key. That is the intended behaviour: the way you
 * log everyone out is to change the password.
 */

const COOKIE_NAME = 'admin_session'

/**
 * The only path the session cookie is sent to.
 *
 * Narrow on purpose: nothing outside the admin needs it, and a cookie that is
 * not sent cannot leak from a page that has no business holding it. Exported
 * because it is a constraint on *where admin endpoints may live* — one outside
 * this path receives no cookie and answers as if nobody were logged in.
 */
export const ADMIN_COOKIE_PATH = '/admin'

/** How long a login lasts. Long enough for a working day, not a month. */
const SESSION_MS = 12 * 60 * 60 * 1000

/** Where an unauthenticated request is sent. */
export const ADMIN_LOGIN_PATH = '/admin/login'

/** The attribution label when nobody typed one at login. */
export const DEFAULT_ADMIN_NAME = 'admin'

/** Longest name accepted. Long enough for a real name, short enough for a cookie. */
const NAME_MAX = 40

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

/**
 * A name as it goes into the cookie: base64url, so it cannot contain the `.`
 * the payload is delimited on, whatever script the staff member's name uses.
 */
function encodeName(name: string): string {
  return Buffer.from(name.trim().slice(0, NAME_MAX), 'utf8').toString('base64url')
}

/** The inverse. `''` (rather than throwing) for a value that will not decode. */
function decodeName(encoded: string): string {
  try {
    return Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return ''
  }
}

/**
 * A fresh signed session value, valid for `SESSION_MS`.
 *
 * `name` is whatever the staff member typed at login, for attribution on the
 * order events they go on to write — see the module docblock. Falls back to
 * `DEFAULT_ADMIN_NAME` rather than an empty label, since "" is not a name
 * anyone reading the history later could make sense of.
 */
export function newSessionValue(name: string, now = Date.now()): string {
  const expiresAt = String(now + SESSION_MS)
  // A nonce so two logins in the same millisecond do not produce the same cookie.
  const nonce = randomBytes(8).toString('base64url')
  const encodedName = encodeName(name || DEFAULT_ADMIN_NAME)
  const payload = `${expiresAt}.${nonce}.${encodedName}`
  return `${payload}.${sign(payload)}`
}

interface ParsedSession {
  name: string
  expiresAt: number
}

/**
 * Validate and decode in one pass, so the two operations can never disagree
 * about what counts as a valid cookie.
 */
function parseSession(value: string | undefined, now: number): ParsedSession | null {
  if (!value || !signingKey()) return null

  const parts = value.split('.')
  if (parts.length !== 4) return null

  const [expiresAt, nonce, encodedName, signature] = parts
  const payload = `${expiresAt}.${nonce}.${encodedName}`

  if (!equals(signature, sign(payload))) return null

  const expiry = Number(expiresAt)
  if (!Number.isSafeInteger(expiry) || expiry <= now) return null

  return { name: decodeName(encodedName) || DEFAULT_ADMIN_NAME, expiresAt: expiry }
}

/** True when the cookie value is intact and has not expired. */
export function isValidSessionValue(value: string | undefined, now = Date.now()): boolean {
  return parseSession(value, now) !== null
}

/** Write the session cookie. Called from the login action. */
export async function startAdminSession(name: string): Promise<void> {
  const store = await cookies()

  store.set(COOKIE_NAME, newSessionValue(name), {
    httpOnly: true,
    sameSite: 'lax',
    // Off in development, where the dev server is plain HTTP and a Secure cookie
    // would simply never be stored.
    secure: process.env.NODE_ENV === 'production',
    path: ADMIN_COOKIE_PATH,
    maxAge: SESSION_MS / 1000,
  })
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies()
  store.delete({ name: COOKIE_NAME, path: ADMIN_COOKIE_PATH })
}

/** True when the current request carries a valid session. */
export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies()
  return isValidSessionValue(store.get(COOKIE_NAME)?.value)
}

/**
 * The name recorded at login, or the default label when there is no valid
 * session. Never throws and never redirects — for places (the layout's
 * "signed in as" line) that want to *show* the name without gating on it.
 */
export async function currentAdminName(): Promise<string> {
  const store = await cookies()
  return parseSession(store.get(COOKIE_NAME)?.value, Date.now())?.name ?? DEFAULT_ADMIN_NAME
}

/**
 * The gate. Every admin page and every admin action calls this first.
 *
 * Redirects rather than returning a boolean, so forgetting to check is not
 * possible in a caller that uses the result — and so an expired session lands on
 * the login form instead of a stack trace. Called in the page *and* in the action:
 * a Server Action is its own POST endpoint, and a page-level check does not guard
 * it (see the Server Actions note in `checkout/actions.ts`).
 *
 * Returns the session's attribution name, so a caller that is about to write an
 * order event can name who did it without a second read of the cookie —
 * `const actor = await requireAdmin()`. Callers that only need the gate, not the
 * name, are free to ignore the return value.
 */
export async function requireAdmin(): Promise<string> {
  const store = await cookies()
  const session = parseSession(store.get(COOKIE_NAME)?.value, Date.now())

  if (!session) redirect(ADMIN_LOGIN_PATH)

  return session.name
}

/** The cookie name, exported for the tests and nothing else. */
export const __cookieName = COOKIE_NAME
