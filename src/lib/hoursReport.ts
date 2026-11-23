import { SLOT_BY_ID, isHoliday, weekday } from './calendar'
import { dayState, type DayState, type DayStatusMap } from './dayStatus'
import { bySlot, shiftChip, type Intervention } from './interventions'
import { BAND_LABEL, BANDS, personOvertime, RATE_KEYS, rateLabel, shiftWindow, type Band, type RateKey } from './overtime'
import type { PayPeriod } from './payrollExport'
import { teamLabel, type TeamDir, type TeamId } from './teams'
import type { Assignments, Params, Person, Slot } from './types'

/**
 * Riepilogo per le paghe senza importi: turni per categoria e interventi in ore, per persona.
 * Non usa RAL né livello: con questi dati l'ufficio paghe calcola indennità, gettone e straordinari
 * (le regole sono nella pagina Approccio, non nel file).
 */

/** Categoria del turno: tipo (notte feriale, diurno, notte) e giorno di riferimento (quello in cui inizia). */
export type ShiftCat = 'FN' | 'SAT_D' | 'SAT_N' | 'HOL_D' | 'HOL_N'
export const SHIFT_CATS: ShiftCat[] = ['FN', 'SAT_D', 'SAT_N', 'HOL_D', 'HOL_N']
export const SHIFT_CAT_LABEL: Record<ShiftCat, string> = {
  FN: 'Feriale notturno',
  SAT_D: 'Sabato diurno',
  SAT_N: 'Sabato notturno',
  HOL_D: 'Domenica/festivo diurno',
  HOL_N: 'Domenica/festivo notturno',
}
export const SHIFT_CAT_HOURS: Record<ShiftCat, string> = {
  FN: '18:00 → 09:00 del giorno dopo',
  SAT_D: '09:00 → 18:00',
  SAT_N: '18:00 → 09:00 della domenica',
  HOL_D: '09:00 → 18:00',
  HOL_N: '18:00 → 09:00 del giorno dopo',
}

/** Stessa distinzione dell'indennità CCNL: il sabato festivo conta come festivo. */
export function shiftCategory(slot: Pick<Slot, 'date' | 'kind'>): ShiftCat {
  if (slot.kind === 'FN') return 'FN'
  const saturday = weekday(slot.date) === 6 && !isHoliday(slot.date)
  return slot.kind === 'WD' ? (saturday ? 'SAT_D' : 'HOL_D') : saturday ? 'SAT_N' : 'HOL_N'
}

/** Stato del turno: effettuato (giorno erogato o consuntivato) oppure programmato nel calendario e non ancora erogato. */
export type HoursShiftState = Exclude<DayState, 'aperto'> | 'programmato'
export interface HoursShift { person: Person; slot: string; date: string; cat: ShiftCat; start: string; end: string; state: HoursShiftState }
export interface HoursIntervention {
  person: Person; iv: Intervention; date: string; cat: ShiftCat
  /** Minuti effettivi, in totale e per fascia */
  minutes: number; effective: Record<Band, number>
  /** Ore riconosciute, in totale e (in minuti) per voce di paga */
  hours: number; byRate: Record<RateKey, number>
}
export interface HoursPerson {
  person: Person
  /** Turni effettuati (giorni erogati) */
  shifts: Record<ShiftCat, number>; totalShifts: number
  /** Turni programmati e non ancora erogati (solo nel previsionale) */
  planned: Record<ShiftCat, number>; totalPlanned: number
  interventions: number; minutes: number; effective: Record<Band, number>
  hours: number; byRate: Record<RateKey, number>
}
export interface HoursReport {
  period: PayPeriod
  team: TeamId | null
  /** Previsionale: anche i turni programmati non ancora erogati (gli interventi restano solo gli effettuati) */
  forecast: boolean
  shifts: HoursShift[]
  interventions: HoursIntervention[]
  people: HoursPerson[]
  /** Cosa manca per chiudere il periodo (turni non erogati, interventi da compilare o da approvare) */
  notes: string[]
}

export interface HoursInput {
  people: Person[]
  assignments: Assignments
  params: Params
  days: DayStatusMap
  interventions: Intervention[]
  /** Turni con "Nessun intervento" dichiarato */
  noInt: ReadonlySet<string>
  /** Ora attuale (Europe/Rome) per riconoscere i turni finiti e ancora da compilare */
  now: string
}

