import 'server-only'

import { and, asc, eq, gte, lt } from 'drizzle-orm'

import { getDb } from '@/db'
import { invoices, orderItems, orders } from '@/db/schema'
import { labelOf, EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, EXPENSE_STATUSES } from './vocabulary'
import { amountCell, dateCell, type CsvTable } from './csv'
import { listExpenses } from './expenses'
import { periodBounds } from './period-key'
import { readSnapshot } from '../invoices'
import { STATUS_LABELS } from '../order-status'
import { SOLD_STATUSES, UNDONE_STATUSES } from './periods'

/**
 * The month, as files.
 *
 * Every column is a value already stored somewhere, named in the header in the
 * words the accountant uses. **No undocumented transformation happens here** —
 * no netting of refunds against revenue, no VAT split invented for a company
 * that charges none, no tax computed. What the shop recorded is what the file
 * says.
 *
 * Amounts are in minor units internally and written as decimal strings by
 * `amountCell`; see `csv.ts` for why the comma and the semicolons.
 */

/** Which of the shop's statuses the report calls a sale, spelled out in the file. */
function saleKind(status: string): string {
  if ((SOLD_STATUSES as readonly string[]).includes(status)) return 'продажба'
  if ((UNDONE_STATUSES as readonly string[]).includes(status)) return 'развалена'

  return 'в процес'
}

const METHOD_LABELS: Record<string, string> = {
  door: 'до адрес',
  office: 'до офис',
  locker: 'до автомат',
}

/**
 * Every order of the month, one row each.
 *
 * Includes the developing and the undone ones, marked as such in „Вид“: an
 * accountant asking "where did the other four orders go" is a worse outcome than
 * four rows they can see and dismiss.
 */
export async function salesTable(period: string): Promise<CsvTable> {
  const { start, end } = periodBounds(period)
  const db = getDb()

  const rows = await db
    .select()
    .from(orders)
    .where(and(gte(orders.createdAt, start), lt(orders.createdAt, end)))
    .orderBy(asc(orders.createdAt))

  const issued = await db
    .select({ number: invoices.number, orderId: invoices.orderId })
    .from(invoices)
    .where(and(gte(invoices.issuedAt, start), lt(invoices.issuedAt, end)))

  const invoiceByOrder = new Map(issued.map((row) => [row.orderId, row.number]))

  return {
    headers: [
      'Номер',
      'Дата',
      'Вид',
      'Статус',
      'Клиент',
      'Град',
      'Доставка',
      'Куриер',
      'Стоки',
      'Отстъпка',
      'Промо код',
      'Доставка (сума)',
      'Такса наложен платеж',
      'Общо',
      'Валута',
      'Плащане',
      'Товарителница',
      'Фактура',
    ],
    rows: rows.map((order) => [
      order.orderNumber,
      dateCell(order.createdAt),
      saleKind(order.status),
      STATUS_LABELS[order.status] ?? order.status,
      order.recipientName,
      order.city,
      METHOD_LABELS[order.deliveryMethod] ?? order.deliveryMethod,
      order.courier,
      amountCell(order.goodsMinor),
      amountCell(order.discountMinor),
      order.promoCode,
      amountCell(order.shippingMinor),
      amountCell(order.codFeeMinor),
      amountCell(order.totalMinor),
      order.currency,
      'наложен платеж',
      order.waybillNumber ?? '',
      invoiceByOrder.get(order.id) ?? '',
    ]),
  }
}

