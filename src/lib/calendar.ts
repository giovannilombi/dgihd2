import type { Slot, SlotKind } from './types'

export const HORIZON_START = '2026-11-01'
export const HORIZON_END = '2026-12-31'
export const RANGE_23NOV = '2026-11-23'

export const HOLIDAYS: Record<string, string> = {
  '2026-11-01': 'Ognissanti',
  '2026-12-07': "Sant'Ambrogio (Milano)",
  '2026-12-08': 'Immacolata Concezione',
  '2026-12-25': 'Natale',
  '2026-12-26': 'Santo Stefano',
}

const DAY_MS = 86_400_000
const WD_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const MONTH_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
export const MONTH_LONG = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

export const toDate = (iso: string) => new Date(iso + 'T00:00:00Z')
export const toIso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * DAY_MS))
/** 0 = Domenica … 6 = Sabato */
export const weekday = (iso: string) => toDate(iso).getUTCDay()
export const monthKey = (iso: string) => iso.slice(0, 7)
export const monthLabel = (key: string) => `${MONTH_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`

export const isHoliday = (iso: string) => iso in HOLIDAYS
export const isWeekendOrHoliday = (iso: string) => {
  const w = weekday(iso)
  return w === 0 || w === 6 || isHoliday(iso)
}

/** Lunedì della settimana ISO che contiene la data: identifica la settimana. */
export const weekStart = (iso: string) => addDays(iso, -((weekday(iso) + 6) % 7))
export const weekSaturday = (wk: string) => addDays(wk, 5)
export const weekSunday = (wk: string) => addDays(wk, 6)

export function isoWeekNumber(iso: string) {
  const d = toDate(iso)
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DAY_MS)
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return 1 + Math.floor((thursday.getTime() - jan1) / DAY_MS / 7)
}

export const fmtDay = (iso: string) => {
  const d = toDate(iso)
  return `${WD_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`
}

export const SLOT_LABEL: Record<SlotKind, string> = { FN: 'Notte', WD: 'Diurno', WN: 'Notte' }
export const SLOT_HOURS: Record<SlotKind, string> = { FN: '18:00–09:00', WD: '09:00–18:00', WN: '18:00–09:00' }
export const SLOT_DURATION: Record<SlotKind, number> = { FN: 15, WD: 9, WN: 15 }

export function daysInRange(from = HORIZON_START, to = HORIZON_END) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function slotsForDay(iso: string): Slot[] {
  if (isWeekendOrHoliday(iso)) {
    return [
      { id: `${iso}|D`, date: iso, kind: 'WD' },
      { id: `${iso}|N`, date: iso, kind: 'WN' },
    ]
  }
  return [{ id: `${iso}|N`, date: iso, kind: 'FN' }]
}

export const ALL_SLOTS: Slot[] = daysInRange().flatMap(slotsForDay)
export const SLOT_BY_ID: Record<string, Slot> = Object.fromEntries(ALL_SLOTS.map((s) => [s.id, s]))