const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Turni dei soli giorni erogati e interventi approvati del periodo; un turno appartiene al periodo del
 * suo giorno di riferimento e gli interventi seguono il turno. Tutte le persone, senza dati retributivi.
 * Con `forecast` anche i turni programmati nel calendario e non ancora erogati; gli interventi restano
 * solo quelli effettuati e approvati.
 */
export function buildHoursReport(input: HoursInput, period: PayPeriod, team: TeamId | null = null, { forecast = false }: { forecast?: boolean } = {}): HoursReport {
  const { people, assignments, params, days, interventions, noInt, now } = input
  const inTeam = (p: Person | undefined): p is Person => !!p && (!team || p.team === team)
  const byId = new Map(people.map((p) => [p.id, p]))
  const inPeriod = (d: string) => d >= period.from && d <= period.to

  const shifts: HoursShift[] = []
  let notErogati = 0, todo = 0
  const ivBySlot = bySlot(interventions)
  for (const [slot, pid] of Object.entries(assignments).sort(([a], [b]) => a.localeCompare(b))) {
    const s = SLOT_BY_ID[slot]
    const person = byId.get(pid)
    if (!s || !inTeam(person) || !inPeriod(s.date)) continue
    if (shiftChip(slot, (ivBySlot[slot] ?? []).filter((x) => x.personId === pid), noInt.has(slot), now).chip === 'todo') todo++
    const state = dayState(days, s.date)
    if (state === 'aperto' && !forecast) { notErogati++; continue }
    const w = shiftWindow(slot)
    shifts.push({ person, slot, date: s.date, cat: shiftCategory(s), start: w.start, end: w.end, state: state === 'aperto' ? 'programmato' : state })
  }

  const ivs: HoursIntervention[] = []
  for (const person of people.filter(inTeam)) {
    const approved = interventions.filter((x) => x.personId === person.id && x.status === 'approved')
    if (!approved.some((x) => inPeriod(x.slot.slice(0, 10)))) continue
    // le prime ore feriali diurne si contano per giorno su tutti gli interventi approvati della persona
    for (const item of personOvertime(approved, null, params).items) {
      const iv = approved.find((x) => x.id === item.id)!
      const date = iv.slot.slice(0, 10)
      const s = SLOT_BY_ID[iv.slot]
      if (!inPeriod(date) || !s) continue
      ivs.push({ person, iv, date, cat: shiftCategory(s), minutes: item.minutes, effective: item.effective, hours: item.hours, byRate: item.byRate })
    }
  }
  ivs.sort((a, b) => a.person.name.localeCompare(b.person.name, 'it') || a.iv.start.localeCompare(b.iv.start))

  const ids = [...new Set([...shifts.map((x) => x.person.id), ...ivs.map((x) => x.person.id)])]
  const rows: HoursPerson[] = ids.map((id) => {
    const sh = shifts.filter((x) => x.person.id === id && x.state !== 'programmato')
    const pl = shifts.filter((x) => x.person.id === id && x.state === 'programmato')
    const ov = ivs.filter((x) => x.person.id === id)
    const byCat = zero(SHIFT_CATS), planned = zero(SHIFT_CATS)
    for (const x of sh) byCat[x.cat]++
    for (const x of pl) planned[x.cat]++
    const effective = zero(BANDS), byRate = zero(RATE_KEYS)
    for (const x of ov) {
      for (const k of BANDS) effective[k] += x.effective[k]
      for (const k of RATE_KEYS) byRate[k] += x.byRate[k]
    }
    return {
      person: byId.get(id)!, shifts: byCat, totalShifts: sh.length, planned, totalPlanned: pl.length,
      interventions: ov.length, minutes: ov.reduce((t, x) => t + x.minutes, 0), effective,
      hours: ov.reduce((t, x) => t + x.hours, 0), byRate,
    }
  }).sort((a, b) => a.person.name.localeCompare(b.person.name, 'it'))

  const scoped = interventions.filter((x) => inPeriod(x.slot.slice(0, 10)) && inTeam(byId.get(x.personId)))
  const pending = scoped.filter((x) => x.status === 'pending').length
  const rejected = scoped.filter((x) => x.status === 'rejected').length
  const notes: string[] = []
  if (notErogati) notes.push(`${plural(notErogati, 'turno', 'turni')} in giorni non ancora erogati: non ${notErogati === 1 ? 'incluso' : 'inclusi'}.`)
  if (todo) notes.push(`${plural(todo, 'turno finito', 'turni finiti')} senza interventi dichiarati né "Nessun intervento".`)
  if (pending) notes.push(`${plural(pending, 'intervento', 'interventi')} in approvazione: non ${pending === 1 ? 'incluso' : 'inclusi'}.`)
  if (rejected) notes.push(`${plural(rejected, 'intervento rifiutato', 'interventi rifiutati')} da correggere: non ${rejected === 1 ? 'incluso' : 'inclusi'}.`)
  return { period, team, forecast, shifts, interventions: ivs, people: rows, notes }
}

