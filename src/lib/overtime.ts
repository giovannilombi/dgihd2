import { HOLIDAYS, SLOT_BY_ID, addDays, weekday } from './calendar'
import type { Params } from './types'

/**
 * Straordinari per interventi in reperibilità (CCNL Metalmeccanici Industria, art. 6 e 7, non turnisti).
 * Orari in ora italiana, testo 'YYYY-MM-DDTHH:MM'. Regole:
 * - ore riconosciute per intervento: ore intere, minimo `otMinHours`; i minuti oltre l'ora contano solo se
 *   superano la tolleranza (con 10': 1h10 → 1 ora, 1h11 → 2 ore);
 * - i minuti si dividono per fascia (feriale/festivo × diurno/notturno) secondo il giorno di calendario del
 *   minuto lavorato; l'arrotondamento va nella fascia in cui l'intervento finisce;
 * - feriale diurno: le prime `otDayFirstHours` ore del giorno (sommando gli interventi del giorno in ordine
 *   di orario) a `otDayFirst`, le successive a `otDayNext`; sabato feriale, domeniche e festività festive;
 * - importo = ore × paga oraria (RAL ÷ divisore) × (1 + maggiorazione), più `callFee` per ogni chiamata.
 */
export type Band = 'ferDay' | 'ferNight' | 'holDay' | 'holNight'
export const BANDS: Band[] = ['ferDay', 'ferNight', 'holDay', 'holNight']
export const BAND_LABEL: Record<Band, string> = { ferDay: 'Feriale diurno', ferNight: 'Notturno feriale', holDay: 'Festivo diurno', holNight: 'Festivo notturno' }
/** Voci di paga: il feriale diurno si divide tra prime ore del giorno e successive. */
export type RateKey = 'ferDay1' | 'ferDay2' | 'ferNight' | 'holDay' | 'holNight'
export const RATE_KEYS: RateKey[] = ['ferDay1', 'ferDay2', 'ferNight', 'holDay', 'holNight']
export const rateOf = (k: RateKey, p: Params) =>
  k === 'ferDay1' ? p.otDayFirst : k === 'ferDay2' ? p.otDayNext : k === 'ferNight' ? p.otNight : k === 'holDay' ? p.otHoliday : p.otHolidayNight
export const rateLabel = (k: RateKey, p: Params) =>
  k === 'ferDay1' ? `Feriale diurno, prime ${p.otDayFirstHours} h` : k === 'ferDay2' ? 'Feriale diurno, ore successive' : BAND_LABEL[k]

export interface Interval { id: string; start: string; end: string }

const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
/** Minuti dall'epoca, leggendo l'orario come ora "da parete" (nessun fuso). */
export function stampToMin(s: string): number {
  const m = STAMP.exec(s)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000
}
export function minToStamp(min: number): string {
  return new Date(min * 60000).toISOString().slice(0, 16)
}

export const isFestiveDate = (date: string) => weekday(date) === 0 || date in HOLIDAYS
const isNightHour = (h: number, p: Params) =>
  p.otNightStart > p.otNightEnd ? h >= p.otNightStart || h < p.otNightEnd : h >= p.otNightStart && h < p.otNightEnd

export function bandAt(stamp: string, p: Params): Band {
  const festive = isFestiveDate(stamp.slice(0, 10))
  const night = isNightHour(Number(stamp.slice(11, 13)), p)
  return festive ? (night ? 'holNight' : 'holDay') : night ? 'ferNight' : 'ferDay'
}

/** Ore riconosciute per un intervento di `minutes` minuti effettivi. */
export function recognizedHours(minutes: number, p: Params): number {
  if (!(minutes > 0)) return 0
  const h = Math.floor(minutes / 60)
  const rounded = minutes % 60 > p.otToleranceMin ? h + 1 : h
  return Math.max(p.otMinHours, rounded)
}

/** Minuti riconosciuti di un intervento in un giorno di calendario e in una fascia. */
export interface Piece { date: string; band: Band; minutes: number }

export interface InterventionCalc {
  id: string
  /** Minuti effettivi */
  minutes: number
  /** Ore riconosciute (arrotondate, con il minimo) */
  hours: number
  /** Minuti riconosciuti per giorno e fascia, in ordine di orario */
  pieces: Piece[]
  /** Minuti riconosciuti per fascia */
  byBand: Record<Band, number>
}