/** What was in the boxes. Separate from the order report, which has one row per order. */
export async function soldItemsTable(period: string): Promise<CsvTable> {
  const { start, end } = periodBounds(period)

  const rows = await getDb()
    .select({
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      status: orders.status,
      name: orderItems.name,
      slug: orderItems.productSlug,
      quantity: orderItems.quantity,
      unitPriceMinor: orderItems.unitPriceMinor,
      lineTotalMinor: orderItems.lineTotalMinor,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(gte(orders.createdAt, start), lt(orders.createdAt, end)))
    .orderBy(asc(orders.createdAt))

  return {
    headers: [
      'Поръчка',
      'Дата',
      'Вид',
      'Артикул',
      'Код',
      'Количество',
      'Ед. цена',
      'Стойност',
    ],
    rows: rows.map((row) => [
      row.orderNumber,
      dateCell(row.createdAt),
      saleKind(row.status),
      row.name,
      row.slug,
      row.quantity,
      amountCell(row.unitPriceMinor),
      amountCell(row.lineTotalMinor),
    ]),
  }
}

/**
 * The month's purchases.
 *
 * „ДДС по документа“ is the supplier's VAT, recorded because their document
 * shows it. The header says „по документа“ rather than „ДДС“ for exactly that
 * reason: this company is not registered, and a bare column heading would invite
 * the reading that the amount is recoverable.
 */
export async function expensesTable(period: string): Promise<CsvTable> {
  const rows = await listExpenses({ period }, 1000)

  return {
    headers: [
      'Референция',
      'Дата на документа',
      'Доставчик',
      'ЕИК на доставчика',
      'Документ №',
      'Описание',
      'Категория',
      'Без ДДС (по документа)',
      'ДДС по документа',
      'Общо платено',
      'Валута',
      'Плащане',
      'Документ наличен',
      'Статус',
      'Бележка',
    ],
    rows: rows.map((expense) => [
      expense.reference,
      dateCell(expense.documentDate),
      expense.supplier,
      expense.supplierEik,
      expense.documentNumber,
      expense.description,
      labelOf(EXPENSE_CATEGORIES, expense.category),
      amountCell(expense.netMinor),
      amountCell(expense.vatShownMinor),
      amountCell(expense.totalMinor),
      expense.currency,
      labelOf(EXPENSE_PAYMENT_METHODS, expense.paymentMethod),
      expense.documentMissing ? 'не' : 'да',
      labelOf(EXPENSE_STATUSES, expense.status),
      expense.note,
    ]),
  }
}

/**
 * Наложен платеж, and where each one stands.
 *
 * The one courier figure this shop can produce from its own records. It is not
 * the courier's statement — Econt's API offers none through the endpoints this
 * project uses, and that statement is downloaded from my.econt.com — so the
 * header says what the column is: the shop's view of what is owed and received.
 */
export async function codTable(period: string): Promise<CsvTable> {
  const { start, end } = periodBounds(period)

  const rows = await getDb()
    .select()
    .from(orders)
    .where(and(gte(orders.createdAt, start), lt(orders.createdAt, end)))
    .orderBy(asc(orders.createdAt))

  const collected = new Set(['cod_collected', 'reconciled'])

  return {
    headers: [
      'Поръчка',
      'Дата',
      'Товарителница',
      'Куриер',
      'Сума за събиране',
      'Събрана от куриера',
      'Получена от нас',
      'Статус на поръчката',
    ],
    rows: rows
      .filter((order) => order.waybillNumber || collected.has(order.status))
      .map((order) => [
        order.orderNumber,
        dateCell(order.createdAt),
        order.waybillNumber ?? '',
        order.courier,
        amountCell(order.totalMinor),
        collected.has(order.status) ? 'да' : 'не',
        order.status === 'reconciled' ? 'да' : 'не',
        STATUS_LABELS[order.status] ?? order.status,
      ]),
  }
}

/** The month's issued invoices, as a list. The documents themselves print per invoice. */
export async function invoicesTable(period: string): Promise<CsvTable> {
  const { start, end } = periodBounds(period)

  const rows = await getDb()
    .select()
    .from(invoices)
    .where(and(gte(invoices.issuedAt, start), lt(invoices.issuedAt, end)))
    .orderBy(asc(invoices.number))

  return {
    headers: [
      'Фактура №',
      'Издадена',
      'Получател',
      'ЕИК',
      'Поръчка',
      'Общо',
      'Валута',
      'Основание за ДДС',
    ],
    rows: rows.map((invoice) => {
      const snapshot = readSnapshot(invoice.snapshot)

      return [
        invoice.number,
        dateCell(invoice.issuedAt),
        snapshot?.buyer.company || snapshot?.buyer.name || '',
        snapshot?.buyer.eik ?? '',
        snapshot?.orderNumber ?? '',
        amountCell(invoice.totalMinor),
        invoice.currency,
        snapshot?.vatNote ?? '',
      ]
    }),
  }
}

export interface ExportFile {
  key: string
  label: string
  filename: string
  /** The requirement key this file satisfies, for the accountant's checklist. */
  requirement: string
}

/**
 * The files a month's package consists of.
 *
 * A list rather than a ZIP: zipping needs a dependency, and what the accountant
 * receives either way is these files. When an archive is added, this list is
 * what it iterates — the naming and the mapping to requirements do not change.
 */
export function exportFiles(period: string): ExportFile[] {
  return [
    {
      key: 'sales',
      label: 'Продажби',
      filename: `55candles-prodazhbi-${period}.csv`,
      requirement: 'sales',
    },
    {
      key: 'items',
      label: 'Продадени артикули',
      filename: `55candles-artikuli-${period}.csv`,
      requirement: 'sales',
    },
    {
      key: 'invoices',
      label: 'Издадени фактури',
      filename: `55candles-frakturi-${period}.csv`,
      requirement: 'invoices',
    },
    {
      key: 'expenses',
      label: 'Разходи',
      filename: `55candles-razhodi-${period}.csv`,
      requirement: 'expenses',
    },
    {
      key: 'cod',
      label: 'Наложени платежи',
      filename: `55candles-nalozheni-${period}.csv`,
      requirement: 'cod',
    },
  ]
}

/** One file by key, built on request. `null` for a key this build does not serve. */
export async function buildExport(key: string, period: string): Promise<CsvTable | null> {
  switch (key) {
    case 'sales':
      return salesTable(period)
    case 'items':
      return soldItemsTable(period)
    case 'invoices':
      return invoicesTable(period)
    case 'expenses':
      return expensesTable(period)
    case 'cod':
      return codTable(period)
    default:
      return null
  }
}
