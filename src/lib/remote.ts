import type { AppData } from './store'
import { supabase } from './supabase'

import { diff, type AssignmentRow, type DetailsRow, type Ops, type PersonRow, type PrivateRow, rowsToData } from './mapping'
export { diff, isEmpty, rowsToData } from './mapping'
export type { AssignmentRow, DetailsRow, Ops, PersonRow, PrivateRow } from './mapping'

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
  if (o.privateUpsert.length) check(await supabase.from('people_private').upsert(o.privateUpsert))
  if (o.assignmentsUpsert.length) check(await supabase.from('assignments').upsert(o.assignmentsUpsert))
  if (o.excludedRemove.length) check(await supabase.from('excluded_days').delete().in('day', o.excludedRemove))
  if (o.excludedAdd.length) check(await supabase.from('excluded_days').upsert(o.excludedAdd.map((day) => ({ day }))))
  if (o.params !== undefined) check(await supabase.from('settings').update({ params: o.params, updated_at: new Date().toISOString() }).eq('id', 1))
}

/**
 * Legge tutto ciò che il livello (e il team) dell'utente consente di vedere.
 * `readFull`: anagrafica completa; `readParams`: parametri (anche per il PM);
 * `salaryOf`: solo con la vista completa, dice di quali team l'utente vede livello e RAL (stessa regola
 * del database). Senza, livello e RAL non vengono nemmeno chiesti.
 */
export async function loadAll(readFull: boolean, readParams = readFull, salaryOf?: (team: string | null) => boolean): Promise<AppData> {
  const none = Promise.resolve({ data: null, error: null })
  const [people, details, privates, assignments, excluded, settings] = await Promise.all([
    supabase.from('people').select('id, name, color, active, sort, team'),
    readFull ? supabase.from('people_details').select('person_id, availability, max_per_month, unavailable, preferred_days, reserve, reserve_order, email') : none,
    readFull && salaryOf ? supabase.from('people_private').select('person_id, level, ral, ral_nd') : none,
    supabase.from('assignments').select('slot_id, person_id, pinned'),
    supabase.from('excluded_days').select('day'),
    readParams ? supabase.from('settings').select('params').eq('id', 1).maybeSingle() : none,
  ])
  for (const r of [people, details, privates, assignments, excluded, settings]) if (r.error) throw new Error(r.error.message)
  const data = rowsToData(
    (people.data ?? []) as PersonRow[],
    details.data as DetailsRow[] | null,
    (privates.data ?? []) as PrivateRow[],
    (assignments.data ?? []) as AssignmentRow[],
    ((excluded.data ?? []) as { day: string }[]).map((x) => x.day),
    (settings.data as { params?: unknown } | null)?.params,
  )
  // persona visibile ma senza livello e RAL salvati (aggiunta senza vista completa): "RAL da inserire"
  if (salaryOf) data.people = data.people.map((p) => (p.salaryHidden && salaryOf(p.team ?? null) ? { ...p, salaryHidden: false } : p))
  return withoutServerParams(data)
}

/** La RAL media di riferimento per le RAL Q/ vive solo sul server: il browser non la conserva mai. */
function withoutServerParams(d: AppData): AppData {
  const { ndRal: _omit, ...params } = d.params
  void _omit
  return { ...d, params }
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
  for (const table of ['people', 'people_details', 'people_private', 'assignments', 'excluded_days', 'settings']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  }
  ch.subscribe()
  return () => { void supabase.removeChannel(ch) }
}
