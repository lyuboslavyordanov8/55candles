import { z } from 'zod'

/**
 * Server-side environment, validated once at module load.
 *
 * The point is to fail loudly and early. Every other secret in this codebase
 * is optional by design — no email key makes the contact form say so, no courier
 * credentials fall back to a free-text office field — because a feature that
 * is visibly absent beats one that fails after the customer has committed.
 *
 * The database is different. Once checkout persists orders, a missing or
 * malformed DATABASE_URL is not a degraded feature, it is lost orders. So it
 * is validated, and `requireDatabaseUrl()` throws rather than returning
 * undefined for a caller to ignore.
 *
 * Never import this from a Client Component: it would pull the schema, and
 * anything read from it, into the browser bundle.
 */

const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: 'must be a postgres:// or postgresql:// connection string',
  })

const schema = z.object({
  /**
   * Pooled connection. Serverless functions open a connection per invocation
   * and will exhaust a direct Postgres connection limit under any real
   * traffic, so application queries must go through the pooler — on Neon, the
   * host containing `-pooler`.
   */
  DATABASE_URL: postgresUrl.optional(),

  /**
   * Direct connection, used only by drizzle-kit for migrations. DDL and the
   * advisory locks migrations rely on do not behave predictably through a
   * transaction-mode pooler.
   */
  DATABASE_URL_UNPOOLED: postgresUrl.optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // Print every problem at once rather than one per restart.
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid environment variables:\n${issues}`)
}

export const env = parsed.data

/** True once a database is configured. Lets callers degrade deliberately. */
export const isDatabaseConfigured = Boolean(env.DATABASE_URL)

/**
 * The pooled URL, or a thrown error naming the fix.
 *
 * Callers that can meaningfully degrade should check `isDatabaseConfigured`
 * instead. This exists for the paths where continuing without a database
 * would mean silently discarding an order.
 */
export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and add the ' +
        'pooled Neon connection string, or set it in the hosting environment.'
    )
  }
  return env.DATABASE_URL
}

/** Migration connection: the direct URL, falling back to the pooled one. */
export function migrationDatabaseUrl(): string {
  return env.DATABASE_URL_UNPOOLED ?? requireDatabaseUrl()
}