export function splitIntervention(iv: Interval, p: Params): InterventionCalc {
  const a = stampToMin(iv.start), b = stampToMin(iv.end)
  const minutes = Number.isFinite(a) && Number.isFinite(b) && b > a ? b - a : 0
  const hours = recognizedHours(minutes, p)
  const acc = new Map<string, Piece>()
  for (let t = a; t < a + minutes; t++) {
    const stamp = minToStamp(t)
    const band = bandAt(stamp, p)
    const key = `${stamp.slice(0, 10)}|${band}`
    const piece = acc.get(key)
    if (piece) piece.minutes++
    else acc.set(key, { date: stamp.slice(0, 10), band, minutes: 1 })
  }
  const pieces = [...acc.values()]
  // Arrotondamento nella fascia in cui l'intervento finisce (se si arrotonda per difetto, si toglie da lì
  // e, se non basta, dalle fasce precedenti)
  let diff = Math.round(hours * 60) - minutes
  if (pieces.length) {
    if (diff > 0) pieces[pieces.length - 1].minutes += diff
    for (let i = pieces.length - 1; diff < 0 && i >= 0; i--) {
      const take = Math.min(pieces[i].minutes, -diff)
      pieces[i].minutes -= take
      diff += take
    }
  }
  const kept = pieces.filter((x) => x.minutes > 0)
  const byBand = Object.fromEntries(BANDS.map((k) => [k, 0])) as Record<Band, number>
  for (const x of kept) byBand[x.band] += x.minutes
  return { id: iv.id, minutes, hours, pieces: kept, byBand }
}

export interface PaidIntervention extends InterventionCalc {
  /** Minuti per voce di paga (feriale diurno diviso tra prime ore del giorno e successive) */
  byRate: Record<RateKey, number>
  /** Importo dello straordinario (senza compenso per chiamata); null se la paga oraria non è nota */
  amount: number | null
}

export interface PersonOvertime {
  items: PaidIntervention[]
  /** Minuti per voce di paga */
  byRate: Record<RateKey, number>
  /** Ore riconosciute */
  hours: number
  /** Chiamate seguite da intervento effettivo */
  calls: number
  amount: number | null
  callFees: number
  total: number | null
}

const zeroRates = () => Object.fromEntries(RATE_KEYS.map((k) => [k, 0])) as Record<RateKey, number>

/**
 * Straordinario di una persona per un insieme di interventi (di solito gli approvati), in ordine di orario.
 * `ral` null o 0 = paga oraria non nota (RAL da inserire o RAL Q/): solo ore, nessun importo.
 */
export function personOvertime(ivs: Interval[], ral: number | null, p: Params): PersonOvertime {
  const hourly = ral && ral > 0 && p.hourlyDivisor > 0 ? ral / p.hourlyDivisor : null
  const quota = Math.round(p.otDayFirstHours * 60)
  const used = new Map<string, number>()
  const byRate = zeroRates()
  const items: PaidIntervention[] = [...ivs].sort((x, y) => x.start.localeCompare(y.start)).map((iv) => {
    const calc = splitIntervention(iv, p)
    const rates = zeroRates()
    for (const piece of calc.pieces) {
      if (piece.band !== 'ferDay') { rates[piece.band] += piece.minutes; continue }
      const u = used.get(piece.date) ?? 0
      const first = Math.max(0, Math.min(piece.minutes, quota - u))
      used.set(piece.date, u + first)
      rates.ferDay1 += first
      rates.ferDay2 += piece.minutes - first
    }
    for (const k of RATE_KEYS) byRate[k] += rates[k]
    const amount = hourly === null ? null : RATE_KEYS.reduce((t, k) => t + (rates[k] / 60) * hourly * (1 + rateOf(k, p)), 0)
    return { ...calc, byRate: rates, amount }
  })
  const amount = hourly === null ? null : items.reduce((t, x) => t + (x.amount ?? 0), 0)
  const calls = items.filter((x) => x.minutes > 0).length
  const callFees = calls * p.callFee
  return { items, byRate, hours: items.reduce((t, x) => t + x.hours, 0), calls, amount, callFees, total: amount === null ? null : amount + callFees }
}

/** Inizio e fine del turno: Notte 18:00 → 09:00 del giorno dopo, Diurno 09:00 → 18:00. */
export function shiftWindow(slotId: string): { start: string; end: string } {
  const s = SLOT_BY_ID[slotId]
  const day = slotId.slice(0, 10)
  if (s?.kind === 'WD') return { start: `${day}T09:00`, end: `${day}T18:00` }
  return { start: `${day}T18:00`, end: `${addDays(day, 1)}T09:00` }
}

/** "1 h 35'", "45'", "2 h" */
export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60), r = Math.round(m % 60)
  return h && r ? `${h} h ${String(r).padStart(2, '0')}'` : h ? `${h} h` : `${r}'`
}
