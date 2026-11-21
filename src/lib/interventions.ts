import { SLOT_BY_ID } from './calendar'
import { isDirectorOf, type Me } from './dayStatus'
import { shiftWindow } from './overtime'
import { seesAllSalaries, type TeamDir } from './teams'
import type { Params, Person } from './types'

/** Intervento dichiarato da un turnista (orari in ora italiana 'YYYY-MM-DDTHH:MM'). */
export type IvStatus = 'pending' | 'approved' | 'rejected'
export interface Intervention {
  id: string
  slot: string
  personId: string
  start: string
  end: string
  note: string | null
  status: IvStatus
  rejectReason: string | null
  resendComment: string | null
  decidedByName: string | null
  decidedAt: string | null
}

export interface InterventionRow {
  id: string; slot_id: string; person_id: string; start_at: string; end_at: string; note: string | null; status: string
  reject_reason: string | null; resend_comment: string | null; decided_by_name: string | null; decided_at: string | null
}
const status = (s: unknown): IvStatus => (s === 'approved' || s === 'rejected' ? s : 'pending')
export const rowToIntervention = (r: InterventionRow): Intervention => ({
  id: r.id, slot: r.slot_id, personId: r.person_id, start: String(r.start_at).slice(0, 16).replace(' ', 'T'), end: String(r.end_at).slice(0, 16).replace(' ', 'T'),
  note: r.note ?? null, status: status(r.status), rejectReason: r.reject_reason ?? null, resendComment: r.resend_comment ?? null,
  decidedByName: r.decided_by_name ?? null, decidedAt: r.decided_at ?? null,
})

/** Stato di un turno rispetto agli interventi, per i chip del calendario e degli elenchi. */
export type ShiftChip = 'future' | 'running' | 'todo' | 'nothing' | 'pending' | 'approved' | 'rejected'
export interface ShiftChipInfo { chip: ShiftChip; count: number }

/**
 * - in approvazione (giallo) se c'è almeno un intervento da approvare;
 * - rifiutato (rosso) se c'è un intervento rifiutato da correggere;
 * - approvati (verde) se tutti gli interventi sono approvati;
 * - nessun intervento (grigio) se dichiarato;
 * - da compilare (arancio) se il turno è finito senza dichiarazione.
 */
export function shiftChip(slot: string, ivs: Intervention[], noIntervention: boolean, nowStamp: string): ShiftChipInfo {
  const pending = ivs.filter((x) => x.status === 'pending').length
  const rejected = ivs.filter((x) => x.status === 'rejected').length
  const approved = ivs.filter((x) => x.status === 'approved').length
  if (pending) return { chip: 'pending', count: pending + approved }
  if (rejected) return { chip: 'rejected', count: rejected }
  if (approved) return { chip: 'approved', count: approved }
  if (noIntervention) return { chip: 'nothing', count: 0 }
  const w = shiftWindow(slot)
  if (nowStamp >= w.end) return { chip: 'todo', count: 0 }
  return { chip: nowStamp >= w.start ? 'running' : 'future', count: 0 }
}

/** Raggruppa per turno. */
export function bySlot(ivs: Intervention[]): Record<string, Intervention[]> {
  const out: Record<string, Intervention[]> = {}
  for (const iv of ivs) (out[iv.slot] ??= []).push(iv)
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.start.localeCompare(b.start))
  return out
}

/**
 * Data e ora di un orario inserito nel modulo (HH:MM) per un turno: la notte va dalle 18:00 alle 09:00
 * del giorno dopo, quindi le ore del mattino cadono il giorno dopo. Se la fine non è dopo l'inizio, è il
 * giorno successivo.
 */
export function resolveTimes(slot: string, startTime: string, endTime: string): { start: string; end: string } | null {
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null
  const s = SLOT_BY_ID[slot]
  if (!s) return null
  const night = s.kind !== 'WD'
  const w = shiftWindow(slot)
  const at = (t: string) => (night && Number(t.slice(0, 2)) < 12 ? `${w.end.slice(0, 10)}T${t}` : `${slot.slice(0, 10)}T${t}`)
  const start = at(startTime)
  let end = at(endTime)
  if (end <= start) {
    const d = new Date(`${end.slice(0, 10)}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    end = `${d.toISOString().slice(0, 10)}T${endTime}`
  }
  return { start, end }
}

/** Chi decide: super admin o director del team della persona (mai sui propri interventi, salvo il super admin). */
export const canDecide = (person: Pick<Person, 'id' | 'team'> | undefined, me: Me, teams: TeamDir, myPersonId: string | null) =>
  !!person && (me.role === 'super_admin' || (isDirectorOf(teams, person.team, me) && person.id !== myPersonId))

/**
 * Importi degli interventi: solo a chi vede tutti i team (HR, Governance) e al director del team della persona,
 * e solo se la RAL puntuale è nota (non Q/, non da inserire).
 */
export const amountsVisible = (person: Person | undefined, me: Me, teams: TeamDir) =>
  !!person && (seesAllSalaries(teams, me.team) || isDirectorOf(teams, person.team, me))
export const payRal = (person: Person | undefined) =>
  person && !person.salaryHidden && !person.ralNd && person.ral > 0 ? person.ral : null

/** I miei turni e interventi (funzione del database `my_shifts`). */
export interface MyShifts {
  me: { id: string; name: string; color: string } | null
  /** Regole di conteggio delle ore (minimo e tolleranza) dai parametri */
  rules?: Partial<Pick<Params, 'otMinHours' | 'otToleranceMin'>>
  shifts: { slot: string; noIntervention: boolean; consuntivato: boolean }[]
  interventions: Intervention[]
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export function parseMyShifts(raw: unknown): MyShifts {
  if (!isObj(raw)) throw new Error('risposta del server non valida')
  const me = isObj(raw.me) && typeof raw.me.id === 'string' ? { id: raw.me.id, name: String(raw.me.name ?? ''), color: String(raw.me.color ?? '#1d4ed8') } : null
  const shifts = (Array.isArray(raw.shifts) ? raw.shifts : []).filter((s): s is Record<string, unknown> => isObj(s) && typeof s.slot === 'string' && !!SLOT_BY_ID[s.slot as string])
    .map((s) => ({ slot: s.slot as string, noIntervention: s.no_intervention === true, consuntivato: s.consuntivato === true }))
  const interventions = (Array.isArray(raw.interventions) ? raw.interventions : []).filter(isObj).map((x) => rowToIntervention({
    id: String(x.id), slot_id: String(x.slot), person_id: me?.id ?? '', start_at: String(x.start), end_at: String(x.end), note: (x.note as string) ?? null,
    status: String(x.status), reject_reason: (x.reject_reason as string) ?? null, resend_comment: (x.resend_comment as string) ?? null,
    decided_by_name: (x.decided_by_name as string) ?? null, decided_at: (x.decided_at as string) ?? null,
  }))
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)
  const rules = isObj(raw.rules) ? Object.fromEntries(Object.entries({ otMinHours: num(raw.rules.otMinHours), otToleranceMin: num(raw.rules.otToleranceMin) }).filter(([, v]) => v !== undefined)) : undefined
  return { me, shifts, interventions, rules }
}
