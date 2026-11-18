import type { AppData } from './store'
import { normalizeWithReport } from './store'
import { supabase } from './supabase'
import type { Person } from './types'

// ---------- Righe del database ----------
export interface PersonRow { id: string; name: string; color: string; active: boolean; sort: number }
export interface DetailsRow {
  person_id: string
  level: string
  ral: number
  availability: 'volontario' | 'limitato' | 'nessuna'
  max_per_month: number | null
  unavailable: string[]
  preferred_days: string[]
}
export interface AssignmentRow { slot_id: string; person_id: string; pinned: boolean }

/** Converte le righe lette dal database nel modello dell'app (normalizzato e validato). */
export function rowsToData(
  people: PersonRow[], details: DetailsRow[] | null, assignments: AssignmentRow[], excluded: string[], params: unknown,
): AppData {
  const byId = new Map((details ?? []).map((d) => [d.person_id, d]))
  const raw = {
    version: 1,
    params: params ?? {},
    people: [...people].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((p) => {
      const d = byId.get(p.id)
      return {
        id: p.id, name: p.name, color: p.color, active: p.active,
        // chi non può leggere i dettagli (viewer) riceve valori neutri: in pagina non vengono mostrati
        level: d?.level ?? 'B1', ral: Number(d?.ral ?? 0),
        availability: d?.availability ?? 'nessuna', maxPerMonth: d?.max_per_month ?? undefined,
        unavailable: d?.unavailable ?? [], preferredDays: d?.preferred_days ?? [],
      }
    }),
    assignments: Object.fromEntries(assignments.map((a) => [a.slot_id, a.person_id])),
    excludedDays: excluded,
    pinned: assignments.filter((a) => a.pinned).map((a) => a.slot_id),
  }
  return normalizeWithReport(raw).data
}

const personRow = (p: Person, i: number): PersonRow => ({ id: p.id, name: p.name, color: p.color, active: p.active, sort: i })
const detailsRow = (p: Person): DetailsRow => ({
  person_id: p.id, level: p.level, ral: p.ral, availability: p.availability ?? 'nessuna',
  max_per_month: p.availability === 'limitato' ? p.maxPerMonth ?? 1 : null,
  unavailable: p.unavailable ?? [], preferred_days: p.preferredDays ?? [],
})
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export interface Ops {
  peopleUpsert: PersonRow[]
  peopleDelete: string[]
  detailsUpsert: DetailsRow[]
  assignmentsUpsert: AssignmentRow[]
  assignmentsDelete: string[]
  excludedAdd: string[]
  excludedRemove: string[]
  params?: unknown
}

/** Calcola le sole modifiche da inviare al database tra due stati dell'app. */
export function diff(prev: AppData, next: AppData): Ops {
  const prevPeople = new Map(prev.people.map((p, i) => [p.id, { row: personRow(p, i), det: detailsRow(p) }]))
  const ops: Ops = { peopleUpsert: [], peopleDelete: [], detailsUpsert: [], assignmentsUpsert: [], assignmentsDelete: [], excludedAdd: [], excludedRemove: [] }
  next.people.forEach((p, i) => {
    const old = prevPeople.get(p.id)
    const row = personRow(p, i)
    const det = detailsRow(p)
    if (!old || !same(old.row, row)) ops.peopleUpsert.push(row)
    if (!old || !same(old.det, det)) ops.detailsUpsert.push(det)
  })
  const nextIds = new Set(next.people.map((p) => p.id))
  ops.peopleDelete = prev.people.filter((p) => !nextIds.has(p.id)).map((p) => p.id)

  const pinnedPrev = new Set(prev.pinned)
  const pinnedNext = new Set(next.pinned)
  for (const [sid, pid] of Object.entries(next.assignments)) {
    if (prev.assignments[sid] !== pid || pinnedPrev.has(sid) !== pinnedNext.has(sid)) {
      ops.assignmentsUpsert.push({ slot_id: sid, person_id: pid, pinned: pinnedNext.has(sid) })
    }
  }
  ops.assignmentsDelete = Object.keys(prev.assignments).filter((sid) => !(sid in next.assignments))

  const exPrev = new Set(prev.excludedDays)
  const exNext = new Set(next.excludedDays)
  ops.excludedAdd = next.excludedDays.filter((d) => !exPrev.has(d))
  ops.excludedRemove = prev.excludedDays.filter((d) => !exNext.has(d))
  if (!same(prev.params, next.params)) ops.params = next.params
  return ops
}

