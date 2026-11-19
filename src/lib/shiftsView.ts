import { SLOT_BY_ID } from './calendar'
import type { Slot } from './types'

/**
 * Calendario del Turnista, come lo restituisce la funzione del database `turnista_calendar()`.
 * Il server decide cosa includere: con `mode = 'own'` i nomi arrivano solo sui propri turni,
 * quindi quelli degli altri non raggiungono mai il browser.
 */
export type NamesMode = 'all' | 'own'
/** Impostazione generale del super admin: per tutti, oppure "per persona" (vale la Visibilità di ciascuno). */
export type NamesSetting = NamesMode | 'per_user'
export const parseNamesSetting = (v: unknown): NamesSetting => (v === 'own' || v === 'per_user' ? v : 'all')
/** Cosa vede davvero un Turnista: l'impostazione generale, o la sua Visibilità se è "per persona". */
export const effectiveNames = (setting: NamesSetting, own?: NamesMode | null): NamesMode => (setting === 'per_user' ? own ?? 'own' : setting)
export interface TurnistaSlot { slot: string; mine: boolean; name?: string; color?: string }
export interface TurnistaCalendar {
  mode: NamesMode
  me: { id: string; name: string; color: string } | null
  excluded: string[]
  slots: Record<string, TurnistaSlot>
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** Valida la risposta del server: scarta voci malformate o turni fuori dal periodo. */
export function parseTurnistaCalendar(raw: unknown): TurnistaCalendar {
  if (!isObj(raw)) throw new Error('risposta del server non valida')
  const me = isObj(raw.me) && str(raw.me.id) && str(raw.me.name)
    ? { id: raw.me.id as string, name: raw.me.name as string, color: str(raw.me.color) ?? '#1d4ed8' }
    : null
  const excluded = Array.isArray(raw.excluded) ? raw.excluded.filter((d): d is string => typeof d === 'string') : []
  const slots: Record<string, TurnistaSlot> = {}
  for (const s of Array.isArray(raw.slots) ? raw.slots : []) {
    if (!isObj(s) || !str(s.slot) || !SLOT_BY_ID[s.slot as string]) continue
    slots[s.slot as string] = { slot: s.slot as string, mine: s.mine === true, name: str(s.name), color: str(s.color) }
  }
  return { mode: raw.mode === 'own' ? 'own' : 'all', me, excluded, slots }
}

/** I propri turni, in ordine di data. */
export const mySlots = (c: TurnistaCalendar): Slot[] =>
  Object.values(c.slots).filter((s) => s.mine).map((s) => SLOT_BY_ID[s.slot]).sort((a, b) => a.id.localeCompare(b.id))

export type CellTone = 'mine' | 'named' | 'covered' | 'empty'

/** Cosa mostrare in un turno: il proprio, il nome di chi lo copre, "Turno coperto" o nessuno. */
export function slotCell(s: TurnistaSlot | undefined): { tone: CellTone; text: string; color?: string } {
  if (!s) return { tone: 'empty', text: 'Non assegnato' }
  if (s.mine) return { tone: 'mine', text: 'Sei di turno', color: s.color }
  if (s.name) return { tone: 'named', text: s.name, color: s.color }
  return { tone: 'covered', text: 'Turno coperto' }
}
