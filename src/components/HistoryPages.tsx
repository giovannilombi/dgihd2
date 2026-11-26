import { useCallback, useEffect, useMemo, useState } from 'react'
import { fmtDay } from '../lib/calendar'
import type { DayStatusMap } from '../lib/dayStatus'
import {
  ACTIVITY_GROUP, AREA_LABEL, describeActivity, describeData, describePlanChange, fmtDate, fmtTime, groupBySlot, groupSteps, laterSessions,
  loadActivity, loadDataChanges, loadPlanHistory, loadSnapshot, restorePreview, restoreSession, slotLabel,
  type ActivityEvent, type DataArea, type DataChange, type PlanChange, type PlanSession, type PlanSnapshot, type RestorePreview,
} from '../lib/history'
import { useTeams } from '../lib/useTeams'
import type { Assignments, Person } from '../lib/types'
import { Button } from './ui'

/** Pagine dello storico: Turni, Dati e parametri, Attività. */
export type HistoryPageId = 'storico' | 'storico-dati' | 'attivita'
const PAGES: [HistoryPageId, string][] = [['storico', 'Turni'], ['storico-dati', 'Dati e parametri'], ['attivita', 'Attività']]

export function HistoryNav({ page }: { page: HistoryPageId }) {
  return (
    <nav aria-label="Storico" className="mb-5 flex gap-6 border-b border-slate-200 text-sm font-medium">
      {PAGES.map(([id, label]) => (
        <a key={id} href={`#/${id}`} aria-current={page === id ? 'page' : undefined}
          className={`-mb-px border-b-2 px-1 py-2.5 ${page === id ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</a>
      ))}
    </nav>
  )
}

const seg = (on: boolean) => `inline-flex h-8 items-center rounded-md px-3 font-medium ${on ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`
const chip = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${on ? 'bg-blue-700 text-white ring-blue-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`

/** Caricamento con stato, errore e "Aggiorna". */
function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    try { setData(await load()); setError('') } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [load])
  useEffect(() => { void Promise.resolve().then(reload) }, [reload])
  return { data, error, loading, reload }
}

function Toolbar({ loading, onReload, children }: { loading: boolean; onReload: () => void; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {children}
      <Button className="ml-auto h-9" disabled={loading} onClick={onReload}>{loading ? 'Caricamento…' : 'Aggiorna'}</Button>
    </div>
  )
}

/** Elenco lungo: i primi `step` elementi, poi "Mostra altri". */
function useMore(total: number, step = 50) {
  const [n, setN] = useState(step)
  return { shown: Math.min(n, total), more: total > n ? () => setN((x) => x + step) : undefined }
}

/* ---------- 1. Turni ---------- */

interface PlanProps {
  canRestore: boolean
  /** Sorgenti dei dati (sostituibili per l'anteprima) */
  api?: { load: typeof loadPlanHistory; snapshot: typeof loadSnapshot; restore: typeof restoreSession }
  current: { assignments: Assignments; pinned: string[]; excludedDays: string[] }
  people: Person[]
  days: DayStatusMap
}

const PLAN_API = { load: loadPlanHistory, snapshot: loadSnapshot, restore: restoreSession }

export function PlanHistory({ canRestore, current, people, days, api = PLAN_API }: PlanProps) {
  const { data, error, loading, reload } = useLoad(api.load)
  const [tab, setTab] = useState<'persona' | 'turno'>('persona')
  const [restoring, setRestoring] = useState<PlanSession | null>(null)
  const [notice, setNotice] = useState('')
  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Ogni modifica a turni, puntine e giorni non richiesti, con chi l'ha fatta. Le modifiche della stessa persona a meno di 30 minuti l'una dall'altra formano una sessione;
        {canRestore ? ' puoi riportare il piano com\'era prima di qualunque sessione.' : ' il ripristino lo fa lo Space admin.'}
      </p>
      <Toolbar loading={loading} onReload={() => void reload()}>
        <div className="inline-flex h-9 items-center rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Raggruppa">
          <button type="button" role="radio" aria-checked={tab === 'persona'} onClick={() => setTab('persona')} className={seg(tab === 'persona')}>Per persona</button>
          <button type="button" role="radio" aria-checked={tab === 'turno'} onClick={() => setTab('turno')} className={seg(tab === 'turno')}>Per turno</button>
        </div>
      </Toolbar>
      {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Storico non disponibile: {error}</p>}
      {data && !data.sessions.length && <Empty>Nessuna modifica registrata finora.</Empty>}
      {data && data.sessions.length > 0 && (tab === 'persona'
        ? <BySession sessions={data.sessions} changes={data.changes} canRestore={canRestore} onRestore={setRestoring} />
        : <BySlot sessions={data.sessions} changes={data.changes} />)}
      {restoring && data && (
        <RestoreDialog api={api} session={restoring} sessions={data.sessions} current={current} people={people} days={days}
          onClose={() => setRestoring(null)}
          onDone={(text) => { setRestoring(null); setNotice(text); void reload() }} />
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{children}</p>
}

function BySession({ sessions, changes, canRestore, onRestore }: { sessions: PlanSession[]; changes: PlanChange[]; canRestore: boolean; onRestore: (s: PlanSession) => void }) {
  const [person, setPerson] = useState('')
  const names = useMemo(() => [...new Set(sessions.map((s) => s.userName))].sort((a, b) => a.localeCompare(b, 'it')), [sessions])
  const bySession = useMemo(() => {
    const m = new Map<number, PlanChange[]>()
    for (const c of changes) m.set(c.sessionId, [...(m.get(c.sessionId) ?? []), c])
    return m
  }, [changes])
  const list = sessions.filter((s) => !person || s.userName === person)
  const { shown, more } = useMore(list.length, 30)
  return (
    <div className="space-y-3">
      <label className="relative inline-flex">
        <span className="sr-only">Persona</span>
        <select value={person} onChange={(e) => setPerson(e.target.value)} className="h-9 appearance-none rounded-lg bg-white pl-3 pr-9 text-sm ring-1 ring-inset ring-slate-300">
          <option value="">Tutte le persone</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 8l5 5 5-5" /></svg>
      </label>
      {list.slice(0, shown).map((s, i) => {
        const steps = groupSteps(bySession.get(s.id) ?? [])
        const restoredFrom = s.restoreOf ? sessions.find((x) => x.id === s.restoreOf) : undefined
        return (
          <details key={s.id} open={i === 0} className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 marker:hidden">
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M8 5l5 5-5 5" /></svg>
              <strong className="text-slate-900">{s.userName}</strong>
              <span className="text-sm text-slate-600">{fmtDate(s.startedAt)}, {fmtTime(s.startedAt)}{fmtTime(s.lastAt) !== fmtTime(s.startedAt) ? `–${fmtTime(s.lastAt)}` : ''}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{s.changes} {s.changes === 1 ? 'modifica' : 'modifiche'}</span>
              {s.restoreOf && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">Ripristino{restoredFrom ? ` com'era prima della sessione di ${restoredFrom.userName} del ${fmtDate(restoredFrom.startedAt)}, ${fmtTime(restoredFrom.startedAt)}` : ''}</span>}
              {canRestore && (
                <Button className="ml-auto" onClick={(e) => { e.preventDefault(); onRestore(s) }}>Ripristina com'era prima</Button>
              )}
            </summary>
            <div className="space-y-3 border-t border-slate-100 px-4 py-3">
              {steps.map((st) => <Step key={st.at + st.changes[0].id} at={st.at} changes={st.changes} />)}
            </div>
          </details>
        )
      })}
      {more && <Button onClick={more}>Mostra altre sessioni</Button>}
    </div>
  )
}

function Step({ at, changes }: { at: string; changes: PlanChange[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? changes : changes.slice(0, 8)
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-12 shrink-0 tabular-nums text-slate-500">{fmtTime(at)}</span>
      <div className="min-w-0 flex-1">
        {changes.length > 1 && <div className="mb-0.5 text-xs font-medium text-slate-500">{changes.length} modifiche salvate insieme</div>}
        <ul className="space-y-0.5 text-slate-800">{shown.map((c) => <li key={c.id}>{describePlanChange(c)}</li>)}</ul>
        {changes.length > shown.length && <button type="button" onClick={() => setAll(true)} className="mt-1 text-xs font-medium text-blue-700 hover:underline">Mostra tutte ({changes.length})</button>}
      </div>
    </div>
  )
}

function BySlot({ sessions, changes }: { sessions: PlanSession[]; changes: PlanChange[] }) {
  const [month, setMonth] = useState('')
  const [q, setQ] = useState('')
  const months = useMemo(() => [...new Set(changes.map((c) => c.day.slice(0, 7)))].sort(), [changes])
  const all = useMemo(() => groupBySlot(changes, sessions), [changes, sessions])
  const needle = q.trim().toLowerCase()
  const list = all.filter((h) => (!month || h.day.startsWith(month)) && (!needle || h.entries.some((e) =>
    e.userName.toLowerCase().includes(needle) || e.changes.some((c) => `${c.oldName ?? ''} ${c.newName ?? ''}`.toLowerCase().includes(needle)))))
  const { shown, more } = useMore(list.length, 60)
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative inline-flex">
          <span className="sr-only">Mese del turno</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 appearance-none rounded-lg bg-white pl-3 pr-9 text-sm ring-1 ring-inset ring-slate-300">
            <option value="">Tutti i mesi</option>
            {months.map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
          </select>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 8l5 5 5-5" /></svg>
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca persona" aria-label="Cerca persona"
          className="h-9 w-56 rounded-lg px-3 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      {!list.length && <Empty>Nessun turno modificato con questi filtri.</Empty>}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {list.slice(0, shown).map((h) => (
          <div key={h.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
            <div className="font-medium text-slate-900">{h.slot ? slotLabel(h.slot) : `${fmtDay(h.day)} · giorno intero`}</div>
            <ol className="space-y-1.5 text-sm">
              {h.entries.map((e, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-900">{e.userName}</span>
                  <span className="text-slate-500"> · {fmtDate(e.from)}, {fmtTime(e.from)}{fmtTime(e.to) !== fmtTime(e.from) ? `–${fmtTime(e.to)}` : ''}</span>
                  <div className="text-slate-700">{e.changes.map((c) => describePlanChange(c, false)).join(' · ')}</div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {more && <Button onClick={more}>Mostra altri turni</Button>}
    </div>
  )
}

function RestoreDialog({ api, session, sessions, current, people, days, onClose, onDone }: {
  api: NonNullable<PlanProps['api']>; session: PlanSession; sessions: PlanSession[]; current: PlanProps['current']; people: Person[]; days: DayStatusMap
  onClose: () => void; onDone: (text: string) => void
}) {
  const [snap, setSnap] = useState<PlanSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const names = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people])
  useEffect(() => {
    let off = false
    api.snapshot(session.id).then((x) => { if (!off) setSnap(x) }).catch((e) => { if (!off) setError((e as Error).message) })
    return () => { off = true }
  }, [session.id, api])
  const preview: RestorePreview | null = useMemo(
    () => (snap ? restorePreview(current, snap, new Set(Object.keys(days)), new Set(people.map((p) => p.id))) : null),
    [snap, current, days, people],
  )
  const later = laterSessions(sessions, session)
  const nm = (id: string | null) => (id ? names.get(id) ?? 'persona eliminata' : 'nessuno')
  const lines = preview ? [
    ...preview.slots.map((s) => s.from === s.to
      ? `${slotLabel(s.slot)}: ${s.pinTo ? 'rimessa la puntina' : 'tolta la puntina'} (${nm(s.to)})`
      : `${slotLabel(s.slot)}: ${nm(s.from)} → ${nm(s.to)}${s.pinTo ? ' (con puntina)' : ''}`),
    ...preview.exclude.map((d) => `${fmtDay(d)}: torna non richiesto`),
    ...preview.include.map((d) => `${fmtDay(d)}: torna richiesto`),
  ] : []
  const run = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await api.restore(session.id)
      onDone(`Piano ripristinato com'era il ${fmtDate(session.startedAt)} alle ${fmtTime(session.startedAt)}: ${r.changes} ${r.changes === 1 ? 'modifica' : 'modifiche'}.${r.missing_people ? ` ${r.missing_people} turni di persone eliminate non ripristinati.` : ''} Il ripristino è nello storico e si può annullare.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="rs-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="rs-title" className="text-lg font-semibold text-slate-900">Ripristinare il piano?</h3>
        <p className="mt-1 text-sm text-slate-600">Turni, puntine e giorni non richiesti tornano com'erano <strong>prima della sessione di {session.userName}</strong> del {fmtDate(session.startedAt)}, {fmtTime(session.startedAt)}.</p>
        {!preview && !error && <p className="mt-4 text-sm text-slate-500">Calcolo delle differenze…</p>}
        {preview && (
          <>
            {later.length > 0 && (
              <div role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                <strong>Annulla anche le modifiche successive:</strong>
                <ul className="mt-1 list-disc pl-5">{later.slice(0, 8).map((s) => <li key={s.id}>{s.userName}, {fmtDate(s.startedAt)} {fmtTime(s.startedAt)} ({s.changes} {s.changes === 1 ? 'modifica' : 'modifiche'})</li>)}</ul>
                {later.length > 8 && <div className="mt-1">e altre {later.length - 8} sessioni.</div>}
              </div>
            )}
            <div className="mt-4 text-sm font-semibold text-slate-900">{lines.length ? `Cosa cambia (${lines.length})` : 'Il piano è già com\'era: non cambia nulla.'}</div>
            {lines.length > 0 && <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto rounded-lg bg-slate-50 p-2.5 text-sm text-slate-800">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
            {preview.lockedSlots.length > 0 && <p className="mt-3 text-xs text-slate-600">{preview.lockedSlots.length} {preview.lockedSlots.length === 1 ? 'turno resta' : 'turni restano'} come {preview.lockedSlots.length === 1 ? 'è' : 'sono'}: giorni già erogati ({[...new Set(preview.lockedSlots.map((s) => fmtDay(s.slice(0, 10))))].join(', ')}).</p>}
            {preview.missing.length > 0 && <p className="mt-1 text-xs text-slate-600">{preview.missing.length} {preview.missing.length === 1 ? 'turno non si ripristina' : 'turni non si ripristinano'}: la persona non è più in anagrafica.</p>}
          </>
        )}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button variant="danger" disabled={busy || !preview || !lines.length} onClick={() => void run()}>{busy ? 'Ripristino…' : 'Ripristina'}</Button>
        </div>
      </div>
    </div>
  )
}

/* ---------- 2. Dati e parametri ---------- */

const AREAS: DataArea[] = ['parametri', 'anagrafica', 'team', 'account', 'impostazioni']

/** Voci per giorno, con intestazione della data. */
function byDay<T extends { at: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const x of list) { const k = fmtDate(x.at); m.set(k, [...(m.get(k) ?? []), x]) }
  return [...m]
}

export function DataHistory({ full, people, load = loadDataChanges }: { full: boolean; people: Person[]; load?: typeof loadDataChanges }) {
  const teams = useTeams()
  const { data, error, loading, reload } = useLoad(load)
  const [area, setArea] = useState<DataArea | null>(null)
  const names = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people])
  // voci riservate (livello e RAL, vista completa): solo con la vista completa attiva
  const list = (data ?? []).filter((d) => (!d.restricted || full) && (!area || d.area === area))
  const { shown, more } = useMore(list.length, 80)
  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">Modifiche a parametri, anagrafica, team, account e impostazioni, con chi le ha fatte e il valore prima e dopo.</p>
      <Toolbar loading={loading} onReload={() => void reload()}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Area">
          <button type="button" role="radio" aria-checked={!area} onClick={() => setArea(null)} className={chip(!area)}>Tutte</button>
          {AREAS.map((a) => <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => setArea(a)} className={chip(area === a)}>{AREA_LABEL[a]}</button>)}
        </div>
      </Toolbar>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Storico non disponibile: {error}</p>}
      {data && !list.length && <Empty>Nessuna modifica registrata{area ? ` in ${AREA_LABEL[area].toLowerCase()}` : ''} finora.</Empty>}
      <div className="space-y-5">
        {byDay(list.slice(0, shown)).map(([day, items]) => (
          <section key={day}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{day}</h3>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {items.map((d: DataChange) => {
                const { title, lines } = describeData(d, { teams, personName: (id) => names.get(id) })
                return (
                  <li key={d.id} className="flex gap-3 px-4 py-2.5 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-slate-500">{fmtTime(d.at)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-semibold text-slate-600">{AREA_LABEL[d.area]}</span>
                        <span className="font-medium text-slate-900">{title}</span>
                        <span className="text-slate-500">· {d.userName}</span>
                      </div>
                      {lines.length > 0 && <ul className="mt-0.5 text-slate-700">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      {more && <Button className="mt-4" onClick={more}>Mostra altre</Button>}
    </div>
  )
}

/* ---------- 3. Attività ---------- */

const GROUPS = [['giorni', 'Conferme dei giorni'], ['interventi', 'Interventi'], ['decisioni', 'Approvazioni e rifiuti']] as const

export function ActivityHistory({ load = loadActivity }: { load?: typeof loadActivity }) {
  const { data, error, loading, reload } = useLoad(load)
  const [group, setGroup] = useState<(typeof GROUPS)[number][0] | null>(null)
  const list = (data ?? []).filter((e: ActivityEvent) => !group || ACTIVITY_GROUP[e.kind] === group)
  const { shown, more } = useMore(list.length, 80)
  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">Giorni segnati erogati, consuntivati e sbloccati; interventi inseriti, modificati ed eliminati, "Nessun intervento", approvazioni e rifiuti.</p>
      <Toolbar loading={loading} onReload={() => void reload()}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo">
          <button type="button" role="radio" aria-checked={!group} onClick={() => setGroup(null)} className={chip(!group)}>Tutte</button>
          {GROUPS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={group === k} onClick={() => setGroup(k)} className={chip(group === k)}>{l}</button>)}
        </div>
      </Toolbar>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Attività non disponibile: {error}</p>}
      {data && !list.length && <Empty>Nessuna attività registrata finora.</Empty>}
      <div className="space-y-5">
        {byDay(list.slice(0, shown)).map(([day, items]) => (
          <section key={day}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{day}</h3>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {items.map((e) => {
                const { title, detail } = describeActivity(e)
                return (
                  <li key={e.key} className="flex gap-3 px-4 py-2.5 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-slate-500">{fmtTime(e.at)}</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">{title}</span>
                      <span className="text-slate-500"> · {e.userName}</span>
                      {detail && <div className="text-slate-700">{detail}</div>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      {more && <Button className="mt-4" onClick={more}>Mostra altre</Button>}
    </div>
  )
}
