/**
 * `submitCheckout`'s rate-limit settings, in their own module rather than
 * `actions.ts`.
 *
 * `actions.ts` is `'use server'`: every export from such a file becomes a
 * callable action reference, and Next's compiler requires each one to be an
 * async function — exporting a plain constant alongside `submitCheckout`
 * fails the build ("Export submitCheckout doesn't exist in target module").
 * These live here so the regression test can import the real limit instead
 * of hardcoding a copy that could silently drift from it.
 */
export const CHECKOUT_MAX_PER_WINDOW = 20
export const CHECKOUT_WINDOW_MS = 10 * 60_000
