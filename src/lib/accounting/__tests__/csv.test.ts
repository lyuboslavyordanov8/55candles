import { describe, it, expect } from 'vitest'

import { amountCell, dateCell, toCsv } from '../csv'

/**
 * The files the accountant opens.
 *
 * Every assertion here is about a file arriving *readable* on a Windows machine
 * with a Bulgarian locale, which is where these are opened. A CSV that technically
 * contains the right bytes and renders as `ÐžÐ¿Ð°ÐºÐ¾Ð²ÐºÐ¸` in column A has failed at
 * the only job it had.
 */

describe('the CSV a Bulgarian accountant opens', () => {
  it('starts with a byte-order mark, or Excel reads Cyrillic as rubbish', () => {
    const csv = toCsv({ headers: ['Доставчик'], rows: [['Опаковки ЕООД']] })

    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Опаковки ЕООД')
  })

  it('separates with semicolons, which is the list separator under a BG locale', () => {
    const csv = toCsv({ headers: ['A', 'B'], rows: [['1', '2']] })

    expect(csv).toContain('A;B')
    expect(csv).toContain('1;2')
  })

  it('ends its lines the way Excel expects', () => {
    expect(toCsv({ headers: ['A'], rows: [['1']] })).toBe('﻿A\r\n1\r\n')
  })

  it('quotes a value containing the separator, and doubles inner quotes', () => {
    const csv = toCsv({
      headers: ['Описание'],
      rows: [['восък; парафин'], ['свещ "Лавандула"']],
    })

    expect(csv).toContain('"восък; парафин"')
    expect(csv).toContain('"свещ ""Лавандула"""')
  })

  it('defuses a value a spreadsheet would run as a formula', () => {
    // A supplier named `-Lab` is a name. Excel reads a leading `-` as a formula
    // and shows an error where the name should be.
    const csv = toCsv({ headers: ['Доставчик'], rows: [['-Lab'], ['=SUM(A1)'], ['+359']] })

    expect(csv).toContain("'-Lab")
    expect(csv).toContain("'=SUM(A1)")
    expect(csv).toContain("'+359")
  })

  it('writes an empty cell for a missing value rather than the word undefined', () => {
    expect(toCsv({ headers: ['A', 'B'], rows: [[null, undefined]] })).toBe('﻿A;B\r\n;\r\n')
  })
})

describe('amounts and dates', () => {
  it('writes money with a decimal comma, which is what a BG spreadsheet parses', () => {
    expect(amountCell(8640)).toBe('86,40')
    expect(amountCell(5)).toBe('0,05')
    expect(amountCell(0)).toBe('0,00')
    expect(amountCell(199900)).toBe('1999,00')
  })

  it('keeps the sign in front of a negative amount', () => {
    expect(amountCell(-8640)).toBe('-86,40')
  })

  it('leaves a missing amount blank rather than writing a zero that is not there', () => {
    // A blank "ДДС по документа" means the document did not show one. A `0,00`
    // would mean it showed zero, which is a different claim about the paper.
    expect(amountCell(null)).toBe('')
    expect(amountCell(undefined)).toBe('')
  })

  it('writes a date that sorts and that every spreadsheet parses', () => {
    expect(dateCell(new Date('2026-09-18T12:00:00Z'))).toBe('2026-09-18')
    expect(dateCell(null)).toBe('')
  })
})
