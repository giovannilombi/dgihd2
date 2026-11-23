import { describe, expect, it } from 'vitest'
import { dayStatusMap } from './dayStatus'
import type { Intervention } from './interventions'
import { personOvertime } from './overtime'
import { buildPayroll, buildPayrollXlsx, payPeriods, payrollFileName } from './payrollExport'
import { slotEconomics } from './economics'
import { DEFAULT_TEAMS } from './teams'
import { DEFAULT_PARAMS, type Person } from './types'

const P = { ...DEFAULT_PARAMS, callFee: 5 } // compenso per intervento di prova (di default è 0)

const person = (id: string, extra: Partial<Person> = {}): Person =>
  ({ id, name: id, email: `${id}@example.com`, level: 'B1', ral: 30000, active: true, color: '#000', team: 'tech', ...extra })
const t1 = person('t1')
const q1 = person('q1', { ral: 0, ralNd: true })
const h1 = person('h1', { team: 'pm', salaryHidden: true })
const people = [t1, q1, h1]
const assignments = { '2026-11-26|N': 't1', '2026-11-27|N': 'q1', '2026-11-28|D': 'h1', '2026-11-29|D': 't1' }
const erog = (day: string) => ({ day, erogato_at: '2026-12-01T08:00:00Z', erogato_by_name: 'x', consuntivato_at: null, consuntivato_by_name: null })
const days = dayStatusMap([erog('2026-11-26'), erog('2026-11-27'), erog('2026-11-28')])
const iv = (id: string, personId: string, slot: string, start: string, end: string, status: Intervention['status']): Intervention =>
  ({ id, slot, personId, start, end, note: null, status, rejectReason: null, resendComment: null, decidedByName: null, decidedAt: null })
const interventions = [
  iv('a', 't1', '2026-11-26|N', '2026-11-26T22:40', '2026-11-27T00:15', 'approved'),
  iv('b', 't1', '2026-11-26|N', '2026-11-27T03:00', '2026-11-27T03:20', 'pending'),
  iv('c', 'q1', '2026-11-27|N', '2026-11-27T19:00', '2026-11-27T19:30', 'approved'),
]
const ndSlot = { net: 50, iccnl: 8.03, ltot: 92.59, lcomp: 84.56, cost: 125 }
const nd = { q1: { weeks: [], slots: { '2026-11-27|N': ndSlot } } }
const week = payPeriods().weeks.find((w) => w.from === '2026-11-23')!

describe('export per le paghe', () => {
  const x = buildPayroll({ people, assignments, params: P, nd, days, interventions, showAmounts: () => true }, week)

  it('periodi: mesi e settimane lunedì–domenica del piano', () => {
    const { months, weeks } = payPeriods()
    expect(months.map((m) => m.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(weeks[0]).toMatchObject({ from: '2026-10-26', to: '2026-11-01' })
    expect(week.label).toMatch(/Settimana 48/)
  })
  it('solo turni dei giorni erogati; persone di altri team escluse con avviso; RAL Q/ dagli importi del server', () => {
    expect(x.shifts.map((s) => s.slot)).toEqual(['2026-11-26|N', '2026-11-27|N'])
    expect(x.shifts[0]).toMatchObject({ iccnl: slotEconomics(t1, { date: '2026-11-26', kind: 'FN' }, P).iccnl })
    expect(x.shifts[1]).toMatchObject({ iccnl: 8.03, gettone: 84.56 })
    expect(x.notes.join(' ')).toMatch(/1 persona di un altro team esclusa/)
  })
  it('solo interventi approvati; RAL Q/: solo ore con nota', () => {
    expect(x.overtime.map((o) => o.iv.id).sort()).toEqual(['a', 'c'])
    const a = x.overtime.find((o) => o.iv.id === 'a')!
    expect(a.amount).toBeCloseTo(personOvertime([interventions[0]], 30000, P).amount!, 2)
    expect(a.total).toBeCloseTo(a.amount! + 5, 2)
    const c = x.overtime.find((o) => o.iv.id === 'c')!
    expect(c.amount).toBeNull()
    expect(c.hours).toBe(1)
    expect(c.note).toMatch(/RAL Q\//)
  })
  it('riepilogo per persona: indennità + gettone + straordinario + chiamate', () => {
    const s1 = x.summary.find((s) => s.person.id === 't1')!
    const e = slotEconomics(t1, { date: '2026-11-26', kind: 'FN' }, P)
    expect(s1).toMatchObject({ shifts: 1, calls: 1, callFees: 5, otHours: 2 })
    expect(s1.total).toBeCloseTo(e.iccnl + e.lcomp + s1.otAmount! + 5, 1)
    const sq = x.summary.find((s) => s.person.id === 'q1')!
    expect(sq.total).toBeNull()
    expect(x.summary.some((s) => s.person.id === 'h1')).toBe(false)
  })
  it('importi degli interventi nascosti a chi non può vederli', () => {
    const y = buildPayroll({ people, assignments, params: P, nd, days, interventions, showAmounts: () => false }, week)
    expect(y.overtime.find((o) => o.iv.id === 'a')).toMatchObject({ amount: null, total: null, hours: 2 })
    expect(y.overtime.find((o) => o.iv.id === 'a')!.note).toMatch(/non visibile/)
  })
  it('nome del file e file Excel con i 4 fogli', async () => {
    expect(payrollFileName(week, new Date(2026, 11, 1))).toBe('20261201-ARM-HD2-paghe-settimana-20261123.xlsx')
    expect(payrollFileName(payPeriods().months[1], new Date(2026, 11, 31))).toBe('20261231-ARM-HD2-paghe-dicembre-2026.xlsx')
    const buf = await buildPayrollXlsx(x, DEFAULT_TEAMS, P)
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Reperibilità CCNL', 'Gettoni integrativi', 'Straordinario per interventi', 'Riepilogo paghe'])
  })
})
