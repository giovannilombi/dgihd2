import { fmtDay, SLOT_BY_ID, SLOT_LABEL } from './calendar'
import { ROLE_LABEL, type Role } from './roles'
import { supabase } from './supabase'
import { teamLabel, type TeamDir } from './teams'
import type { Assignments } from './types'

/**
 * Storico (Space admin e Governance; il ripristino solo lo Space admin). I dati li registra il database:
 * - turni, puntine e giorni non richiesti, in sessioni per persona (nuova sessione dopo 30 minuti senza
 *   modifiche), con la fotografia del piano all'inizio di ogni sessione;
 * - parametri, anagrafica, team, account e impostazioni (prima → dopo);
 * - attività: conferme dei giorni (day_status_log) e interventi.
 */

export interface PlanSession {
  id: number
  userId: string | null
  userName: string
  startedAt: string
  lastAt: string
  /** Ripristino: sessione chiusa */
  closed: boolean
  restoreOf: number | null
  changes: number
}
export type PlanChangeKind = 'assign' | 'unassign' | 'replace' | 'pin' | 'unpin' | 'exclude' | 'include'
export interface PlanChange {
  id: number
  sessionId: number
  at: string
  kind: PlanChangeKind
  slot: string | null
  day: string
  oldPerson: string | null
  newPerson: string | null
  oldName: string | null
  newName: string | null
}
/** Piano all'inizio di una sessione: turni (persona e puntina) e giorni non richiesti. */
export interface PlanSnapshot { a: Record<string, { p: string; pin: boolean }>; x: string[] }

export type DataArea = 'parametri' | 'anagrafica' | 'team' | 'account' | 'impostazioni'
export interface DataChange {
  id: number
  at: string
  userName: string
  area: DataArea
  action: 'insert' | 'update' | 'delete'
  targetId: string | null
  targetName: string | null
  changes: Record<string, [unknown, unknown] | true>
  restricted: boolean
}

export type ActivityKind =
  | 'erogato' | 'consuntivato' | 'sblocco_erogato' | 'sblocco_consuntivato'
  | 'iv_insert' | 'iv_update' | 'iv_delete' | 'iv_approved' | 'iv_rejected' | 'iv_pending' | 'no_int' | 'no_int_clear'
export interface ActivityEvent {
  key: string
  at: string
  userName: string
  kind: ActivityKind
  day: string | null
  slot: string | null
  personName: string | null
  start: string | null
  end: string | null
  note: string | null
}

const check = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

/* ---------- Caricamento ---------- */

type SessionRow = { id: number; user_id: string | null; user_name: string; started_at: string; last_at: string; closed: boolean; restore_of: number | null; changes: number }
type ChangeRow = { id: number; session_id: number; at: string; kind: PlanChangeKind; slot_id: string | null; day: string; old_person: string | null; new_person: string | null; old_name: string | null; new_name: string | null }

export async function loadPlanHistory(): Promise<{ sessions: PlanSession[]; changes: PlanChange[] }> {
  const [s, c] = await Promise.all([
    supabase.from('plan_sessions').select('id, user_id, user_name, started_at, last_at, closed, restore_of, changes').gt('changes', 0).order('started_at', { ascending: false }).limit(400),
    supabase.from('plan_changes').select('id, session_id, at, kind, slot_id, day, old_person, new_person, old_name, new_name').order('id', { ascending: true }).limit(20000),
  ])
  const sessions = check<SessionRow[]>(s).map((r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, startedAt: r.started_at, lastAt: r.last_at, closed: r.closed, restoreOf: r.restore_of, changes: r.changes }))
  const ids = new Set(sessions.map((x) => x.id))
  const changes = check<ChangeRow[]>(c).filter((r) => ids.has(r.session_id)).map((r) => ({
    id: r.id, sessionId: r.session_id, at: r.at, kind: r.kind, slot: r.slot_id, day: String(r.day).slice(0, 10),
    oldPerson: r.old_person, newPerson: r.new_person, oldName: r.old_name, newName: r.new_name,
  }))
  return { sessions, changes }
}

