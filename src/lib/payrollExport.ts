import { HORIZON_END, HORIZON_START, SLOT_BY_ID, addDays, daysInRange, fmtDayYear, isoWeekNumber, monthKey, monthLabel, weekStart } from './calendar'
import type { DayStatusMap } from './dayStatus'
import { payRal, type Intervention } from './interventions'
import { personOvertime, RATE_KEYS, rateLabel, rateOf, type RateKey } from './overtime'
import { slotEcon, type NdData } from './reports'
import { teamLabel, type TeamDir } from './teams'
import type { Assignments, Params, Person, SlotKind } from './types'

/** Periodo dell'export per le paghe: un mese di calendario o una settimana (lunedì–domenica). */
export interface PayPeriod { kind: 'month' | 'week'; key: string; from: string; to: string; label: string }

export function payPeriods(): { months: PayPeriod[]; weeks: PayPeriod[] } {
  const days = daysInRange()
  const months = [...new Set(days.map(monthKey))].map((key) => {
    const ds = days.filter((d) => monthKey(d) === key)
    return { kind: 'month' as const, key, from: ds[0], to: ds[ds.length - 1], label: monthLabel(key) }
  })
  const weeks: PayPeriod[] = []
  for (let w = weekStart(HORIZON_START); w <= HORIZON_END; w = addDays(w, 7)) {
    const to = addDays(w, 6)
    weeks.push({ kind: 'week', key: w, from: w, to, label: `Settimana ${isoWeekNumber(w)}: ${fmtDayYear(w)} – ${fmtDayYear(to)}` })
  }
  return { months, weeks }
}

export const KIND_LABEL: Record<SlotKind, string> = { FN: 'Notte feriale (18–09)', WD: 'Diurno weekend/festivo (09–18)', WN: 'Notte weekend/festivo (18–09)' }

export interface ShiftLine { person: Person; date: string; week: string; slot: string; kind: SlotKind; iccnl: number; gettone: number }
export interface OvertimeLine {
  person: Person; iv: Intervention; date: string; week: string; minutes: number; hours: number
  byRate: Record<RateKey, number>; amount: number | null; callFee: number; total: number | null; note: string
}
export interface SummaryLine {
  person: Person; shifts: number; iccnl: number; gettone: number
  otHours: number; otAmount: number | null; calls: number; callFees: number; total: number | null; note: string
}
export interface PayrollExport {
  period: PayPeriod
  shifts: ShiftLine[]
  overtime: OvertimeLine[]
  summary: SummaryLine[]
  /** Avvisi da riportare nel file (persone escluse, importi non calcolabili) */
  notes: string[]
}

export interface PayrollInput {
  people: Person[]
  assignments: Assignments
  params: Params
  nd?: NdData
  days: DayStatusMap
  interventions: Intervention[]
  /** Importi degli interventi visibili per la persona (HR, Governance, director del team) */
  showAmounts: (p: Person) => boolean
}

/** Importi al centesimo riga per riga: i totali tornano con le buste paga */
const r2 = (n: number) => Math.round(n * 100) / 100
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const noAmountNote = (p: Person, visible: boolean) =>
  !visible ? 'Importo non visibile per il tuo livello: solo ore' : p.ralNd ? 'RAL Q/: inserire la RAL puntuale per l\'importo' : 'RAL da inserire: solo ore'

/**
 * Dati per l'ufficio paghe nel periodo: solo turni dei giorni erogati e interventi approvati.
 * Le persone di cui l'utente non vede la RAL (altri team) restano fuori dai fogli economici.
 */
