import { requireAdmin } from '@/lib/admin-auth'
import { missingProformaDetails, PROFORMA_VALID_DAYS } from '@/lib/proformas'
import ProformaForm from '@/components/admin/ProformaForm'
import { Notice, PageHeader } from '@/components/admin/ui'

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
    <>
      <PageHeader
        title="Нова проформа"
        back={{ href: '/admin/proformas', label: 'всички проформи' }}
        description={`Самостоятелен документ, без поръчка — за запитвания преди да има поръчка. Валидна ${PROFORMA_VALID_DAYS} дни от издаването. Не е данъчен документ: фактура се издава след плащането.`}
      />

      {missing.length > 0 ? (
        <Notice>
          Проформа не може да се издаде, докато не е настроено: {missing.join(', ')}. Виж{' '}
          <code className="font-medium">VERCEL.md</code>.
        </Notice>
      ) : (
        <ProformaForm />
      )}
    </>
  )
}
