import 'server-only'

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import { isDatabaseConfigured, requireDatabaseUrl } from '@/lib/env'
import * as schema from './schema'

/**
 * Database handle.
 *
 * `server-only` at the top is deliberate: importing this from a Client
 * Component becomes a build error rather than a connection string in the
 * browser bundle.
 *
 * Uses the HTTP driver, which suits serverless — each query is a stateless
 * request, so there is no connection to leak when a function is frozen
 * mid-invocation. Multi-statement transactions need the WebSocket driver
 * instead; swap it here when order creation grows to need one, and keep the
 * decision in this file rather than at call sites.
 *
 * Lazy, because module-level evaluation would make every route that merely
 * imports a type fail when DATABASE_URL is absent.
 */
let cached: ReturnType<typeof create> | undefined

function create() {
  return drizzle(neon(requireDatabaseUrl()), { schema })
}

export function getDb() {
  cached ??= create()
  return cached
}

export { isDatabaseConfigured }
export * as schema from './schema'