export const isEmpty = (o: Ops) =>
  !o.peopleUpsert.length && !o.peopleDelete.length && !o.detailsUpsert.length && !o.assignmentsUpsert.length &&
  !o.assignmentsDelete.length && !o.excludedAdd.length && !o.excludedRemove.length && o.params === undefined

const check = <T,>(r: { error: { message: string } | null; data?: T }) => {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

/** Applica le modifiche nell'ordine corretto (prima le persone, poi i dati che le richiamano). */
export async function persist(o: Ops) {
  if (o.assignmentsDelete.length) check(await supabase.from('assignments').delete().in('slot_id', o.assignmentsDelete))
  if (o.peopleDelete.length) check(await supabase.from('people').delete().in('id', o.peopleDelete))
  if (o.peopleUpsert.length) check(await supabase.from('people').upsert(o.peopleUpsert))
  if (o.detailsUpsert.length) check(await supabase.from('people_details').upsert(o.detailsUpsert))
  if (o.assignmentsUpsert.length) check(await supabase.from('assignments').upsert(o.assignmentsUpsert))
  if (o.excludedRemove.length) check(await supabase.from('excluded_days').delete().in('day', o.excludedRemove))
  if (o.excludedAdd.length) check(await supabase.from('excluded_days').upsert(o.excludedAdd.map((day) => ({ day }))))
  if (o.params !== undefined) check(await supabase.from('settings').update({ params: o.params, updated_at: new Date().toISOString() }).eq('id', 1))
}

/** Legge tutto ciò che il livello dell'utente consente di vedere. */
export async function loadAll(readFull: boolean): Promise<AppData> {
  const [people, details, assignments, excluded, settings] = await Promise.all([
    supabase.from('people').select('id, name, color, active, sort'),
    readFull ? supabase.from('people_details').select('person_id, level, ral, availability, max_per_month, unavailable, preferred_days') : Promise.resolve({ data: null, error: null }),
    supabase.from('assignments').select('slot_id, person_id, pinned'),
    supabase.from('excluded_days').select('day'),
    readFull ? supabase.from('settings').select('params').eq('id', 1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  for (const r of [people, details, assignments, excluded, settings]) if (r.error) throw new Error(r.error.message)
  return rowsToData(
    (people.data ?? []) as PersonRow[],
    details.data as DetailsRow[] | null,
    (assignments.data ?? []) as AssignmentRow[],
    ((excluded.data ?? []) as { day: string }[]).map((x) => x.day),
    (settings.data as { params?: unknown } | null)?.params,
  )
}

/** Sostituisce l'intero contenuto del database (import di una configurazione JSON). */
export async function replaceAll(next: AppData, current: AppData) {
  const empty: AppData = { ...current, people: [], assignments: {}, excludedDays: [], pinned: [] }
  // 1) svuota turni e persone non più presenti, 2) scrive tutto il nuovo contenuto
  await persist(diff(current, { ...empty, params: current.params }))
  await persist(diff(empty, next))
}

/** Avvisa quando un altro utente modifica i dati (le regole RLS valgono anche qui). */
export function subscribe(onChange: () => void) {
  const ch = supabase.channel('piano-reperibilita')
  for (const table of ['people', 'people_details', 'assignments', 'excluded_days', 'settings']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  }
  ch.subscribe()
  return () => { void supabase.removeChannel(ch) }
}
