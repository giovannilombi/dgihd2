import { slotsForDay } from './calendar'
import { canEdit, canReadFull, type Role } from './roles'
import { seesAllSalaries, type TeamDir, type TeamId } from './teams'
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

/** Data di oggi in Italia (YYYY-MM-DD): un giorno si segna erogato dal giorno dopo. */
export const romeToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** "P. Gialli" da "Paolo Gialli"; un'email resta la parte prima della @. */
export const shortName = (name: string) => {
  const n = name.includes('@') ? name.split('@')[0] : name
  const parts = n.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : n.trim()
}

export interface Me { id: string; role: Role; team: TeamId | null }

/** Director (valido) del team: account del team con accesso completo in lettura, come nel database. */
export const isDirectorOf = (teams: TeamDir, team: TeamId | null | undefined, me: Me) =>
  !!team && teams.byId[team]?.directorId === me.id && me.team === team && canReadFull(me.role)

export interface DayPerms {
  /** Segna erogato: Full edit, super admin, director di un team con un turno quel giorno. */
  mark: boolean
  /** Consuntiva: chi può segnare l'erogato e chi legge tutto in un team che "vede tutto" (es. HR). */
  close: boolean
  /** Sblocca: super admin o director di un team con un turno quel giorno. */
  unlock: boolean
}

/** Stesse regole delle funzioni del database (mark_day_erogato, consuntiva_day, unlock_day). */
export function dayPerms(day: string, me: Me, teams: TeamDir, people: Person[], a: Assignments): DayPerms {
  const byId = new Map(people.map((p) => [p.id, p]))
  const directs = slotsForDay(day).some((s) => isDirectorOf(teams, byId.get(a[s.id])?.team, me))
  const mark = canEdit(me.role) || directs
  return {
    mark,
    close: mark || (canReadFull(me.role) && seesAllSalaries(teams, me.team)),
    unlock: me.role === 'super_admin' || directs,
  }
}