export async function loadSnapshot(id: number): Promise<PlanSnapshot> {
  const r = check<{ snapshot: PlanSnapshot } | null>(await supabase.from('plan_sessions').select('snapshot').eq('id', id).maybeSingle())
  if (!r) throw new Error('Sessione non trovata')
  return { a: r.snapshot?.a ?? {}, x: r.snapshot?.x ?? [] }
}

export interface RestoreResult { session: number; missing_people: number; erogati: number; changes: number }
export async function restoreSession(id: number): Promise<RestoreResult> {
  return check<RestoreResult>(await supabase.rpc('restore_plan_session', { p_session: id }))
}

type DataRow = { id: number; at: string; user_name: string; area: DataArea; action: DataChange['action']; target_id: string | null; target_name: string | null; changes: DataChange['changes']; restricted: boolean }
export async function loadDataChanges(): Promise<DataChange[]> {
  const rows = check<DataRow[]>(await supabase.from('data_changes').select('id, at, user_name, area, action, target_id, target_name, changes, restricted').order('at', { ascending: false }).limit(2000))
  return rows.map((r) => ({ id: r.id, at: r.at, userName: r.user_name, area: r.area, action: r.action, targetId: r.target_id, targetName: r.target_name, changes: r.changes ?? {}, restricted: r.restricted }))
}

type DayLogRow = { id: number; at: string; day: string; action: string; by_name: string | null; note: string | null }
type ActivityRow = { id: number; at: string; user_name: string; kind: ActivityKind; slot_id: string | null; person_name: string | null; start_at: string | null; end_at: string | null; note: string | null }
export async function loadActivity(): Promise<ActivityEvent[]> {
  const [d, a] = await Promise.all([
    supabase.from('day_status_log').select('id, at, day, action, by_name, note').order('at', { ascending: false }).limit(2000),
    supabase.from('activity_log').select('id, at, user_name, kind, slot_id, person_name, start_at, end_at, note').order('at', { ascending: false }).limit(2000),
  ])
  const days: ActivityEvent[] = check<DayLogRow[]>(d).map((r) => ({
    key: `d${r.id}`, at: r.at, userName: r.by_name || 'Sistema', kind: r.action as ActivityKind, day: String(r.day).slice(0, 10), slot: null, personName: null, start: null, end: null, note: r.note,
  }))
  const ivs: ActivityEvent[] = check<ActivityRow[]>(a).map((r) => ({
    key: `a${r.id}`, at: r.at, userName: r.user_name, kind: r.kind, day: r.slot_id ? r.slot_id.slice(0, 10) : null, slot: r.slot_id, personName: r.person_name,
    start: r.start_at ? String(r.start_at).slice(0, 16).replace(' ', 'T') : null, end: r.end_at ? String(r.end_at).slice(0, 16).replace(' ', 'T') : null, note: r.note,
  }))
  return [...days, ...ivs].sort((x, y) => y.at.localeCompare(x.at))
}

/* ---------- Testi ---------- */

