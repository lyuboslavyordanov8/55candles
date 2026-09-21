import type { Config } from 'drizzle-kit'

/**
 * Migrations run over the DIRECT connection, not the pooler.
 *
 * DDL and the advisory locks migrations depend on do not behave predictably
 * through a transaction-mode pooler, so this reads DATABASE_URL_UNPOOLED and
 * only falls back to DATABASE_URL when no direct URL is configured.
 *
 * Reads process.env directly rather than importing src/lib/env.ts: drizzle-kit
 * runs outside Next, so it needs .env.local loaded explicitly — which is what the
 * call below does. Next loads that file for `dev` and `build`; nothing loads it
 * for drizzle-kit, so without this `npm run db:migrate` fails with "Set
 * DATABASE_URL_UNPOOLED" on a machine whose .env.local has had it all along.
 *
 * `process.loadEnvFile` is Node's own parser (≥ 20.12), so there is no dotenv
 * dependency for one script. It does not overwrite variables that are already
 * set, so a real environment — CI, or `DATABASE_URL=… npm run db:generate` —
 * still wins over the file.
 */
try {
  process.loadEnvFile('.env.local')
} catch {
  // No .env.local, or a Node too old to read one. Either way the environment is
  // the only source, and the error below says what is missing.
}

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
