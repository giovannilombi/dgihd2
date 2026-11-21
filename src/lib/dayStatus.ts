import { addDays, slotsForDay } from './calendar'
import { canEdit, isDirectorOf, type Me } from './roles'
import type { Assignments, Person } from './types'

/**
 * Stato di un giorno di reperibilità (tabella day_status):
 * - erogato: il giorno è definitivo, turni e persone non si cambiano più;
 * - consuntivato: chiuso anche l'inserimento degli interventi.
 */
export interface DayStatus {
  day: string
  erogatoAt: string
  erogatoByName: string
  consuntivatoAt: string | null
  consuntivatoByName: string | null
}
export type DayStatusMap = Readonly<Record<string, DayStatus>>
export type DayState = 'aperto' | 'erogato' | 'consuntivato'

export interface DayStatusRow { day: string; erogato_at: string; erogato_by_name: string | null; consuntivato_at: string | null; consuntivato_by_name: string | null }
export const rowToDayStatus = (r: DayStatusRow): DayStatus => ({
  day: String(r.day).slice(0, 10), erogatoAt: r.erogato_at, erogatoByName: r.erogato_by_name ?? '',
  consuntivatoAt: r.consuntivato_at ?? null, consuntivatoByName: r.consuntivato_by_name ?? null,
})
export const dayStatusMap = (rows: DayStatusRow[]): DayStatusMap => Object.fromEntries(rows.map((r) => { const s = rowToDayStatus(r); return [s.day, s] }))

export const dayState = (map: DayStatusMap, day: string): DayState =>
  !map[day] ? 'aperto' : map[day].consuntivatoAt ? 'consuntivato' : 'erogato'
export const isErogato = (map: DayStatusMap, day: string) => !!map[day]

/** Turni dei giorni erogati: restano fissi (come i turni bloccati) per auto-compilazione e "Svuota". */
export const lockedSlots = (map: DayStatusMap, a: Assignments) => Object.keys(a).filter((sid) => !!map[sid.slice(0, 10)])

/** Data di oggi in Italia (YYYY-MM-DD). */
export const romeToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** Data e ora in Italia, 'YYYY-MM-DDTHH:MM' (confrontabile come testo). */
export function romeNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/**
 * Fine dell'ultimo turno assegnato del giorno, ora italiana 'YYYY-MM-DDTHH:MM': Notte 09:00 del giorno dopo,
 * Diurno 18:00. null se il giorno non ha turni assegnati. Stessa regola della funzione del database.
 */
export function dayShiftEnd(day: string, a: Assignments): string | null {
  const ends = slotsForDay(day).filter((s) => a[s.id]).map((s) => (s.kind === 'WD' ? `${day}T18:00` : `${addDays(day, 1)}T09:00`))
  return ends.length ? ends.sort()[ends.length - 1] : null
}

/** Il giorno si può segnare come erogato: ha turni assegnati e l'ultimo è finito. */
export const shiftEnded = (day: string, a: Assignments, now = new Date()) => {
  const end = dayShiftEnd(day, a)
  return !!end && romeNow(now) >= end
}

/** "P. Gialli" da "Paolo Gialli"; un'email resta la parte prima della @. */
export const shortName = (name: string) => {
  const n = name.includes('@') ? name.split('@')[0] : name
  const parts = n.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : n.trim()
}

export type { Me } from './roles'

export interface DayPerms {
  /** Segna erogato (dalla fine del turno): Super admin, Governance, Director. */
  mark: boolean
  /** Consuntiva: chi può segnare l'erogato e HR. */
  close: boolean
  /** Sblocca: super admin o director di un team con un turno quel giorno. */
  unlock: boolean
}

/** Stesse regole delle funzioni del database (mark_day_erogato, consuntiva_day, unlock_day). */
export function dayPerms(day: string, me: Me, people: Person[], a: Assignments): DayPerms {
  const byId = new Map(people.map((p) => [p.id, p]))
  const directs = slotsForDay(day).some((s) => isDirectorOf(byId.get(a[s.id])?.team, me))
  const mark = canEdit(me.role)
  return { mark, close: mark || me.role === 'hr', unlock: me.role === 'super_admin' || directs }
}
