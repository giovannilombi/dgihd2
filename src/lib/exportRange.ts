import { HORIZON_END, HORIZON_START, daysInRange, fmtDay, monthKey, monthLabel } from './calendar'

/** Periodo da esportare (date incluse, formato YYYY-MM-DD). */
export interface ExportRange {
  from: string
  to: string
}

export const FULL_RANGE: ExportRange = { from: HORIZON_START, to: HORIZON_END }
export const inRange = (date: string, r?: ExportRange) => !r || (date >= r.from && date <= r.to)

/** Mesi scaricabili: quelli del periodo pianificato. */
export function exportableMonths() {
  const months = [...new Set(daysInRange().map(monthKey))]
  return months.map((key) => {
    const days = daysInRange().filter((d) => monthKey(d) === key)
    return { key, label: monthLabel(key), from: days[0], to: days[days.length - 1] }
  })
}

const compact = (iso: string) => iso.replaceAll('-', '')
const todayCompact = (now: Date) =>
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

/** Nome file: AAAAMMGG-ARM-HD2-daAAAAMMGG_aAAAAMMGG.ext (data di esportazione, inizio e fine periodo). */
export const exportFileName = (ext: string, r: ExportRange, now = new Date()) =>
  `${todayCompact(now)}-ARM-HD2-da${compact(r.from)}_a${compact(r.to)}.${ext}`

export const rangeText = (r: ExportRange) => `dal ${fmtDay(r.from)} al ${fmtDay(r.to)} 2026`

/** Controllo dei campi Dal/Al: restituisce un messaggio d'errore oppure undefined. */
export function validateRange(r: ExportRange): string | undefined {
  if (!r.from || !r.to) return 'Indica la data di inizio e di fine.'
  if (r.to < r.from) return 'La data di fine è precedente a quella di inizio.'
  if (r.from < HORIZON_START || r.to > HORIZON_END) return `Le date devono essere comprese nel periodo pianificato (${fmtDay(HORIZON_START)} – ${fmtDay(HORIZON_END)} 2026).`
  return undefined
}