export function buildPayroll(input: PayrollInput, period: PayPeriod): PayrollExport {
  const { people, assignments, params, nd, days, interventions, showAmounts } = input
  const byId = new Map(people.map((p) => [p.id, p]))
  const inPeriod = (d: string) => d >= period.from && d <= period.to
  const notes: string[] = []
  const hidden = new Set<string>()
  const pendingNd = new Set<string>()

  const shifts: ShiftLine[] = []
  for (const [slot, pid] of Object.entries(assignments).sort(([a], [b]) => a.localeCompare(b))) {
    const s = SLOT_BY_ID[slot]
    const person = byId.get(pid)
    if (!s || !person || !inPeriod(s.date) || !days[s.date]) continue
    if (person.salaryHidden) { hidden.add(person.id); continue }
    const e = slotEcon(person, s, params, nd)
    if (!e) { pendingNd.add(person.name); continue }
    shifts.push({ person, date: s.date, week: weekStart(s.date), slot, kind: s.kind, iccnl: r2(e.iccnl), gettone: r2(e.lcomp) })
  }

  const overtime: OvertimeLine[] = []
  for (const person of people) {
    const approved = interventions.filter((x) => x.personId === person.id && x.status === 'approved')
    if (!approved.some((x) => inPeriod(x.slot.slice(0, 10)))) continue
    if (person.salaryHidden) { hidden.add(person.id); continue }
    const visible = showAmounts(person)
    // calcolo su tutti gli interventi approvati della persona: le prime ore feriali diurne si contano per giorno
    const ot = personOvertime(approved, visible ? payRal(person) : null, params)
    for (const item of ot.items) {
      const iv = approved.find((x) => x.id === item.id)!
      if (!inPeriod(iv.slot.slice(0, 10))) continue
      const amount = item.amount === null ? null : r2(item.amount)
      overtime.push({
        person, iv, date: iv.slot.slice(0, 10), week: weekStart(iv.slot.slice(0, 10)), minutes: item.minutes, hours: item.hours, byRate: item.byRate,
        amount, callFee: params.callFee, total: amount === null ? null : r2(amount + params.callFee),
        note: item.amount === null ? noAmountNote(person, visible) : '',
      })
    }
  }
  overtime.sort((a, b) => a.person.name.localeCompare(b.person.name, 'it') || a.iv.start.localeCompare(b.iv.start))

  const ids = [...new Set([...shifts.map((x) => x.person.id), ...overtime.map((x) => x.person.id)])]
  const summary: SummaryLine[] = ids.map((id) => {
    const person = byId.get(id)!
    const sh = shifts.filter((x) => x.person.id === id)
    const ov = overtime.filter((x) => x.person.id === id)
    const iccnl = r2(sh.reduce((t, x) => t + x.iccnl, 0))
    const gettone = r2(sh.reduce((t, x) => t + x.gettone, 0))
    const otAmount = ov.some((x) => x.amount === null) ? null : r2(ov.reduce((t, x) => t + (x.amount ?? 0), 0))
    const callFees = ov.reduce((t, x) => t + x.callFee, 0)
    return {
      person, shifts: sh.length, iccnl, gettone, otHours: ov.reduce((t, x) => t + x.hours, 0), otAmount, calls: ov.length, callFees,
      total: otAmount === null ? null : r2(iccnl + gettone + otAmount + callFees),
      note: otAmount === null ? ov.find((x) => x.note)?.note ?? '' : '',
    }
  }).sort((a, b) => a.person.name.localeCompare(b.person.name, 'it'))

  if (hidden.size) notes.push(`${hidden.size} ${hidden.size === 1 ? 'persona di un altro team esclusa' : 'persone di altri team escluse'}: RAL non visibile con il tuo team.`)
  if (pendingNd.size) notes.push(`Importi non ancora calcolati dal server per: ${[...pendingNd].join(', ')} (RAL Q/). Riprova tra qualche secondo.`)
  return { period, shifts, overtime, summary, notes }
}

/** Nome file: AAAAMMGG-ARM-HD2-paghe-<mese o settimana>.xlsx */
export function payrollFileName(period: PayPeriod, now = new Date()) {
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `${today}-ARM-HD2-paghe-${period.kind === 'month' ? period.label.toLowerCase().replace(/\s+/g, '-') : `settimana-${period.from.replaceAll('-', '')}`}.xlsx`
}

const dateCell = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)))
const stampCell = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)))