const ROME = 'Europe/Rome'
export const fmtTime = (iso: string) => new Intl.DateTimeFormat('it-IT', { timeZone: ROME, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('it-IT', { timeZone: ROME, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
export const fmtDate = (iso: string) => new Intl.DateTimeFormat('it-IT', { timeZone: ROME, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

/** "Lun 30 Nov · Notte" */
export const slotLabel = (slot: string) => `${fmtDay(slot.slice(0, 10))} · ${SLOT_LABEL[SLOT_BY_ID[slot]?.kind ?? (slot.endsWith('|D') ? 'WD' : 'FN')]}`
const who = (name: string | null, id: string | null) => name || (id ? 'persona eliminata' : '—')

/** Modifica in chiaro; con `withWhere` falso senza il turno davanti (quando è già nel titolo). */
export function describePlanChange(c: PlanChange, withWhere = true): string {
  const where = withWhere ? `${c.slot ? slotLabel(c.slot) : fmtDay(c.day)}: ` : ''
  switch (c.kind) {
    case 'assign': return `${where}assegnato a ${who(c.newName, c.newPerson)}`
    case 'unassign': return `${where}tolto (era ${who(c.oldName, c.oldPerson)})`
    case 'replace': return `${where}${who(c.oldName, c.oldPerson)} → ${who(c.newName, c.newPerson)}`
    case 'pin': return `${where}bloccato con la puntina (${who(c.newName, c.newPerson)})`
    case 'unpin': return `${where}puntina tolta (${who(c.newName, c.newPerson)})`
    case 'exclude': return `${where}giorno segnato come non richiesto`
    case 'include': return `${where}giorno di nuovo richiesto`
  }
}

/* ---------- Raggruppamenti ---------- */

/** Passaggi di una sessione: modifiche salvate insieme (a pochi secondi l'una dall'altra). */
export function groupSteps(changes: PlanChange[], gapMs = 5000): { at: string; changes: PlanChange[] }[] {
  const out: { at: string; changes: PlanChange[] }[] = []
  for (const c of [...changes].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)) {
    const last = out[out.length - 1]
    const prev = last?.changes[last.changes.length - 1]
    if (prev && new Date(c.at).getTime() - new Date(prev.at).getTime() <= gapMs) last.changes.push(c)
    else out.push({ at: c.at, changes: [c] })
  }
  return out
}

export interface SlotEntry { userName: string; from: string; to: string; changes: PlanChange[] }
export interface SlotHistory { key: string; day: string; slot: string | null; entries: SlotEntry[] }

/**
 * Storia per turno (o per giorno, per i giorni non richiesti): le modifiche consecutive della stessa persona
 * a meno di 30 minuti l'una dall'altra formano un'unica voce.
 */
export function groupBySlot(changes: PlanChange[], sessions: PlanSession[], gapMs = 30 * 60_000): SlotHistory[] {
  const userOf = new Map(sessions.map((s) => [s.id, s]))
  const byKey = new Map<string, PlanChange[]>()
  for (const c of changes) {
    const key = c.slot ?? `${c.day}|giorno`
    byKey.set(key, [...(byKey.get(key) ?? []), c])
  }
  const out: SlotHistory[] = []
  for (const [key, list] of byKey) {
    const entries: SlotEntry[] = []
    for (const c of list.sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)) {
      const s = userOf.get(c.sessionId)
      const name = s?.userName ?? 'Sistema'
      const uid = s?.userId ?? null
      const last = entries[entries.length - 1]
      const lastSession = last && userOf.get(last.changes[last.changes.length - 1].sessionId)
      if (last && (lastSession?.userId ?? null) === uid && last.userName === name && new Date(c.at).getTime() - new Date(last.to).getTime() < gapMs) {
        last.changes.push(c)
        last.to = c.at
      } else entries.push({ userName: name, from: c.at, to: c.at, changes: [c] })
    }
    out.push({ key, day: list[0].day, slot: list[0].slot, entries })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.slot ?? '').localeCompare(b.slot ?? ''))
}

/** Sessioni iniziate dopo quella scelta: un ripristino annulla anche le loro modifiche. */
export const laterSessions = (sessions: PlanSession[], s: PlanSession) =>
  sessions.filter((x) => x.id !== s.id && x.startedAt > s.startedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt))

/* ---------- Anteprima del ripristino ---------- */

export interface RestoreSlot { slot: string; from: string | null; to: string | null; pinFrom: boolean; pinTo: boolean }
export interface RestorePreview {
  slots: RestoreSlot[]
  exclude: string[]
  include: string[]
  /** turni diversi nei giorni erogati: restano come sono */
  lockedSlots: string[]
  /** turni della fotografia con persone che non esistono più: non si ripristinano */
  missing: string[]
}

/** Cosa cambierebbe riportando il piano attuale alla fotografia (stesse regole della funzione del database). */
export function restorePreview(
  current: { assignments: Assignments; pinned: string[]; excludedDays: string[] },
  snap: PlanSnapshot, erogati: ReadonlySet<string>, peopleIds: ReadonlySet<string>,
): RestorePreview {
  const pinned = new Set(current.pinned)
  const slots: RestoreSlot[] = [], lockedSlots: string[] = [], missing: string[] = []
  const keys = [...new Set([...Object.keys(current.assignments), ...Object.keys(snap.a)])].sort()
  for (const slot of keys) {
    const from = current.assignments[slot] ?? null
    const want = snap.a[slot]
    const to = want?.p ?? null
    const pinFrom = !!from && pinned.has(slot), pinTo = !!want?.pin
    if (from === to && pinFrom === pinTo) continue
    if (erogati.has(slot.slice(0, 10))) { lockedSlots.push(slot); continue }
    if (to && !peopleIds.has(to)) { missing.push(slot); continue }
    slots.push({ slot, from, to, pinFrom, pinTo })
  }
  const now = new Set(current.excludedDays), then = new Set(snap.x)
  return {
    slots, lockedSlots, missing,
    exclude: [...then].filter((d) => !now.has(d) && !erogati.has(d)).sort(),
    include: [...now].filter((d) => !then.has(d)).sort(),
  }
}

/* ---------- Dati e parametri ---------- */

export const AREA_LABEL: Record<DataArea, string> = { parametri: 'Parametri', anagrafica: 'Anagrafica', team: 'Team', account: 'Account', impostazioni: 'Impostazioni' }

const PCT = new Set(['majDom', 'majSab1', 'majSab2', 'otDayFirst', 'otDayNext', 'otNight', 'otHoliday', 'otHolidayNight'])
const EUR = new Set(['revenueFeriale', 'revenueFestivo', 'netFN', 'netWD', 'netWN', 'callFee'])
export const PARAM_LABEL: Record<string, string> = {
  revenueFeriale: 'Ricavo per notte feriale', revenueFestivo: 'Ricavo per giornata di weekend/festivo',
  netFN: 'Netto di riferimento, notte feriale', netWD: 'Netto di riferimento, diurno weekend/festivo', netWN: 'Netto di riferimento, notte weekend/festivo',
  capHours: 'Tetto ore', costMultiplier: 'Moltiplicatore costo aziendale',
  kNetLow: 'Coefficiente netto/lordo, RAL fino a 28.000 €', kNetMid: 'Coefficiente netto/lordo, RAL fino a 50.000 €', kNetHigh: 'Coefficiente netto/lordo, RAL oltre 50.000 €',
  majDom: 'Maggiorazione domenica (alternativa archiviata)', majSab1: 'Maggiorazione sabato, prime ore (alternativa archiviata)', majSab2: 'Maggiorazione sabato, ore successive (alternativa archiviata)',
  indemnitySplit: 'Indennità CCNL: intera o pro quota', indemnity: 'Tabella indennità CCNL',
  otDayFirst: 'Straordinario feriale diurno, prime ore', otDayFirstHours: 'Ore con la prima maggiorazione', otDayNext: 'Straordinario feriale diurno, ore successive',
  otNight: 'Straordinario notturno feriale', otHoliday: 'Straordinario festivo', otHolidayNight: 'Straordinario notturno festivo',
  otNightStart: 'Inizio fascia notturna', otNightEnd: 'Fine fascia notturna', otMinHours: 'Minimo riconosciuto per intervento',
  otToleranceMin: 'Tolleranza (minuti)', callFee: 'Eventuale compenso per intervento', hourlyDivisor: 'Divisore della paga oraria',
}
const GROUP_NAME: Record<string, string> = { g1: 'livelli D1, D2, C1', g2: 'livelli C2, C3', g3: 'livelli B1, B2, B3, A1' }

const num = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : String(v ?? '—'))
function paramValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (PCT.has(key) && typeof v === 'number') return `${(v * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
  if (EUR.has(key) && typeof v === 'number') return `${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  if ((key === 'otNightStart' || key === 'otNightEnd') && typeof v === 'number') return `${String(v).padStart(2, '0')}:00`
  if (key === 'indemnitySplit') return v === 'proquota' ? 'pro quota' : 'intera'
  return num(v)
}

/** Righe "campo: prima → dopo" dei parametri (la tabella indennità cella per cella). */
function paramLines(changes: DataChange['changes']): string[] {
  const out: string[] = []
  for (const [key, ch] of Object.entries(changes)) {
    if (ch === true) continue
    const [o, n] = ch
    if (key === 'indemnity' && o && n && typeof o === 'object' && typeof n === 'object') {
      for (const g of ['g1', 'g2', 'g3']) for (const d of ['feriale', 'sabato', 'domenica']) {
        const a = (o as Record<string, Record<string, unknown>>)[g]?.[d], b = (n as Record<string, Record<string, unknown>>)[g]?.[d]
        if (a !== b) out.push(`Indennità CCNL ${GROUP_NAME[g]}, ${d === 'domenica' ? 'domenica/festivo' : d}: ${num(a)} → ${num(b)}`)
      }
      continue
    }
    out.push(`${PARAM_LABEL[key] ?? key}: ${paramValue(key, o)} → ${paramValue(key, n)}`)
  }
  return out
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Nome', active: 'In rotazione', team: 'Team', availability: 'Disponibilità', max_per_month: 'Massimo turni al mese',
  unavailable: 'Giorni non disponibile', preferred_days: 'Giorni disponibile', reserve: 'Riserva', reserve_order: 'Ordine tra le riserve', email: 'Email',
  level: 'Livello', ral: 'RAL', ral_nd: 'RAL Q/',
  display_name: 'Nome', role: 'Profilo', person_id: 'Scheda collegata', turnista_view: 'Visibilità del Turnista', summary_all: 'Riepilogo di tutti i team',
  must_change_password: 'Password', full_view_allowed: 'Calcoli e importi: abilitazione', full_view: 'Calcoli e importi',
  label: 'Nome del team', turnista_names: 'Visibilità dei Turnisti',
}
const AVAIL: Record<string, string> = { volontario: 'volontario', limitato: 'con un limite al mese', nessuna: 'nessuna preferenza' }
const NAMES: Record<string, string> = { all: 'tutti i turni', own: 'solo i propri turni', per_user: 'per persona' }

export interface DataCtx { teams: TeamDir; personName: (id: string) => string | undefined }

function fieldValue(key: string, v: unknown, ctx: DataCtx): string {
  if (v === null || v === undefined || v === '') return '—'
  switch (key) {
    case 'active': return v ? 'sì' : 'KO'
    case 'reserve': case 'summary_all': case 'ral_nd': case 'full_view_allowed': case 'full_view': return v ? 'sì' : 'no'
    case 'team': return teamLabel(ctx.teams, String(v))
    case 'availability': return AVAIL[String(v)] ?? String(v)
    case 'role': return ROLE_LABEL[v as Role] ?? String(v)
    case 'person_id': return ctx.personName(String(v)) ?? 'scheda eliminata'
    case 'turnista_view': case 'turnista_names': return NAMES[String(v)] ?? String(v)
    case 'must_change_password': return v ? 'provvisoria (da cambiare)' : 'personale'
    default: return Array.isArray(v) ? v.join(', ') : String(v)
  }
}

/** Righe di una voce di anagrafica, team, account o impostazioni. */
function fieldLines(changes: DataChange['changes'], ctx: DataCtx, action: DataChange['action']): string[] {
  const out: string[] = []
  for (const [key, ch] of Object.entries(changes)) {
    const label = FIELD_LABEL[key] ?? key
    if (ch === true) { out.push(`${label}: modificato (valore non registrato)`); continue }
    const [o, n] = ch
    if (Array.isArray(o) || Array.isArray(n)) {
      const a = new Set((o as string[] | null) ?? []), b = new Set((n as string[] | null) ?? [])
      const added = [...b].filter((x) => !a.has(x)).sort(), removed = [...a].filter((x) => !b.has(x)).sort()
      const days = (l: string[]) => l.map((d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDay(d) : d)).join(', ')
      if (added.length) out.push(`${label}: aggiunti ${days(added)}`)
      if (removed.length) out.push(`${label}: tolti ${days(removed)}`)
      continue
    }
    if (action === 'insert') out.push(`${label}: ${fieldValue(key, n, ctx)}`)
    else if (action === 'delete') out.push(`${label}: ${fieldValue(key, o, ctx)}`)
    else out.push(`${label}: ${fieldValue(key, o, ctx)} → ${fieldValue(key, n, ctx)}`)
  }
  return out
}

/** Titolo e righe leggibili di una voce dei dati. */
export function describeData(d: DataChange, ctx: DataCtx): { title: string; lines: string[] } {
  const name = d.targetName || '—'
  if (d.area === 'parametri') return { title: 'Parametri modificati', lines: paramLines(d.changes) }
  const verb = d.action === 'insert'
    ? { anagrafica: 'Aggiunta la risorsa', team: 'Creato il team', account: "Creato l'account", impostazioni: 'Impostato', parametri: '' }[d.area]
    : d.action === 'delete'
      ? { anagrafica: 'Eliminata la risorsa', team: 'Eliminato il team', account: "Eliminato l'account", impostazioni: 'Tolto', parametri: '' }[d.area]
      : { anagrafica: 'Modificata la risorsa', team: 'Rinominato il team', account: "Modificato l'account", impostazioni: 'Modificato', parametri: '' }[d.area]
  const lines = fieldLines(d.changes, ctx, d.action)
  if (d.restricted && d.area === 'anagrafica') return { title: `${name}: livello o RAL modificati`, lines }
  return { title: d.area === 'impostazioni' ? name : `${verb} ${name}`, lines }
}

/* ---------- Attività ---------- */

export const ACTIVITY_GROUP: Record<ActivityKind, 'giorni' | 'interventi' | 'decisioni'> = {
  erogato: 'giorni', consuntivato: 'giorni', sblocco_erogato: 'giorni', sblocco_consuntivato: 'giorni',
  iv_insert: 'interventi', iv_update: 'interventi', iv_delete: 'interventi', no_int: 'interventi', no_int_clear: 'interventi',
  iv_approved: 'decisioni', iv_rejected: 'decisioni', iv_pending: 'decisioni',
}

const span = (start: string | null, end: string | null) => {
  if (!start || !end) return ''
  const sameDay = start.slice(0, 10) === end.slice(0, 10)
  return ` ${start.slice(11, 16)}–${sameDay ? '' : `${fmtDay(end.slice(0, 10))} `}${end.slice(11, 16)}`
}

/** Testo di un evento dell'attività. */
export function describeActivity(e: ActivityEvent): { title: string; detail: string } {
  const shift = e.slot ? slotLabel(e.slot) : e.day ? fmtDay(e.day) : ''
  const iv = `${e.personName ?? 'persona eliminata'} · turno ${shift}${span(e.start, e.end)}`
  switch (e.kind) {
    case 'erogato': return { title: `Giorno segnato erogato: ${shift}`, detail: '' }
    case 'consuntivato': return { title: `Giorno consuntivato: ${shift}`, detail: '' }
    case 'sblocco_erogato': return { title: `Sbloccato (da erogato ad aperto): ${shift}`, detail: e.note ? `Motivo: ${e.note}` : '' }
    case 'sblocco_consuntivato': return { title: `Sbloccato (da consuntivato a erogato): ${shift}`, detail: e.note ? `Motivo: ${e.note}` : '' }
    case 'iv_insert': return { title: 'Intervento inserito', detail: `${iv}${e.note ? ` · nota: ${e.note}` : ''}` }
    case 'iv_update': return { title: 'Intervento modificato (torna in approvazione)', detail: `${iv}${e.note ? ` · ${e.note}` : ''}` }
    case 'iv_delete': return { title: 'Intervento eliminato', detail: iv }
    case 'iv_approved': return { title: 'Intervento approvato', detail: iv }
    case 'iv_rejected': return { title: 'Intervento rifiutato', detail: `${iv}${e.note ? ` · motivo: ${e.note}` : ''}` }
    case 'iv_pending': return { title: 'Intervento riportato in approvazione', detail: iv }
    case 'no_int': return { title: '"Nessun intervento" dichiarato', detail: `${e.personName ?? 'persona eliminata'} · turno ${shift}` }
    case 'no_int_clear': return { title: '"Nessun intervento" ritirato', detail: `${e.personName ?? 'persona eliminata'} · turno ${shift}` }
  }
}
