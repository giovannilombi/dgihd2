import { ALL_SLOTS, HORIZON_LABEL, SLOT_BY_ID, daysInRange, fmtDay, isWeekendOrHoliday, monthKey, monthLabel, weekStart, SLOT_LABEL } from './calendar'
import { compensationsFor, type WeekComp } from './rules'
import { fmtNum, slotEconomics } from './economics'
import { FULL_RANGE, inRange, rangeText, type ExportRange } from './exportRange'
import type { Assignments, Params, Person } from './types'

export interface PeriodPnl {
  key: string
  label: string
  /** Giornate richieste dal cliente nel periodo (escluse quelle bloccate come "non richieste"). */
  ferialiRichiesti: number
  festiviRichiesti: number
  /** Giornate effettivamente coperte (sab/dom/festivi solo se coperti h24). */
  ferialiCoperti: number
  festiviCoperti: number
  /** Ricavo stimato: tutte le giornate richieste × tariffa. */
  revenue: number
  /** Ricavo con copertura: solo le giornate coperte (sab/dom/festivi solo se h24). */
  revenueCovered: number
  /** Tutti i turni richiesti del periodo sono coperti: solo allora il margine è significativo. */
  complete: boolean
  cost: number
  margin: number
  marginPct: number
  slotsTotal: number
  slotsCovered: number
}

function emptyPeriod(key: string, label: string): PeriodPnl {
  return { key, label, ferialiRichiesti: 0, festiviRichiesti: 0, ferialiCoperti: 0, festiviCoperti: 0, revenueCovered: 0, complete: false, revenue: 0, cost: 0, margin: 0, marginPct: 0, slotsTotal: 0, slotsCovered: 0 }
}

/**
 * Conto economico per mese e per settimana.
 * - Ricavo: giornate richieste × tariffa (notte feriale, oppure giornata di sabato/domenica/festivo),
 *   indipendentemente dalla copertura dei turni.
 * - Costo: costo aziendale di quanto riconosciuto alle persone di turno (lordo × moltiplicatore).
 * - Ricavo con copertura: solo giornate coperte (sab/dom/festivi solo se coperti h24).
 * - Margine = ricavo − costo; marginalità = margine / ricavo. Significativo solo se il periodo è
 *   interamente coperto (`complete`): con turni scoperti il costo finale non è noto.
 */
export function pnl(people: Person[], a: Assignments, p: Params, excludedDays: string[] = [], range?: ExportRange) {
  const excluded = new Set(excludedDays)
  const byId = Object.fromEntries(people.map((x) => [x.id, x]))
  const months = new Map<string, PeriodPnl>()
  const weeks = new Map<string, PeriodPnl>()
  const total = emptyPeriod('tot', `Totale ${HORIZON_LABEL}`)
  const get = (m: Map<string, PeriodPnl>, k: string, l: string) => {
    if (!m.has(k)) m.set(k, emptyPeriod(k, l))
    return m.get(k)!
  }
  for (const day of daysInRange()) {
    if (excluded.has(day) || !inRange(day, range)) continue
    const buckets = [get(months, monthKey(day), monthLabel(monthKey(day))), get(weeks, weekStart(day), `Sett. ${fmtDay(weekStart(day))}`), total]
    const slots = ALL_SLOTS.filter((s) => s.date === day)
    const covered = slots.filter((s) => byId[a[s.id]])
    for (const b of buckets) { b.slotsTotal += slots.length; b.slotsCovered += covered.length }
    const festive = isWeekendOrHoliday(day)
    const revenue = festive ? p.revenueFestivo : p.revenueFeriale
    const dayCovered = covered.length === slots.length
    buckets.forEach((b) => {
      if (festive) b.festiviRichiesti++; else b.ferialiRichiesti++
      if (dayCovered) { if (festive) b.festiviCoperti++; else b.ferialiCoperti++; b.revenueCovered += revenue }
    })
    const cost = covered.reduce((acc, s) => acc + slotEconomics(byId[a[s.id]], s, p).cost, 0)
    for (const b of buckets) { b.revenue += revenue; b.cost += cost }
  }
  const finish = (b: PeriodPnl) => {
    b.margin = b.revenue - b.cost
    b.marginPct = b.revenue > 0 ? (b.margin / b.revenue) * 100 : 0
    b.complete = b.slotsTotal > 0 && b.slotsCovered === b.slotsTotal
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

/** Report CSV del periodo: le settimane del consuntivo sono incluse se il loro ultimo turno cade nel periodo. */
export function fullReportCsv(people: Person[], a: Assignments, p: Params, excludedDays: string[] = [], range: ExportRange = FULL_RANGE) {
  const rows: (string | number)[][] = [['PIANO REPERIBILITÀ - ARM', `Periodo ${rangeText(range)}`], [], ['CONSUNTIVO CEDOLINO PER RISORSA']]
  rows.push(['Mese', 'Risorsa', 'Settimana (lun)', 'Turni', 'Indennità CCNL lorda', 'Gettone di disponibilità lordo (preferibile)', 'Alternativa: giorno straordinario', 'Alternativa: data', 'Alternativa: ore straordinario', 'Lordo totale', 'Netto garantito', 'Costo aziendale', 'Note'])
  for (const m of payroll(people, a, p)) {
    for (const r of m.rows) {
      for (const w of r.weeks) {
        if (!inRange(w.slots[w.slots.length - 1].date, range)) continue
        rows.push([
          m.label, r.person.name, w.week,
          w.slots.map((s) => slotTag(s.id)).join(', '),
          w.iccnl, w.lcomp, w.day === 'dom' ? 'Domenica' : 'Sabato', w.dayDate, w.hours, w.ltot, w.net, w.cost,
          [w.moveReason ?? '', w.warning ?? '', w.dayTotal > p.capHours + 1e-9 ? 'OLTRE CAP' : ''].filter(Boolean).join(' | '),
        ])
      }
    }
  }
  const pl = pnl(people, a, p, excludedDays, range)
  rows.push([], ['CONTO ECONOMICO'], ['Periodo', 'Notti feriali richieste', 'Giornate weekend/festive richieste', 'Turni coperti', 'Turni richiesti', 'Ricavo stimato', 'Ricavo con copertura', 'Costo aziendale', 'Margine', 'Marginalità %'])
  for (const b of [...pl.months, ...pl.weeks, pl.total]) {
    rows.push([b.label, b.ferialiRichiesti, b.festiviRichiesti, b.slotsCovered, b.slotsTotal, b.revenue, b.revenueCovered, b.cost,
      b.complete ? b.margin : 'non calcolabile (turni scoperti)', b.complete ? b.marginPct : 'non calcolabile'])
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
