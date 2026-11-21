import { useEffect, useMemo, useState } from 'react'
import { SLOT_BY_ID, SLOT_HOURS, SLOT_LABEL, fmtDay } from '../lib/calendar'
import { romeNow } from '../lib/dayStatus'
import { bySlot, resolveTimes, shiftChip, type Intervention, type MyShifts } from '../lib/interventions'
import { fmtMinutes, recognizedHours, shiftWindow, stampToMin } from '../lib/overtime'
import { DEFAULT_PARAMS, type Params } from '../lib/types'
import { addIntervention, clearNoIntervention, declareNoIntervention, deleteIntervention, updateIntervention } from '../lib/useInterventions'
import { InterventionChip } from './InterventionChip'
import { Badge, Button } from './ui'

type Tab = 'todo' | 'pending' | 'approved' | 'rejected'

const shiftLabel = (slot: string) => {
  const s = SLOT_BY_ID[slot]
  return s ? `${fmtDay(s.date)} · ${SLOT_LABEL[s.kind]} ${SLOT_HOURS[s.kind]}` : slot
}
/** "sab 26 dic 22:40" */
const fmtStamp = (s: string) => `${fmtDay(s.slice(0, 10))} ${s.slice(11, 16)}`
const fmtRange = (a: string, b: string) => (a.slice(0, 10) === b.slice(0, 10) ? `${fmtStamp(a)} → ${b.slice(11, 16)}` : `${fmtStamp(a)} → ${fmtStamp(b)}`)
const fmtDecided = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' }) : '')

/**
 * I miei interventi: per ogni turno finito si indica "Nessun intervento" oppure uno o più interventi
 * (inizio, fine anche dopo mezzanotte, nota). Si modificano o eliminano finché non sono approvati;
 * un intervento rifiutato si corregge e si rimanda con un commento. Le regole le applica il database.
 */
