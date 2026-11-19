// Conversione tra righe del database e modello dell'app, e calcolo delle modifiche da salvare.
// Modulo puro (nessuna dipendenza dal browser): usato sia dall'app sia dalla funzione server "planner".
import { normalizeWithReport, type AppData } from './store'
import type { Person, ResourceTeam } from './types'

export interface PersonRow { id: string; name: string; color: string; active: boolean; sort: number; team: ResourceTeam | null }
export interface DetailsRow {
  person_id: string
  availability: 'volontario' | 'limitato' | 'nessuna'
  max_per_month: number | null
  unavailable: string[]
  preferred_days: string[]
  reserve: boolean
  reserve_order: number | null
}
/** Dati riservati per team: livello, RAL, Q/. */
export interface PrivateRow { person_id: string; level: string; ral: number; ral_nd: boolean }
export interface AssignmentRow { slot_id: string; person_id: string; pinned: boolean }

/**
 * Converte le righe lette dal database nel modello dell'app (normalizzato e validato).
 * `privates` = righe riservate visibili all'utente; `null` se l'utente non può leggere dati riservati.
 * Una persona senza riga riservata visibile ha `salaryHidden: true` (livello e RAL non noti).
 */
export function rowsToData(
  people: PersonRow[], details: DetailsRow[] | null, privates: PrivateRow[] | null,
  assignments: AssignmentRow[], excluded: string[], params: unknown,
): AppData {
  const det = new Map((details ?? []).map((d) => [d.person_id, d]))
  const prv = new Map((privates ?? []).map((d) => [d.person_id, d]))
  const raw = {
    version: 1,
    params: params ?? {},
    people: [...people].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((p) => {
      const d = det.get(p.id)
      const s = prv.get(p.id)
      return {
        id: p.id, name: p.name, color: p.color, active: p.active, team: p.team ?? null,
        // senza accesso ai dati riservati: valori neutri, mai mostrati né usati nei calcoli economici
        level: s?.level ?? 'B1', ral: Number(s?.ral ?? 0), ralNd: s?.ral_nd ?? false, salaryHidden: !s,
        availability: d?.availability ?? 'nessuna', maxPerMonth: d?.max_per_month ?? undefined,
        unavailable: d?.unavailable ?? [], preferredDays: d?.preferred_days ?? [],
        reserve: d?.reserve ?? false, reserveOrder: d?.reserve_order ?? undefined,
      }
    }),
    assignments: Object.fromEntries(assignments.map((a) => [a.slot_id, a.person_id])),
    excludedDays: excluded,
    pinned: assignments.filter((a) => a.pinned).map((a) => a.slot_id),
  }
  return normalizeWithReport(raw).data
}

export const personRow = (p: Person, i: number): PersonRow => ({ id: p.id, name: p.name, color: p.color, active: p.active, sort: i, team: p.team ?? null })
export const detailsRow = (p: Person): DetailsRow => ({
  person_id: p.id, availability: p.availability ?? 'nessuna',
  max_per_month: p.availability === 'limitato' ? p.maxPerMonth ?? 1 : null,
  unavailable: p.unavailable ?? [], preferred_days: p.preferredDays ?? [],
  reserve: !!p.reserve, reserve_order: p.reserve ? p.reserveOrder ?? null : null,
})
export const privateRow = (p: Person): PrivateRow => ({ person_id: p.id, level: p.level, ral: p.ralNd ? 0 : p.ral, ral_nd: !!p.ralNd })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export interface Ops {
  peopleUpsert: PersonRow[]
  peopleDelete: string[]
  detailsUpsert: DetailsRow[]
  privateUpsert: PrivateRow[]
  assignmentsUpsert: AssignmentRow[]
  assignmentsDelete: string[]
  excludedAdd: string[]
  excludedRemove: string[]
  params?: unknown
}

/** Calcola le sole modifiche da inviare al database tra due stati dell'app. */
export function diff(prev: AppData, next: AppData): Ops {
  const prevPeople = new Map(prev.people.map((p, i) => [p.id, { row: personRow(p, i), det: detailsRow(p), prv: privateRow(p) }]))
  const ops: Ops = { peopleUpsert: [], peopleDelete: [], detailsUpsert: [], privateUpsert: [], assignmentsUpsert: [], assignmentsDelete: [], excludedAdd: [], excludedRemove: [] }
  next.people.forEach((p, i) => {
    const old = prevPeople.get(p.id)
    const row = personRow(p, i)
    const d = detailsRow(p)
    if (!old || !same(old.row, row)) ops.peopleUpsert.push(row)
    if (!old || !same(old.det, d)) ops.detailsUpsert.push(d)
    // i dati riservati si scrivono solo per le persone visibili all'utente
    if (!p.salaryHidden) {
      const pr = privateRow(p)
      if (!old || !same(old.prv, pr)) ops.privateUpsert.push(pr)
    }
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
  if (!same(prev.params, next.params)) {
    const { ndRal: _omit, ...params } = next.params
    void _omit
    ops.params = params // la RAL media di riferimento non si scrive mai dal browser
  }
  return ops
}

export const isEmpty = (o: Ops) =>
  !o.peopleUpsert.length && !o.peopleDelete.length && !o.detailsUpsert.length && !o.privateUpsert.length && !o.assignmentsUpsert.length &&
  !o.assignmentsDelete.length && !o.excludedAdd.length && !o.excludedRemove.length && o.params === undefined
