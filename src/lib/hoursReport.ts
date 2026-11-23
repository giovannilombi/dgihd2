import { SLOT_BY_ID, isHoliday, weekday } from './calendar'
import { dayState, type DayState, type DayStatusMap } from './dayStatus'
import { bySlot, shiftChip, type Intervention } from './interventions'
import { BAND_LABEL, BANDS, fmtMinutes, personOvertime, RATE_KEYS, rateLabel, shiftWindow, type Band, type RateKey } from './overtime'
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
export interface HoursShift {
  person: Person; slot: string; date: string; cat: ShiftCat; start: string; end: string; state: HoursShiftState
  /** Interventi approvati sul turno e loro ore riconosciute */
  ivCount: number; ivHours: number
}
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
export function buildHoursReport(input: HoursInput, period: PayPeriod, team: TeamId | null = null, { forecast = false, person: only, persons }: { forecast?: boolean; person?: string; persons?: readonly string[] } = {}): HoursReport {
  const { people, assignments, params, days, interventions, noInt, now } = input
  const chosen = persons?.length ? new Set(persons) : null
  const inTeam = (p: Person | undefined): p is Person => !!p && (!team || p.team === team) && (!only || p.id === only) && (!chosen || chosen.has(p.id))
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
    shifts.push({ person, slot, date: s.date, cat: shiftCategory(s), start: w.start, end: w.end, state: state === 'aperto' ? 'programmato' : state, ivCount: 0, ivHours: 0 })
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
  const shiftOf = new Map(shifts.map((s) => [`${s.slot}|${s.person.id}`, s]))
  for (const o of ivs) {
    const s = shiftOf.get(`${o.iv.slot}|${o.person.id}`)
    if (s) { s.ivCount++; s.ivHours += o.hours }
  }

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

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Periodo libero, date incluse. */
export const rangePeriod = (from: string, to: string): PayPeriod =>
  ({ kind: 'range', key: `${from}_${to}`, from, to, label: `Dal ${dmy(from)} al ${dmy(to)}` })

/** Periodo per esteso, con le date: "Novembre 2026 (dal 01/11/2026 al 30/11/2026)". */
export const periodText = (p: PayPeriod) => (p.kind === 'range' ? p.label : `${p.label} (dal ${dmy(p.from)} al ${dmy(p.to)})`)

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Nome file: AAAAMMGG-ARM-HD2-paghe-ore-<periodo>[-<persona>].<ext> (previsionale: …-previsionale-…);
 * periodo = mese, settimana-<lunedì> oppure daAAAAMMGG_aAAAAMMGG.
 */
export function hoursFileName(period: PayPeriod, now = new Date(), forecast = false, ext: 'xlsx' | 'pdf' | 'zip' = 'xlsx', personName?: string) {
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const when = period.kind === 'month' ? slug(period.label) : period.kind === 'week' ? `settimana-${period.from.replaceAll('-', '')}` : `da${period.from.replaceAll('-', '')}_a${period.to.replaceAll('-', '')}`
  return `${today}-ARM-HD2-${forecast ? 'previsionale' : 'paghe-ore'}-${when}${personName ? `-${slug(personName)}` : ''}.${ext}`
}

/** Fasce orarie CCNL dello straordinario, con l'orario (diurno = fuori dalla fascia notturna). */
export function rateHours(k: RateKey, p: Pick<Params, 'otNightStart' | 'otNightEnd'>) {
  const hh = (h: number) => String(h).padStart(2, '0')
  return k === 'ferNight' || k === 'holNight' ? `${hh(p.otNightStart)}–${hh(p.otNightEnd)}` : `${hh(p.otNightEnd)}–${hh(p.otNightStart)}`
}
const rateTitle = (k: RateKey, p: Params) => `${rateLabel(k, p)} (${rateHours(k, p)})`

const WEEKDAY = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const dateCell = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)))
const stampCell = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)))
/** File Excel senza importi: Riepilogo per persona, Turni di reperibilità, Interventi. */
export async function buildHoursXlsx(x: HoursReport, teams: TeamDir, params: Params): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Piano reperibilità'
  const headFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } }
  const HRS = '0.00'
  type Ws = import('exceljs').Worksheet
  const title = (ws: Ws, text: string) => {
    ws.addRow([text]).font = { bold: true, size: 13 }
    const scope = x.forecast ? 'previsionale: turni di reperibilità effettuati e programmati, interventi solo approvati' : 'solo turni di reperibilità erogati e interventi approvati'
    ws.addRow([`Periodo: ${periodText(x.period)}${x.team ? ` · team ${teamLabel(teams, x.team)}` : ''} · ${scope} · nessun importo · generato il ${new Date().toLocaleString('it-IT')}`]).font = { size: 9, color: { argb: 'FF64748B' } }
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
  const doneLabel = fc ? 'Turni di reperibilità effettuati' : 'Turni di reperibilità'
  header(ws1, ['Persona', 'Email', 'Team', ...SHIFT_CATS.map((c) => `${doneLabel} ${SHIFT_CAT_LABEL[c].toLowerCase()}`), `${doneLabel} totali`,
    ...(fc ? [...SHIFT_CATS.map((c) => `Turni di reperibilità programmati ${SHIFT_CAT_LABEL[c].toLowerCase()}`), 'Turni di reperibilità programmati totali'] : []), 'Interventi',
    ...RATE_KEYS.map((k) => `Ore riconosciute ${rateTitle(k, params).toLowerCase()}`), 'Ore riconosciute totali',
    'Ore effettive totali', ...BANDS.map((b) => `Ore effettive ${BAND_LABEL[b].toLowerCase()}`)])
  for (const r of people) {
    ws1.addRow([...who(r.person), ...SHIFT_CATS.map((c) => r.shifts[c]), r.totalShifts,
      ...(fc ? [...SHIFT_CATS.map((c) => r.planned[c]), r.totalPlanned] : []), r.interventions,
      ...RATE_KEYS.map((k) => r.byRate[k] / 60), r.hours, r.minutes / 60, ...BANDS.map((b) => r.effective[b] / 60)])
  }
  total(ws1, ['Totale', '', '', ...SHIFT_CATS.map((c) => sumBy(people, (r) => r.shifts[c])), done,
    ...(fc ? [...SHIFT_CATS.map((c) => sumBy(people, (r) => r.planned[c])), shifts.length - done] : []), ivs.length,
    ...RATE_KEYS.map((k) => sumBy(people, (r) => r.byRate[k]) / 60), sumBy(people, (r) => r.hours),
    sumBy(people, (r) => r.minutes) / 60, ...BANDS.map((b) => sumBy(people, (r) => r.effective[b]) / 60)])
  const catCols = () => [...SHIFT_CATS.map(() => ({ width: 13 })), { width: 11 }]
  ws1.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, ...catCols(), ...(fc ? catCols() : []), { width: 11 },
    ...RATE_KEYS.map(() => ({ width: 15, style: { numFmt: HRS } })), { width: 13, style: { numFmt: HRS } },
    { width: 12, style: { numFmt: HRS } }, ...BANDS.map(() => ({ width: 13, style: { numFmt: HRS } }))]

  // 2. Reperibilità: un turno per riga, con il tipo di gettone
  const ws2 = wb.addWorksheet('Turni di reperibilità')
  title(ws2, `Reperibilità ${fc ? 'effettuate e programmate' : 'effettuate (giorni erogati)'}: tipo di gettone per turno (giorno di riferimento = giorno di inizio)`)
  header(ws2, ['Persona', 'Email', 'Team', 'Giorno di riferimento', 'Giorno', 'Tipo di gettone', 'Inizio', 'Fine', 'Stato', 'Interventi approvati', 'Ore riconosciute'])
  const byPersonDate = [...shifts].sort((a, b) => a.person.name.localeCompare(b.person.name, 'it') || a.slot.localeCompare(b.slot))
  for (const s of byPersonDate) {
    ws2.addRow([...who(s.person), dateCell(s.date), WEEKDAY[weekday(s.date)], SHIFT_CAT_LABEL[s.cat], stampCell(s.start), stampCell(s.end), STATE_LABEL[s.state], s.ivCount, s.ivHours])
  }
  total(ws2, ['Totale', '', '', '', '', fc ? `${plural(done, 'effettuato', 'effettuati')}, ${plural(shifts.length - done, 'programmato', 'programmati')}` : plural(shifts.length, 'turno', 'turni'), '', '', '',
    sumBy(shifts, (s) => s.ivCount), sumBy(shifts, (s) => s.ivHours)])
  ws2.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, { width: 14, style: { numFmt: 'dd/mm/yyyy' } }, { width: 11 }, { width: 26 },
    { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { width: 14 }, { width: 11 }, { width: 11 }]

  // 3. Interventi
  const ws3 = wb.addWorksheet('Interventi')
  title(ws3, 'Interventi approvati: ore riconosciute per fascia CCNL e durata effettiva per fascia')
  header(ws3, ['Persona', 'Email', 'Team', 'Giorno del turno', 'Categoria del turno', 'Inizio', 'Fine',
    ...RATE_KEYS.map((k) => `Ore riconosciute ${rateTitle(k, params).toLowerCase()}`), 'Ore riconosciute totali',
    'Durata effettiva (min)', ...BANDS.map((b) => `Minuti effettivi ${BAND_LABEL[b].toLowerCase()}`), 'Nota'])
  for (const o of ivs) {
    ws3.addRow([...who(o.person), dateCell(o.date), SHIFT_CAT_LABEL[o.cat], stampCell(o.iv.start), stampCell(o.iv.end),
      ...RATE_KEYS.map((k) => o.byRate[k] / 60), o.hours, o.minutes, ...BANDS.map((b) => o.effective[b]), o.iv.note ?? ''])
  }
  total(ws3, ['Totale', '', '', '', plural(ivs.length, 'intervento', 'interventi'), '', '',
    ...RATE_KEYS.map((k) => sumBy(ivs, (o) => o.byRate[k]) / 60), sumBy(ivs, (o) => o.hours),
    sumBy(ivs, (o) => o.minutes), ...BANDS.map((b) => sumBy(ivs, (o) => o.effective[b])), ''])
  ws3.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, { width: 13, style: { numFmt: 'dd/mm/yyyy' } }, { width: 24 },
    { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
    ...RATE_KEYS.map(() => ({ width: 15, style: { numFmt: HRS } })), { width: 12 },
    { width: 11 }, ...BANDS.map(() => ({ width: 12 })), { width: 40 }]

  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }]
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

