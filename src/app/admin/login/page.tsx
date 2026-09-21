import { redirect } from 'next/navigation'

import { hasAdminSession, isAdminConfigured } from '@/lib/admin-auth'
import { logIn } from '../actions'

/**
 * The login form.
 *
 * One password field. The error is carried in the query string rather than in
 * component state so the page stays a Server Component and no password handling
 * reaches the browser bundle.
 *
 * Every wrong outcome says the same thing — "грешна парола" — whether the password
 * was wrong or the form was throttled is distinguished only because a throttled
 * person needs to know to wait.
 */

const errors: Record<string, string> = {
  wrong: 'Грешна парола.',
  throttled: 'Прекалено много опити. Изчакай малко и опитай отново.',
  unconfigured:
    'Админът не е настроен: липсва ADMIN_PASSWORD в средата. Задай я в Vercel и деплойни.',
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // Already signed in: there is nothing to log into.
  if (await hasAdminSession()) redirect('/admin')

  const { error } = await searchParams
  const message = error ? errors[error] : undefined

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="mb-1 text-lg font-medium">Вход</h1>
      <p className="mb-6 text-xs text-stone-500">Панелът за поръчките на 55° candles.</p>

      {!isAdminConfigured() && (
        <p className="mb-4 rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {errors.unconfigured}
        </p>
      )}

      <form action={logIn} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-stone-600">
            Име (за историята на поръчките)
          </span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            autoFocus
            maxLength={40}
            placeholder="напр. Мария"
            className="w-full rounded-sm border border-stone-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-stone-600">Парола</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-sm border border-stone-300 px-3 py-2"
          />
        </label>

        {message && (
          <p role="alert" className="text-xs text-red-700">
            {message}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-sm bg-stone-900 px-3 py-2 text-white hover:bg-stone-700"
        >
          Влез
        </button>
      </form>
    </div>
  )
}