/** Nome file: AAAAMMGG-ARM-HD2-paghe-ore-<mese o settimana>.xlsx (previsionale: …-previsionale-…). */
export function hoursFileName(period: PayPeriod, now = new Date(), forecast = false) {
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `${today}-ARM-HD2-${forecast ? 'previsionale' : 'paghe-ore'}-${period.kind === 'month' ? period.label.toLowerCase().replace(/\s+/g, '-') : `settimana-${period.from.replaceAll('-', '')}`}.xlsx`
}

const WEEKDAY = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const dateCell = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)))
const stampCell = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)))
/** File Excel senza importi: Riepilogo per persona, Turni, Interventi. */
export async function buildHoursXlsx(x: HoursReport, teams: TeamDir, params: Params): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Piano reperibilità'
  const headFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } }
  const HRS = '0.00'
  type Ws = import('exceljs').Worksheet
  const title = (ws: Ws, text: string) => {
    ws.addRow([text]).font = { bold: true, size: 13 }
    const scope = x.forecast ? 'previsionale: turni effettuati e programmati, interventi solo approvati' : 'solo turni erogati e interventi approvati'
    ws.addRow([`${x.period.label}${x.team ? ` · team ${teamLabel(teams, x.team)}` : ''} · ${scope} · nessun importo · generato il ${new Date().toLocaleString('it-IT')}`]).font = { size: 9, color: { argb: 'FF64748B' } }
    for (const n of x.notes) ws.addRow([n]).font = { size: 9, color: { argb: 'FFB45309' } }
    ws.addRow([])
  }
  const header = (ws: Ws, labels: string[]) => {
    const r = ws.addRow(labels)
    r.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = headFill; c.alignment = { vertical: 'middle', wrapText: true } })
    r.height = 42
    ws.views = [{ state: 'frozen', ySplit: r.number }]
  }
  const total = (ws: Ws, values: (string | number)[]) => {
    const r = ws.addRow(values)
    r.font = { bold: true }
    r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } } })
  }
  const who = (p: Person) => [p.name, p.email ?? '', teamLabel(teams, p.team)]
  const sumBy = <T,>(list: T[], f: (t: T) => number) => list.reduce((t, v) => t + f(v), 0)
  const people = x.people, shifts = x.shifts, ivs = x.interventions
  const fc = x.forecast
  const done = shifts.filter((s) => s.state !== 'programmato').length
  const STATE_LABEL = { erogato: 'Erogato', consuntivato: 'Consuntivato', programmato: 'Programmato' } as const

  // 1. Riepilogo per persona
  const ws1 = wb.addWorksheet('Riepilogo per persona')
  title(ws1, 'Turni di reperibilità e ore di intervento per persona')
  const doneLabel = fc ? 'Effettuati' : 'Turni'
  header(ws1, ['Persona', 'Email', 'Team', ...SHIFT_CATS.map((c) => `${doneLabel} ${SHIFT_CAT_LABEL[c].toLowerCase()}`), `${doneLabel} totali`,
    ...(fc ? [...SHIFT_CATS.map((c) => `Programmati ${SHIFT_CAT_LABEL[c].toLowerCase()}`), 'Programmati totali'] : []), 'Interventi',
    ...BANDS.map((b) => `Ore effettive ${BAND_LABEL[b].toLowerCase()}`), ...RATE_KEYS.map((k) => `Ore riconosciute ${rateLabel(k, params).toLowerCase()}`), 'Ore riconosciute totali'])
  for (const r of people) {
    ws1.addRow([...who(r.person), ...SHIFT_CATS.map((c) => r.shifts[c]), r.totalShifts,
      ...(fc ? [...SHIFT_CATS.map((c) => r.planned[c]), r.totalPlanned] : []), r.interventions,
      ...BANDS.map((b) => r.effective[b] / 60), ...RATE_KEYS.map((k) => r.byRate[k] / 60), r.hours])
  }
  total(ws1, ['Totale', '', '', ...SHIFT_CATS.map((c) => sumBy(people, (r) => r.shifts[c])), done,
    ...(fc ? [...SHIFT_CATS.map((c) => sumBy(people, (r) => r.planned[c])), shifts.length - done] : []), ivs.length,
    ...BANDS.map((b) => sumBy(people, (r) => r.effective[b]) / 60), ...RATE_KEYS.map((k) => sumBy(people, (r) => r.byRate[k]) / 60), sumBy(people, (r) => r.hours)])
  const catCols = () => [...SHIFT_CATS.map(() => ({ width: 13 })), { width: 11 }]
  ws1.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, ...catCols(), ...(fc ? catCols() : []), { width: 11 },
    ...BANDS.map(() => ({ width: 13, style: { numFmt: HRS } })), ...RATE_KEYS.map(() => ({ width: 15, style: { numFmt: HRS } })), { width: 13, style: { numFmt: HRS } }]

  // 2. Turni
  const ws2 = wb.addWorksheet('Turni')
  title(ws2, `Turni di reperibilità ${fc ? 'effettuati e programmati' : 'erogati'} (giorno di riferimento = giorno di inizio)`)
  header(ws2, ['Persona', 'Email', 'Team', 'Giorno di riferimento', 'Giorno', 'Categoria', 'Inizio', 'Fine', 'Stato'])
  for (const s of shifts) {
    ws2.addRow([...who(s.person), dateCell(s.date), WEEKDAY[weekday(s.date)], SHIFT_CAT_LABEL[s.cat], stampCell(s.start), stampCell(s.end), STATE_LABEL[s.state]])
  }
  total(ws2, ['Totale', '', '', '', '', fc ? `${plural(done, 'effettuato', 'effettuati')}, ${plural(shifts.length - done, 'programmato', 'programmati')}` : plural(shifts.length, 'turno', 'turni'), '', '', ''])
  ws2.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, { width: 14, style: { numFmt: 'dd/mm/yyyy' } }, { width: 11 }, { width: 26 },
    { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { width: 14 }]

  // 3. Interventi
  const ws3 = wb.addWorksheet('Interventi')
  title(ws3, 'Interventi approvati: durata effettiva per fascia e ore riconosciute per voce')
  header(ws3, ['Persona', 'Email', 'Team', 'Giorno del turno', 'Categoria del turno', 'Inizio', 'Fine', 'Durata effettiva (min)',
    ...BANDS.map((b) => `Minuti ${BAND_LABEL[b].toLowerCase()}`), 'Ore riconosciute', ...RATE_KEYS.map((k) => `Ore ${rateLabel(k, params).toLowerCase()}`), 'Nota'])
  for (const o of ivs) {
    ws3.addRow([...who(o.person), dateCell(o.date), SHIFT_CAT_LABEL[o.cat], stampCell(o.iv.start), stampCell(o.iv.end), o.minutes,
      ...BANDS.map((b) => o.effective[b]), o.hours, ...RATE_KEYS.map((k) => o.byRate[k] / 60), o.iv.note ?? ''])
  }
  total(ws3, ['Totale', '', '', '', plural(ivs.length, 'intervento', 'interventi'), '', '', sumBy(ivs, (o) => o.minutes),
    ...BANDS.map((b) => sumBy(ivs, (o) => o.effective[b])), sumBy(ivs, (o) => o.hours), ...RATE_KEYS.map((k) => sumBy(ivs, (o) => o.byRate[k]) / 60), ''])
  ws3.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, { width: 13, style: { numFmt: 'dd/mm/yyyy' } }, { width: 24 },
    { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { width: 11 },
    ...BANDS.map(() => ({ width: 12 })), { width: 11 }, ...RATE_KEYS.map(() => ({ width: 14, style: { numFmt: HRS } })), { width: 40 }]

  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }]
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}
