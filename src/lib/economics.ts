import { isHoliday, weekday } from './calendar'
import { LEVEL_GROUP, type Params, type Person, type Slot, type SlotKind } from './types'

export const HOURLY_DIVISOR = 13 * 173 // 2.249

export const baseHourly = (ral: number) => ral / HOURLY_DIVISOR

export function kNetto(ral: number, p: Params) {
  if (ral <= 28_000) return p.kNetLow
  if (ral <= 50_000) return p.kNetMid
  return p.kNetHigh
}

export function netTarget(kind: SlotKind, p: Params) {
  return kind === 'FN' ? p.netFN : kind === 'WD' ? p.netWD : p.netWN
}

/** Indennità tabellare CCNL (lorda) maturata per un singolo slot. */
export function ccnlIndemnity(person: Pick<Person, 'level'>, slot: Pick<Slot, 'date' | 'kind'>, p: Params) {
  const row = p.indemnity[LEVEL_GROUP[person.level]]
  if (slot.kind === 'FN') return row.feriale
  const isSat = weekday(slot.date) === 6 && !isHoliday(slot.date)
  const daily = isSat ? row.sabato : row.domenica
  if (p.indemnitySplit === 'intera') return daily
  return daily * (slot.kind === 'WD' ? 9 : 15) / 24
}

export interface SlotEcon {
  net: number // netto target garantito
  iccnl: number // indennità CCNL lorda
  ltot: number // lordo totale necessario
  lcomp: number // integrazione lorda da compensare
  cost: number // costo aziendale pieno
}

export function slotEconomics(person: Pick<Person, 'level' | 'ral'>, slot: Pick<Slot, 'date' | 'kind'>, p: Params): SlotEcon {
  const net = netTarget(slot.kind, p)
  const ltot = net / kNetto(person.ral, p)
  const iccnl = ccnlIndemnity(person, slot, p)
  return { net, iccnl, ltot, lcomp: Math.max(0, ltot - iccnl), cost: ltot * p.costMultiplier }
}

/** Ore di straordinario domenicale (+55%) necessarie per liquidare un lordo. */
export function sundayHours(lcomp: number, ral: number, p: Params) {
  return lcomp / (baseHourly(ral) * (1 + p.majDom))
}

/** Ore di sabato a scaglioni: +25% prime 2 ore, +30% dalla terza. */
export function saturdayHours(lcomp: number, ral: number, p: Params) {
  const base = baseHourly(ral)
  const firstTwo = 2 * base * (1 + p.majSab1)
  if (lcomp <= firstTwo) return lcomp / (base * (1 + p.majSab1))
  return 2 + (lcomp - firstTwo) / (base * (1 + p.majSab2))
}

export const fmtEur = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
export const fmtNum = (n: number, d = 2) => n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })
export const fmtPct = (n: number) => `${fmtNum(n, 1)}%`
export function fmtHours(h: number) {
  let hh = Math.floor(h)
  let mm = Math.round((h - hh) * 60)
  if (mm === 60) { hh += 1; mm = 0 }
  return `${fmtNum(h)} h → ${hh}h ${String(mm).padStart(2, '0')}m`
}
