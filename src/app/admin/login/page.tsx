import { redirect } from 'next/navigation'

import { hasAdminSession, isAdminConfigured } from '@/lib/admin-auth'
import { CandleIcon } from '@/components/admin/icons'
import { button, fieldLabel, input, Notice, panel } from '@/components/admin/ui'
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
 *
 * The only page in the admin with no navigation rail (see the layout), so it
 * carries the wordmark itself: a bare password box on a cream field could belong
 * to anything.
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
    <div className="mx-auto w-full max-w-sm py-10 sm:py-16">
      <div className="mb-6 flex items-center gap-2 text-charcoal">
        <CandleIcon className="text-clay" />
        <span className="font-serif text-xl leading-none">55° candles</span>
      </div>

      <h1 className="font-serif text-2xl leading-tight text-charcoal">Вход</h1>
      <p className="mt-1 mb-5 text-xs text-ink-secondary">
        Панелът за поръчките. Името се пише в историята на всяка промяна.
      </p>

      {!isAdminConfigured() && (
        <div className="mb-4">
          <Notice>{errors.unconfigured}</Notice>
        </div>
      )}

      <form action={logIn} className={`${panel} space-y-4 p-5`}>
        <label className="block">
          <span className={fieldLabel}>Име</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            autoFocus
            maxLength={40}
            placeholder="напр. Мария"
            className={`${input} h-9 text-sm`}
          />
        </label>

        <label className="block">
          <span className={fieldLabel}>Парола</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className={`${input} h-9 text-sm`}
          />
        </label>

        {message && (
          <p role="alert" className="text-xs font-medium text-red-800">
            {message}
          </p>
        )}

        <button type="submit" className={`${button('primary', 'lg')} w-full`}>
          Влез
        </button>
      </form>
    </div>
  )
}
