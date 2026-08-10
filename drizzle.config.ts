import type { Config } from 'drizzle-kit'

/**
 * Migrations run over the DIRECT connection, not the pooler.
 *
 * DDL and the advisory locks migrations depend on do not behave predictably
 * through a transaction-mode pooler, so this reads DATABASE_URL_UNPOOLED and
 * only falls back to DATABASE_URL when no direct URL is configured.
 *
 * Reads process.env directly rather than importing src/lib/env.ts: drizzle-kit
 * runs outside Next, so it needs .env.local loaded explicitly.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!url) {
  throw new Error(
    'Set DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL before running drizzle-kit. ' +
      'See .env.example.'
  )
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  // Keep generated SQL reviewable in pull requests.
  verbose: true,
  strict: true,
} satisfies Config