export function MyInterventions({ data, error, reload, rules }: { data: MyShifts | null; error: string | null; reload: () => Promise<void>; rules?: Partial<Params> }) {
  const p = { ...DEFAULT_PARAMS, ...rules }
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t) }, [])
  const stamp = romeNow(now)
  const [tab, setTab] = useState<Tab | null>(null)
  const [form, setForm] = useState<{ slot: string; edit?: Intervention } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [adding, setAdding] = useState('')

  const view = useMemo(() => {
    if (!data) return null
    const ivBySlot = bySlot(data.interventions)
    const cons = new Set(data.shifts.filter((s) => s.consuntivato).map((s) => s.slot))
    const todo = data.shifts.filter((s) => !s.consuntivato && shiftChip(s.slot, ivBySlot[s.slot] ?? [], s.noIntervention, stamp).chip === 'todo').map((s) => s.slot)
    const declaredNone = data.shifts.filter((s) => s.noIntervention && !s.consuntivato).map((s) => s.slot)
    const reportable = data.shifts.filter((s) => !s.consuntivato && stamp >= shiftWindow(s.slot).start).map((s) => s.slot)
    const pick = (st: Intervention['status']) => data.interventions.filter((x) => x.status === st).sort((a, b) => a.start.localeCompare(b.start))
    return { ivBySlot, cons, todo, declaredNone, reportable, pending: pick('pending'), approved: pick('approved'), rejected: pick('rejected') }
  }, [data, stamp])

  if (!data || !view) return error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Interventi non disponibili: {error}</p> : <p className="py-10 text-center text-sm text-slate-500">Caricamento…</p>
  if (!data.me) return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Il tuo account non è collegato a una scheda del piano: chiedi al super admin di collegarlo per segnalare gli interventi.</p>

  const current: Tab = tab ?? (view.todo.length ? 'todo' : view.rejected.length ? 'rejected' : 'pending')
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    setMsg(null)
    try { await fn(); setMsg({ tone: 'ok', text: ok }); setForm(null); await reload() } catch (e) { setMsg({ tone: 'error', text: (e as Error).message }) } finally { setBusy(false) }
  }
  const tabs: [Tab, string, number][] = [['todo', 'Da compilare', view.todo.length], ['pending', 'In approvazione', view.pending.length], ['approved', 'Approvati', view.approved.length], ['rejected', 'Rifiutati', view.rejected.length]]

  const formFor = (slot: string, edit?: Intervention) => form && form.slot === slot && form.edit?.id === edit?.id && (
    <IvForm slot={slot} edit={edit} p={p} busy={busy} onCancel={() => setForm(null)}
      onSubmit={(start, end, note, comment) => void run(
        () => (edit ? updateIntervention(edit.id, start, end, note, comment) : addIntervention(slot, start, end, note)),
        edit?.status === 'rejected' ? 'Intervento rimandato in approvazione.' : edit ? 'Intervento modificato.' : 'Intervento segnalato: è in approvazione.')} />
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Per ogni turno finito indica <strong>Nessun intervento</strong> oppure gli interventi fatti (inizio, fine e una nota). Puoi modificarli o eliminarli finché non vengono approvati; se uno viene rifiutato, correggilo e rimandalo con un commento.</p>
      <div role="tablist" aria-label="Stato" className="flex flex-wrap gap-x-5 border-b border-slate-200 text-sm font-medium">
        {tabs.map(([k, label, count]) => (
          <button key={k} type="button" role="tab" aria-selected={current === k} onClick={() => { setTab(k); setForm(null) }}
            className={`-mb-px border-b-2 px-1 py-2.5 ${current === k ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label} <span className={`ml-0.5 rounded-full px-1.5 text-xs ${k === 'todo' && count ? 'bg-orange-100 text-orange-900' : k === 'rejected' && count ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
          </button>
        ))}
      </div>
      {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${msg.tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{msg.text}</p>}

      {current === 'todo' && (
        <div className="space-y-3">
          {view.todo.length === 0 && <p className="text-sm text-slate-500">Nessun turno da compilare.</p>}
          {view.todo.map((slot) => (
            <div key={slot} className="rounded-xl border border-orange-200 bg-white p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <InterventionChip info={{ chip: 'todo', count: 0 }} />
                <strong className="text-sm text-slate-900">{shiftLabel(slot)}</strong>
                <span className="ml-auto flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => void run(() => declareNoIntervention(slot), 'Registrato: nessun intervento.')}>Nessun intervento</Button>
                  <Button variant="primary" disabled={busy} onClick={() => setForm({ slot })}>+ Intervento</Button>
                </span>
              </div>
              {formFor(slot)}
            </div>
          ))}
          {view.declaredNone.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-slate-800">Turni dichiarati senza interventi</h3>
              <ul className="mt-2 space-y-1.5">
                {view.declaredNone.map((slot) => (
                  <li key={slot} className="flex flex-wrap items-center gap-2 text-sm">
                    <InterventionChip info={{ chip: 'nothing', count: 0 }} />
                    <span className="text-slate-700">{shiftLabel(slot)}</span>
                    <button type="button" disabled={busy} onClick={() => void run(() => clearNoIntervention(slot), 'Dichiarazione annullata: il turno torna da compilare.')} className="ml-auto text-xs font-medium text-blue-700 hover:underline">Annulla</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {current === 'pending' && (
        <div className="space-y-3">
          {view.pending.length === 0 && <p className="text-sm text-slate-500">Nessun intervento in approvazione.</p>}
          {view.pending.map((iv) => (
            <IvCard key={iv.id} iv={iv} p={p} locked={view.cons.has(iv.slot)}>
              {!view.cons.has(iv.slot) && (
                <span className="flex gap-2">
                  <Button disabled={busy} onClick={() => setForm({ slot: iv.slot, edit: iv })}>Modifica</Button>
                  <Button variant="ghost" className="text-red-700" disabled={busy} onClick={() => confirm('Eliminare questo intervento?') && void run(() => deleteIntervention(iv.id), 'Intervento eliminato.')}>Elimina</Button>
                </span>
              )}
              {formFor(iv.slot, iv)}
            </IvCard>
          ))}
          {view.reportable.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
              <label className="text-xs font-medium text-slate-600">Segnala un intervento su un tuo turno
                <select value={adding} onChange={(e) => setAdding(e.target.value)} className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
                  <option value="">— scegli il turno —</option>
                  {view.reportable.map((slot) => <option key={slot} value={slot}>{shiftLabel(slot)}</option>)}
                </select>
              </label>
              <Button variant="primary" disabled={!adding || busy} onClick={() => setForm({ slot: adding })}>+ Intervento</Button>
              {adding && formFor(adding)}
            </div>
          )}
        </div>
      )}

      {current === 'approved' && (
        <div className="space-y-3">
          {view.approved.length === 0 && <p className="text-sm text-slate-500">Nessun intervento approvato.</p>}
          {view.approved.map((iv) => (
            <IvCard key={iv.id} iv={iv} p={p} locked>
              <span className="text-xs text-slate-500">da {iv.decidedByName ?? '—'}, {fmtDecided(iv.decidedAt)} · non più modificabile</span>
            </IvCard>
          ))}
        </div>
      )}

      {current === 'rejected' && (
        <div className="space-y-3">
          {view.rejected.length === 0 && <p className="text-sm text-slate-500">Nessun intervento rifiutato.</p>}
          {view.rejected.map((iv) => (
            <IvCard key={iv.id} iv={iv} p={p} locked={view.cons.has(iv.slot)} tone="red">
              <div className="w-full rounded-lg bg-red-50 px-2.5 py-2 text-sm text-red-900">Motivo: “{iv.rejectReason}” <span className="text-xs text-red-700">({iv.decidedByName}, {fmtDecided(iv.decidedAt)})</span></div>
              {!view.cons.has(iv.slot) && (
                <span className="flex gap-2">
                  <Button variant="primary" disabled={busy} onClick={() => setForm({ slot: iv.slot, edit: iv })}>Correggi e rimanda</Button>
                  <Button variant="ghost" className="text-red-700" disabled={busy} onClick={() => confirm('Eliminare questo intervento?') && void run(() => deleteIntervention(iv.id), 'Intervento eliminato.')}>Elimina</Button>
                </span>
              )}
              {formFor(iv.slot, iv)}
            </IvCard>
          ))}
        </div>
      )}
    </div>
  )
}

function IvCard({ iv, p, locked, tone, children }: { iv: Intervention; p: Params; locked?: boolean; tone?: 'red'; children?: React.ReactNode }) {
  const minutes = stampToMin(iv.end) - stampToMin(iv.start)
  const chip = iv.status === 'approved' ? { chip: 'approved' as const, count: 1 } : iv.status === 'rejected' ? { chip: 'rejected' as const, count: 1 } : { chip: 'pending' as const, count: 1 }
  return (
    <div className={`rounded-xl border bg-white p-3 sm:p-4 ${tone === 'red' ? 'border-red-200' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <InterventionChip info={chip} />
        <strong className="text-slate-900">{shiftLabel(iv.slot)}</strong>
        <span className="text-slate-700">{fmtRange(iv.start, iv.end)}</span>
        <span className="text-slate-600">{fmtMinutes(minutes)} → <strong>{recognizedHours(minutes, p)} h</strong>{minutes < 60 ? ' (minimo)' : ''}</span>
        {locked && iv.status !== 'approved' && <Badge tone="slate">Giorno consuntivato</Badge>}
      </div>
      {iv.note && <p className="mt-1 text-sm text-slate-600">{iv.note}</p>}
      {iv.resendComment && iv.status === 'pending' && <p className="mt-1 text-xs text-slate-500">Commento al nuovo invio: {iv.resendComment}</p>}
      {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** Modulo di un intervento: orari del turno (la notte prosegue al mattino del giorno dopo), nota, commento se rifiutato. */
function IvForm({ slot, edit, p, busy, onSubmit, onCancel }: { slot: string; edit?: Intervention; p: Params; busy: boolean; onSubmit: (start: string, end: string, note: string, comment?: string) => void; onCancel: () => void }) {
  const [start, setStart] = useState(edit?.start.slice(11, 16) ?? '')
  const [end, setEnd] = useState(edit?.end.slice(11, 16) ?? '')
  const [note, setNote] = useState(edit?.note ?? '')
  const [comment, setComment] = useState('')
  const resolved = resolveTimes(slot, start, end)
  const minutes = resolved ? stampToMin(resolved.end) - stampToMin(resolved.start) : 0
  const rejected = edit?.status === 'rejected'
  const field = 'mt-1 block w-full rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300'
  return (
    <form className="mt-3 w-full space-y-3 rounded-lg bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); if (resolved) onSubmit(resolved.start, resolved.end, note, rejected ? comment : undefined) }}>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <label className="text-xs font-medium text-slate-600">Inizio<input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={field} /></label>
        <label className="text-xs font-medium text-slate-600">Fine<input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className={field} /></label>
      </div>
      {resolved && <p className="text-xs text-slate-600">{fmtRange(resolved.start, resolved.end)} · {fmtMinutes(minutes)} → <strong>{recognizedHours(minutes, p)} {recognizedHours(minutes, p) === 1 ? 'ora riconosciuta' : 'ore riconosciute'}</strong> (minimo {p.otMinHours} h; oltre l'ora contano i minuti sopra i {p.otToleranceMin}′)</p>}
      <label className="block text-xs font-medium text-slate-600">Nota (es. numero del ticket, cosa è successo)
        <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
      </label>
      {rejected && (
        <label className="block text-xs font-medium text-slate-600">Commento per chi approva
          <textarea rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Es. corretto l'inizio: la chiamata è arrivata alle 00:40" className={field} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy || !resolved}>{rejected ? 'Rimanda in approvazione' : edit ? 'Salva modifiche' : 'Segnala intervento'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Annulla</Button>
      </div>
    </form>
  )
}