/* ---------- PDF ---------- */

const SHORT_CAT: Record<ShiftCat, string> = { FN: 'Feriale notturno', SAT_D: 'Sabato diurno', SAT_N: 'Sabato notturno', HOL_D: 'Dom./festivo diurno', HOL_N: 'Dom./festivo notturno' }
const hm = (s: string) => s.slice(11, 16)
const dmyShort = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const hrs = (min: number) => (min > 0 ? fmtMinutes(min) : '–')

/**
 * PDF A4 orizzontale senza importi: riepilogo di tutti (se più persone), poi per ogni persona le sue
 * reperibilità (tipo di gettone) e i suoi interventi con le ore riconosciute per fascia CCNL.
 */
export async function buildHoursPdf(x: HoursReport, teams: TeamDir, params: Params): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  type RGB = [number, number, number]
  const BLUE: RGB = [29, 78, 216], SLATE: RGB = [100, 116, 139], INK: RGB = [15, 23, 42], AMBER: RGB = [180, 83, 9], SKY: RGB = [3, 105, 161]
  const fc = x.forecast
  const generated = new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
  const scope = fc ? 'previsionale: reperibilità effettuate e programmate, interventi solo effettuati e approvati' : 'reperibilità effettuate (giorni erogati) e interventi approvati'
  const teamText = x.team ? ` · team ${teamLabel(teams, x.team)}` : ''
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 30
  const base = {
    theme: 'grid' as const,
    styles: { fontSize: 8, cellPadding: 1.5, lineColor: [203, 213, 225] as RGB, lineWidth: 0.15, textColor: INK, valign: 'middle' as const },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' as const, fontSize: 7.5 },
    footStyles: { fillColor: [241, 245, 249] as RGB, textColor: INK, fontStyle: 'bold' as const },
    margin: { left: 14, right: 14, top: 26, bottom: 14 },
  }
  const header = (title: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...INK)
    doc.text(title, 14, 15)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SLATE)
    doc.text(`Periodo: ${periodText(x.period)}${teamText} · ${scope} · nessun importo`, 14, 20.5)
  }
  const catCell = (done: number, planned: number) => (fc && planned ? `${done} (+${planned})` : done ? String(done) : '–')
  const catHead = SHIFT_CATS.map((c) => SHORT_CAT[c])
  const rateHead = RATE_KEYS.map((k) => `${rateLabel(k, params)}\n${rateHours(k, params)}`)
  const right = (from: number, n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [from + i, { halign: 'right' as const }]))

  // 1. Riepilogo di tutti (solo se le persone sono più di una)
  const single = x.people.length === 1
  if (!single) {
    header('Piano reperibilità - ARM · Riepilogo reperibilità e interventi')
    let y = 25
    doc.setFontSize(8)
    for (const n of x.notes) { doc.setTextColor(...AMBER); doc.text(n, 14, y); y += 4 }
    if (fc) { doc.setTextColor(...SKY); doc.text('Tra parentesi (+N) le reperibilità programmate nel calendario e non ancora erogate.', 14, y); y += 4 }
    const sum = (f: (r: HoursPerson) => number) => x.people.reduce((t, r) => t + f(r), 0)
    autoTable(doc, {
      ...base, startY: y + 1,
      head: [['Persona', 'Team', ...catHead, 'Turni di reperibilità', 'Interventi', ...rateHead, 'Ore riconosciute']],
      body: x.people.map((r) => [r.person.name, teamLabel(teams, r.person.team), ...SHIFT_CATS.map((c) => catCell(r.shifts[c], r.planned[c])), catCell(r.totalShifts, r.totalPlanned),
        r.interventions || '–', ...RATE_KEYS.map((k) => hrs(r.byRate[k])), r.hours ? `${r.hours} h` : '–']),
      foot: [['Totale', '', ...SHIFT_CATS.map((c) => catCell(sum((r) => r.shifts[c]), sum((r) => r.planned[c]))), catCell(sum((r) => r.totalShifts), sum((r) => r.totalPlanned)),
        sum((r) => r.interventions), ...RATE_KEYS.map((k) => hrs(sum((r) => r.byRate[k]))), `${sum((r) => r.hours)} h`]],
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, ...right(2, SHIFT_CATS.length + 2 + RATE_KEYS.length + 1) },
      didParseCell: (d) => { if (d.section === 'foot' && d.column.index >= 2) d.cell.styles.halign = 'right' },
    })
  }

  // 2. Una sezione per persona
  x.people.forEach((r, i) => {
    if (!single || i > 0) doc.addPage()
    header(`${r.person.name} · reperibilità e interventi`)
    doc.setFontSize(9); doc.setTextColor(...INK)
    doc.text(`${teamLabel(teams, r.person.team)}${r.person.email ? ` · ${r.person.email}` : ''}`, 14, 25)
    autoTable(doc, {
      ...base, startY: 28,
      head: [[...catHead, 'Turni di reperibilità', 'Interventi', ...rateHead, 'Ore riconosciute']],
      body: [[...SHIFT_CATS.map((c) => catCell(r.shifts[c], r.planned[c])), catCell(r.totalShifts, r.totalPlanned), r.interventions || '–',
        ...RATE_KEYS.map((k) => hrs(r.byRate[k])), r.hours ? `${r.hours} h` : '–']],
      columnStyles: right(0, SHIFT_CATS.length + 2 + RATE_KEYS.length + 1),
    })

    const sh = x.shifts.filter((s) => s.person.id === r.person.id)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK)
    doc.text(`Turni di reperibilità (${sh.length})`, 14, lastY() + 7)
    doc.setFont('helvetica', 'normal')
    autoTable(doc, {
      ...base, startY: lastY() + 9,
      head: [['Giorno di riferimento', 'Giorno', 'Tipo di gettone', 'Inizio', 'Fine', 'Stato', 'Interventi', 'Ore riconosciute']],
      body: sh.map((s) => [dmy(s.date), WEEKDAY[weekday(s.date)], SHIFT_CAT_LABEL[s.cat], `${dmyShort(s.start)} ${hm(s.start)}`, `${dmyShort(s.end)} ${hm(s.end)}`,
        s.state === 'programmato' ? 'Programmato' : s.state === 'consuntivato' ? 'Consuntivato' : 'Erogato', s.ivCount || '–', s.ivHours ? `${s.ivHours} h` : '–']),
      columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' } },
      didParseCell: (d) => { if (d.section === 'body' && sh[d.row.index]?.state === 'programmato') { d.cell.styles.textColor = SKY; d.cell.styles.fontStyle = 'italic' } },
    })

    const ov = x.interventions.filter((o) => o.person.id === r.person.id)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK)
    doc.text(`Interventi approvati (${ov.length})`, 14, lastY() + 7)
    doc.setFont('helvetica', 'normal')
    if (!ov.length) {
      doc.setFontSize(8.5); doc.setTextColor(...SLATE)
      doc.text('Nessun intervento approvato nel periodo.', 14, lastY() + 12)
      return
    }
    autoTable(doc, {
      ...base, startY: lastY() + 9,
      head: [['Turno', 'Orario', 'Durata effettiva per fascia', ...rateHead, 'Ore riconosciute', 'Nota']],
      body: ov.map((o) => [`${dmy(o.date)} · ${SHIFT_CAT_LABEL[o.cat]}`, `${dmyShort(o.iv.start)} ${hm(o.iv.start)} – ${o.iv.end.slice(0, 10) === o.iv.start.slice(0, 10) ? '' : `${dmyShort(o.iv.end)} `}${hm(o.iv.end)}`,
        `${fmtMinutes(o.minutes)}: ${BANDS.filter((b) => o.effective[b] > 0).map((b) => `${fmtMinutes(o.effective[b])} ${BAND_LABEL[b].toLowerCase()}`).join(', ')}`,
        ...RATE_KEYS.map((k) => hrs(o.byRate[k])), `${o.hours} h`, o.iv.note ?? '']),
      columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 30 }, 2: { cellWidth: 46 }, ...right(3, RATE_KEYS.length + 1), [RATE_KEYS.length + 4]: { cellWidth: 40 } },
    })
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE)
    doc.text(`Piano reperibilità - ARM · nessun importo · generato il ${generated}`, 14, 203)
    doc.text(`Pagina ${i} di ${pages}`, 283, 203, { align: 'right' })
  }
  return doc.output('arraybuffer')
}

/** Archivio ZIP con un file per persona. */
export async function zipFiles(files: { name: string; data: ArrayBuffer }[]): Promise<Uint8Array<ArrayBuffer>> {
  const { zipSync } = await import('fflate')
  return zipSync(Object.fromEntries(files.map((f) => [f.name, new Uint8Array(f.data)])), { level: 6 }) as Uint8Array<ArrayBuffer>
}
