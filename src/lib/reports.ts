import { ALL_SLOTS, SLOT_BY_ID, daysInRange, fmtDay, isWeekendOrHoliday, monthKey, monthLabel, weekStart, SLOT_LABEL } from './calendar'
import { compensationsFor, type WeekComp } from './rules'
import { fmtNum, slotEconomics } from './economics'
import type { Assignments, Params, Person } from './types'

export interface PeriodPnl {
  key: string
  label: string
  ferialiCoperti: number
  festiviCoperti: number
  festiviParziali: number
  revenue: number
  cost: number
  margin: number
  marginPct: number
  slotsTotal: number
  slotsCovered: number
}

function emptyPeriod(key: string, label: string): PeriodPnl {
  return { key, label, ferialiCoperti: 0, festiviCoperti: 0, festiviParziali: 0, revenue: 0, cost: 0, margin: 0, marginPct: 0, slotsTotal: 0, slotsCovered: 0 }
}

/** Conto economico per mese e per settimana (ricavi per giorno coperto, costi per slot assegnato). */
export function pnl(people: Person[], a: Assignments, p: Params, excludedDays: string[] = []) {
  const excluded = new Set(excludedDays)
  const byId = Object.fromEntries(people.map((x) => [x.id, x]))
  const months = new Map<string, PeriodPnl>()
  const weeks = new Map<string, PeriodPnl>()
  const total = emptyPeriod('tot', 'Totale Nov–Dic 2026')
  const get = (m: Map<string, PeriodPnl>, k: string, l: string) => {
    if (!m.has(k)) m.set(k, emptyPeriod(k, l))
    return m.get(k)!
  }
  for (const day of daysInRange()) {
    if (excluded.has(day)) continue
    const buckets = [get(months, monthKey(day), monthLabel(monthKey(day))), get(weeks, weekStart(day), `Sett. ${fmtDay(weekStart(day))}`), total]
    const slots = ALL_SLOTS.filter((s) => s.date === day)
    const covered = slots.filter((s) => byId[a[s.id]])
    let revenue = 0
    for (const b of buckets) { b.slotsTotal += slots.length; b.slotsCovered += covered.length }
    if (isWeekendOrHoliday(day)) {
      if (covered.length === 2) { revenue = p.revenueFestivo; buckets.forEach((b) => b.festiviCoperti++) }
      else if (covered.length === 1) buckets.forEach((b) => b.festiviParziali++)
    } else if (covered.length === 1) {
      revenue = p.revenueFeriale
      buckets.forEach((b) => b.ferialiCoperti++)
    }
    const cost = covered.reduce((acc, s) => acc + slotEconomics(byId[a[s.id]], s, p).cost, 0)
    for (const b of buckets) { b.revenue += revenue; b.cost += cost }
  }
  const finish = (b: PeriodPnl) => {
    b.margin = b.revenue - b.cost
    b.marginPct = b.revenue > 0 ? (b.margin / b.revenue) * 100 : 0
    return b
  }
  return { months: [...months.values()].map(finish), weeks: [...weeks.values()].map(finish), total: finish(total) }
}

export interface PersonMonthReport {
  person: Person
  weeks: WeekComp[]
  totals: { slots: number; iccnl: number; lcomp: number; ltot: number; hours: number; net: number; cost: number }
}

/**
 * Consuntivo cedolino: ogni settimana confluisce nel consuntivo del mese in cui è stato svolto
 * il suo ultimo turno (liquidazione a fine mese, a turni effettuati). La data di imputazione
 * delle ore (sabato/domenica) è riportata a parte e può cadere a cavallo del mese.
 */
export function payroll(people: Person[], a: Assignments, p: Params) {
  const byMonth = new Map<string, PersonMonthReport[]>()
  for (const person of people) {
    for (const wc of compensationsFor(person, a, p)) {
      const m = monthKey(wc.slots[wc.slots.length - 1].date)
      if (!byMonth.has(m)) byMonth.set(m, [])
      const list = byMonth.get(m)!
      let r = list.find((x) => x.person.id === person.id)
      if (!r) {
        r = { person, weeks: [], totals: { slots: 0, iccnl: 0, lcomp: 0, ltot: 0, hours: 0, net: 0, cost: 0 } }
        list.push(r)
      }
      r.weeks.push(wc)
      const t = r.totals
      t.slots += wc.slots.length; t.iccnl += wc.iccnl; t.lcomp += wc.lcomp; t.ltot += wc.ltot
      t.hours += wc.hours; t.net += wc.net; t.cost += wc.cost
    }
  }
  return [...byMonth.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([key, rows]) => ({ key, label: monthLabel(key), rows }))
}

export const slotTag = (sid: string) => {
  const s = SLOT_BY_ID[sid]
  return `${fmtDay(s.date)} [${SLOT_LABEL[s.kind]}${s.kind === 'FN' ? '' : ' fest.'}]`
}

// ---------- CSV ----------
const csvCell = (v: string | number) => {
  const s = typeof v === 'number' ? fmtNum(v) : v
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: (string | number)[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n')

export function fullReportCsv(people: Person[], a: Assignments, p: Params, excludedDays: string[] = []) {
  const rows: (string | number)[][] = [['CONSUNTIVO CEDOLINO PER RISORSA']]
  rows.push(['Mese', 'Risorsa', 'Livello', 'RAL', 'Settimana (lun)', 'Turni', 'Indennità CCNL lorda', 'Gettone di disponibilità lordo (preferibile)', 'Alternativa: giorno straordinario', 'Alternativa: data', 'Alternativa: ore straordinario', 'Lordo totale', 'Netto garantito', 'Costo aziendale', 'Note'])
  for (const m of payroll(people, a, p)) {
    for (const r of m.rows) {
      for (const w of r.weeks) {
        rows.push([
          m.label, r.person.name, r.person.level, r.person.ral, w.week,
          w.slots.map((s) => slotTag(s.id)).join(', '),
          w.iccnl, w.lcomp, w.day === 'dom' ? 'Domenica' : 'Sabato', w.dayDate, w.hours, w.ltot, w.net, w.cost,
          [w.moveReason ?? '', w.warning ?? '', w.dayTotal > p.capHours + 1e-9 ? 'OLTRE CAP' : ''].filter(Boolean).join(' | '),
        ])
      }
    }
  }
  const pl = pnl(people, a, p, excludedDays)
  rows.push([], ['CONTO ECONOMICO'], ['Periodo', 'Feriali coperti', 'Weekend/festivi coperti', 'Weekend/festivi parziali (non fatturati)', 'Ricavo', 'Costo aziendale', 'Margine', 'Marginalità %'])
  for (const b of [...pl.months, ...pl.weeks, pl.total]) {
    rows.push([b.label, b.ferialiCoperti, b.festiviCoperti, b.festiviParziali, b.revenue, b.cost, b.margin, b.marginPct])
  }
  return toCsv(rows)
}

export function download(filename: string, content: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const el = document.createElement('a')
  el.href = url
  el.download = filename
  el.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