/** File Excel con 4 fogli: Reperibilità CCNL, Gettoni integrativi, Straordinario per interventi, Riepilogo paghe. */
export async function buildPayrollXlsx(x: PayrollExport, teams: TeamDir, params: Params): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Piano reperibilità'
  const headFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } }
  const EUR = '#,##0.00 "€"'
  const HRS = '0.00'
  const title = (ws: import('exceljs').Worksheet, text: string, cols: number) => {
    ws.addRow([text]).font = { bold: true, size: 13 }
    ws.addRow([`${x.period.label} · solo turni erogati e interventi approvati · generato il ${new Date().toLocaleString('it-IT')}`]).font = { size: 9, color: { argb: 'FF64748B' } }
    for (const n of x.notes) ws.addRow([n]).font = { size: 9, color: { argb: 'FFB45309' } }
    ws.addRow([])
    void cols
  }
  const header = (ws: import('exceljs').Worksheet, labels: string[]) => {
    const r = ws.addRow(labels)
    r.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = headFill; c.alignment = { vertical: 'middle', wrapText: true } })
    r.height = 30
    ws.views = [{ state: 'frozen', ySplit: r.number }]
    return r.number
  }
  const total = (ws: import('exceljs').Worksheet, values: (string | number | null)[]) => {
    const r = ws.addRow(values)
    r.font = { bold: true }
    r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } } })
  }
  const who = (p: Person) => [p.name, p.email ?? '', teamLabel(teams, p.team)]
  const sum = (a: (number | null)[]) => (a.some((v) => v === null) ? null : r2(a.reduce<number>((t, v) => t + (v ?? 0), 0)))

  // 1. Reperibilità CCNL
  const ws1 = wb.addWorksheet('Reperibilità CCNL')
  title(ws1, 'Indennità di reperibilità CCNL (lorda) per turno erogato', 8)
  header(ws1, ['Persona', 'Email', 'Team', 'Livello', 'Settimana (lun)', 'Data', 'Turno', 'Indennità CCNL lorda'])
  for (const s of x.shifts) ws1.addRow([...who(s.person), s.person.level, dateCell(s.week), dateCell(s.date), KIND_LABEL[s.kind], s.iccnl])
  total(ws1, ['Totale', '', '', '', '', '', plural(x.shifts.length, 'turno', 'turni'), r2(x.shifts.reduce((t, s) => t + s.iccnl, 0))])
  ws1.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, { width: 8 }, { width: 13, style: { numFmt: 'dd/mm/yyyy' } }, { width: 12, style: { numFmt: 'dd/mm/yyyy' } }, { width: 30 }, { width: 16, style: { numFmt: EUR } }]

  // 2. Gettoni integrativi
  const ws2 = wb.addWorksheet('Gettoni integrativi')
  title(ws2, 'Gettone integrativo di reperibilità (lordo, voce dedicata) per turno erogato', 7)
  header(ws2, ['Persona', 'Email', 'Team', 'Settimana (lun)', 'Data', 'Turno', 'Gettone integrativo lordo'])
  for (const s of x.shifts) ws2.addRow([...who(s.person), dateCell(s.week), dateCell(s.date), KIND_LABEL[s.kind], s.gettone])
  total(ws2, ['Totale', '', '', '', '', plural(x.shifts.length, 'turno', 'turni'), r2(x.shifts.reduce((t, s) => t + s.gettone, 0))])
  ws2.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, { width: 13, style: { numFmt: 'dd/mm/yyyy' } }, { width: 12, style: { numFmt: 'dd/mm/yyyy' } }, { width: 30 }, { width: 18, style: { numFmt: EUR } }]

  // 3. Straordinario per interventi
  const ws3 = wb.addWorksheet('Straordinario per interventi')
  title(ws3, 'Interventi approvati: straordinario CCNL per fascia (ore riconosciute) e compenso per chiamata', 18)
  header(ws3, ['Persona', 'Email', 'Team', 'Data turno', 'Turno', 'Inizio', 'Fine', 'Durata (min)', 'Ore riconosciute',
    ...RATE_KEYS.map((k) => `${rateLabel(k, params)} (+${Math.round(rateOf(k, params) * 1000) / 10}%) ore`),
    'Straordinario lordo', 'Compenso chiamata', 'Totale', 'Nota'])
  for (const o of x.overtime) {
    ws3.addRow([...who(o.person), dateCell(o.date), KIND_LABEL[SLOT_BY_ID[o.iv.slot].kind], stampCell(o.iv.start), stampCell(o.iv.end), o.minutes, o.hours,
      ...RATE_KEYS.map((k) => o.byRate[k] / 60), o.amount, o.callFee, o.total, [o.note, o.iv.note].filter(Boolean).join(' · ')])
  }
  total(ws3, ['Totale', '', '', '', plural(x.overtime.length, 'intervento', 'interventi'), '', '', x.overtime.reduce((t, o) => t + o.minutes, 0), x.overtime.reduce((t, o) => t + o.hours, 0),
    ...RATE_KEYS.map((k) => x.overtime.reduce((t, o) => t + o.byRate[k] / 60, 0)), sum(x.overtime.map((o) => o.amount)), r2(x.overtime.reduce((t, o) => t + o.callFee, 0)), sum(x.overtime.map((o) => o.total)), ''])
  ws3.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, { width: 12, style: { numFmt: 'dd/mm/yyyy' } }, { width: 28 }, { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { width: 16, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
    { width: 10 }, { width: 10, style: { numFmt: HRS } }, ...RATE_KEYS.map(() => ({ width: 14, style: { numFmt: HRS } })), { width: 15, style: { numFmt: EUR } }, { width: 13, style: { numFmt: EUR } }, { width: 14, style: { numFmt: EUR } }, { width: 40 }]

  // 4. Riepilogo paghe
  const ws4 = wb.addWorksheet('Riepilogo paghe')
  title(ws4, 'Riepilogo per le paghe: una riga per persona', 12)
  header(ws4, ['Persona', 'Email', 'Team', 'Turni erogati', 'Indennità CCNL', 'Gettone integrativo', 'Ore straordinario', 'Straordinario', 'Chiamate', 'Compensi chiamata (esclusi dal TFR)', 'Totale lordo', 'Note'])
  for (const s of x.summary) ws4.addRow([...who(s.person), s.shifts, s.iccnl, s.gettone, s.otHours, s.otAmount, s.calls, s.callFees, s.total, s.note])
  total(ws4, ['Totale', '', '', x.summary.reduce((t, s) => t + s.shifts, 0), r2(x.summary.reduce((t, s) => t + s.iccnl, 0)), r2(x.summary.reduce((t, s) => t + s.gettone, 0)),
    x.summary.reduce((t, s) => t + s.otHours, 0), sum(x.summary.map((s) => s.otAmount)), x.summary.reduce((t, s) => t + s.calls, 0), r2(x.summary.reduce((t, s) => t + s.callFees, 0)), sum(x.summary.map((s) => s.total)), ''])
  ws4.columns = [{ width: 26 }, { width: 32 }, { width: 12 }, { width: 10 }, { width: 14, style: { numFmt: EUR } }, { width: 16, style: { numFmt: EUR } }, { width: 12, style: { numFmt: HRS } },
    { width: 14, style: { numFmt: EUR } }, { width: 9 }, { width: 18, style: { numFmt: EUR } }, { width: 14, style: { numFmt: EUR } }, { width: 44 }]
  const legend = [
    'Indennità CCNL e gettone: solo turni dei giorni erogati. Straordinario: solo interventi approvati, maggiorazioni CCNL per fascia sulla paga oraria stimata (RAL ÷ ' + params.hourlyDivisor + ').',
    `Compenso di ${params.callFee.toLocaleString('it-IT', { minimumFractionDigits: 2 })} € per ogni chiamata seguita da intervento effettivo (art. 6 CCNL), escluso dalla base del TFR.`,
    'Persone con RAL Q/ o non inserita: solo ore, l\'importo dello straordinario richiede la RAL puntuale.',
  ]
  ws4.addRow([])
  for (const l of legend) ws4.addRow([l]).font = { size: 9, color: { argb: 'FF475569' } }
  wb.views = [{ activeTab: 3, x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, visibility: 'visible' }]
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}
