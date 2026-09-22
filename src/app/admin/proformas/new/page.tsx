import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { missingProformaDetails, PROFORMA_VALID_DAYS } from '@/lib/proformas'
import ProformaForm from '@/components/admin/ProformaForm'

/**
 * Writing a new проформа.
 *
 * The configuration is checked here as well as in the action, for the same
 * reason the waybill button is: a form that cannot succeed should say why before
 * it is filled in, and a check made only in the UI is not a check.
 */

export const metadata = {
  title: 'Нова проформа',
  robots: { index: false, follow: false, nocache: true },
}

export default async function NewProformaPage() {
  await requireAdmin()

  const missing = missingProformaDetails()

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/proformas" className="text-xs text-stone-500 underline">
          ← всички проформи
        </Link>
        <h1 className="text-lg font-medium">Нова проформа</h1>
        <p className="text-xs text-stone-500">
          Самостоятелен документ, без поръчка — за запитвания преди да има поръчка. Валидна{' '}
          {PROFORMA_VALID_DAYS} дни от издаването. Не е данъчен документ: фактура се издава след
          плащането.
        </p>
      </div>

      {missing.length > 0 ? (
        <p role="alert" className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Проформа не може да се издаде, докато не е настроено: {missing.join(', ')}. Виж
          `.env.example`.
        </p>
      ) : (
        <ProformaForm />
      )}
    </div>
  )
}
