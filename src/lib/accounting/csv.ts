/**
 * The files the accountant opens.
 *
 * CSV, and deliberately not XLSX: a spreadsheet library is a megabyte of
 * dependency to produce what Excel reads natively, and the accountant's first
 * action on either is the same double-click. Two details make the difference
 * between a file that opens and one that opens as mojibake, and both are here
 * rather than anywhere else:
 *
 * 1. **A UTF-8 byte-order mark.** Excel on Windows reads a BOM-less UTF-8 file as
 *    the system codepage, which turns every Cyrillic supplier name into rubbish.
 *    One three-byte prefix is the whole fix.
 * 2. **Semicolons, not commas.** Under a Bulgarian locale Excel's list separator
 *    is `;`, and a comma-separated file lands entirely in column A.
 *
 * Amounts are written with a decimal **comma** for the same reason: that is what
 * a Bulgarian spreadsheet reads as a number, and a total that arrives as text is
 * a total the accountant has to retype.
 *
 * Pure, and no transformation is applied that the column header does not name.
 */

const BOM = '﻿'
const DELIMITER = ';'

/**
 * One cell, quoted only when it has to be.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with an apostrophe: a supplier
 * called `-Lab` is a value, and a spreadsheet that reads it as a formula is a
 * spreadsheet showing an error where a name should be.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''

  const text = String(value)
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text

  return /[";\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** Minor units to the decimal string a Bulgarian spreadsheet reads as a number. */
export function amountCell(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return ''

  const sign = minor < 0 ? '-' : ''
  const absolute = Math.abs(minor)

  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, '0')}`
}

/** `YYYY-MM-DD`, which sorts and which every spreadsheet parses. */
export function dateCell(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : ''
}

export interface CsvTable {
  headers: readonly string[]
  rows: readonly (readonly (string | number | null | undefined)[])[]
}

/**
 * A table to a CSV document.
 *
 * `\r\n` because that is what Excel expects and what every other reader
 * tolerates.
 */
export function toCsv(table: CsvTable): string {
  const lines = [table.headers.map(cell).join(DELIMITER)]

  for (const row of table.rows) {
    lines.push(row.map(cell).join(DELIMITER))
  }

  return BOM + lines.join('\r\n') + '\r\n'
}

/** The response one CSV download is served as. Filename included, so callers cannot forget it. */
export function csvResponse(filename: string, table: CsvTable): Response {
  return new Response(toCsv(table), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      // One month's books, behind a login, assembled on request.
      'cache-control': 'no-store',
    },
  })
}
