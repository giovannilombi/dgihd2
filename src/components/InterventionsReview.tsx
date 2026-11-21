import { useEffect, useMemo, useState } from 'react'
import { SLOT_BY_ID, SLOT_HOURS, SLOT_LABEL, fmtDay } from '../lib/calendar'
import { romeNow } from '../lib/dayStatus'
import type { Me } from '../lib/roles'
import { fmtEur } from '../lib/economics'
import { amountsVisible, bySlot, canDecide, payRal, shiftChip, type Intervention, type IvStatus } from '../lib/interventions'
import { BANDS, BAND_LABEL, fmtMinutes, personOvertime, type PaidIntervention } from '../lib/overtime'
import { teamLabel, type TeamDir } from '../lib/teams'
import type { Assignments, Params, Person } from '../lib/types'
import { decideIntervention } from '../lib/useInterventions'
import { InterventionChip } from './InterventionChip'
import { Button } from './ui'

type Tab = 'pending' | 'approved' | 'rejected' | 'todo' | 'all'
type Sort = 'date' | 'person' | 'team'

const fmtStamp = (s: string) => `${fmtDay(s.slice(0, 10))} ${s.slice(11, 16)}`
const fmtRange = (a: string, b: string) => (a.slice(0, 10) === b.slice(0, 10) ? `${fmtStamp(a)} → ${b.slice(11, 16)}` : `${fmtStamp(a)} → ${fmtStamp(b)}`)
const shiftLabel = (slot: string) => { const s = SLOT_BY_ID[slot]; return s ? `${fmtDay(s.date)} · ${SLOT_LABEL[s.kind]}` : slot }

interface Props {
  ivs: Intervention[]
  noInt: Set<string>
  people: Person[]
  assignments: Assignments
  params: Params
  me: Me
  myPersonId: string | null
  teams: TeamDir
}

/**
 * Interventi da approvare e storico. Ore e fasce le vede chi legge il piano; gli importi chi vede la RAL della
 * persona. Approvano e rifiutano i Director del team della persona, i PM (tutti i team) e lo space admin;
 * un intervento approvato o rifiutato si può riportare in approvazione.
 */
export function InterventionsReview({ ivs, noInt, people, assignments, params, me, myPersonId, teams }: Props) {
  const [tab, setTab] = useState<Tab>('pending')
  const [sort, setSort] = useState<Sort>('date')
  const [team, setTeam] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t) }, [])
  const stamp = romeNow(now)
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  // Calcolo per persona sugli interventi non rifiutati (gli importi dei "da approvare" sono stimati)
  const calc = useMemo(() => {
    const out = new Map<string, PaidIntervention>()
    const byPerson = new Map<string, Intervention[]>()
    for (const iv of ivs) if (iv.status !== 'rejected') byPerson.set(iv.personId, [...(byPerson.get(iv.personId) ?? []), iv])
    for (const iv of ivs) if (iv.status === 'rejected') byPerson.set(`r:${iv.id}`, [iv])
    for (const [key, list] of byPerson) {
      const pid = key.startsWith('r:') ? list[0].personId : key
      for (const item of personOvertime(list, payRal(byId.get(pid)), params).items) out.set(item.id, item)
    }
    return out
  }, [ivs, byId, params])

  const counts = { pending: ivs.filter((x) => x.status === 'pending').length, approved: ivs.filter((x) => x.status === 'approved').length, rejected: ivs.filter((x) => x.status === 'rejected').length }
  const ivBySlot = bySlot(ivs)
  const todo = Object.entries(assignments)
    .filter(([sid, pid]) => byId.has(pid) && shiftChip(sid, ivBySlot[sid] ?? [], noInt.has(sid), stamp).chip === 'todo')
    .map(([sid, pid]) => ({ sid, person: byId.get(pid)! }))
    .filter((x) => !team || x.person.team === team)
    .sort((a, b) => a.sid.localeCompare(b.sid))

  const cmp = (a: Intervention, b: Intervention) => {
    const pa = byId.get(a.personId), pb = byId.get(b.personId)
    if (sort === 'person') return (pa?.name ?? '').localeCompare(pb?.name ?? '', 'it') || a.start.localeCompare(b.start)
    if (sort === 'team') return teamLabel(teams, pa?.team).localeCompare(teamLabel(teams, pb?.team), 'it') || a.start.localeCompare(b.start)
    return a.start.localeCompare(b.start)
  }
  const list = ivs.filter((x) => (tab === 'all' || x.status === tab) && (!team || byId.get(x.personId)?.team === team)).sort(cmp)
  const anyAmounts = list.some((x) => amountsVisible(byId.get(x.personId), me))

  const decide = async (iv: Intervention, status: IvStatus, reason?: string) => {
    setBusy(iv.id)
    setError('')
    try { await decideIntervention(iv.id, status, reason); setRejecting(null) } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const tabs: [Tab, string, number | null][] = [['pending', 'In approvazione', counts.pending], ['approved', 'Approvati', counts.approved], ['rejected', 'Rifiutati', counts.rejected], ['todo', 'Da compilare', todo.length], ['all', 'Tutti', null]]
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Stato" className="flex flex-wrap gap-x-5 border-b border-slate-200 text-sm font-medium">
        {tabs.map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-1 py-2.5 ${tab === k ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}{n !== null && <span className={`ml-1 rounded-full px-1.5 text-xs ${k === 'pending' && n ? 'bg-yellow-100 text-yellow-900' : k === 'todo' && n ? 'bg-orange-100 text-orange-900' : 'bg-slate-100 text-slate-600'}`}>{n}</span>}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">Team
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-md bg-white px-2 py-1 text-sm font-normal ring-1 ring-inset ring-slate-300">
            <option value="">Tutti</option>
            {teams.list.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {tab !== 'todo' && (
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">Ordina per
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md bg-white px-2 py-1 text-sm font-normal ring-1 ring-inset ring-slate-300">
              <option value="date">Data</option>
              <option value="person">Turnista</option>
              <option value="team">Team</option>
            </select>
          </label>
        )}
        <span className="ml-auto text-xs text-slate-500">Approvano i Director del team della persona, i PM e lo space admin.</span>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {tab === 'todo' ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3 font-medium">Turno</th><th className="py-2 pr-3 font-medium">Turnista</th><th className="py-2 pr-3 font-medium">Team</th><th className="py-2 font-medium">Stato</th></tr></thead>
            <tbody>
              {todo.map(({ sid, person }) => (
                <tr key={sid} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{shiftLabel(sid)} <span className="text-slate-400">{SLOT_HOURS[SLOT_BY_ID[sid].kind]}</span></td>
                  <td className="py-2 pr-3 font-medium text-slate-900">{person.name}</td>
                  <td className="py-2 pr-3 text-slate-600">{teamLabel(teams, person.team) || '—'}</td>
                  <td className="py-2"><InterventionChip info={{ chip: 'todo', count: 0 }} /></td>
                </tr>
              ))}
              {!todo.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Tutti i turni finiti sono compilati.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Turno</th>
                <th className="py-2 pr-3 font-medium">Turnista</th>
                <th className="py-2 pr-3 font-medium">Orario</th>
                <th className="py-2 pr-3 font-medium">Durata → riconosciute</th>
                <th className="py-2 pr-3 font-medium">Ore per fascia</th>
                {anyAmounts && <th className="py-2 pr-3 text-right font-medium" title="Straordinario + compenso per chiamata (lordo)">Importo</th>}
                <th className="py-2 pr-3 font-medium">Stato</th>
                <th className="py-2"><span className="sr-only">Azioni</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((iv) => {
                const person = byId.get(iv.personId)
                const c = calc.get(iv.id)
                const show = amountsVisible(person, me)
                const can = canDecide(person, me, myPersonId)
                return (
                  <tr key={iv.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{shiftLabel(iv.slot)}</td>
                    <td className="py-2 pr-3"><div className="font-medium text-slate-900">{person?.name ?? '—'}</div><div className="text-xs text-slate-500">{teamLabel(teams, person?.team) || '—'}</div></td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtRange(iv.start, iv.end)}{iv.note && <div className="max-w-64 whitespace-normal text-xs text-slate-500">{iv.note}</div>}{iv.resendComment && iv.status === 'pending' && <div className="max-w-64 whitespace-normal text-xs text-blue-800">Rimandato: {iv.resendComment}</div>}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{c ? <>{fmtMinutes(c.minutes)} → <strong>{c.hours} h</strong></> : '—'}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{c && BANDS.filter((b) => c.byBand[b] > 0).map((b) => <div key={b}>{BAND_LABEL[b]}: {fmtMinutes(c.byBand[b])}</div>)}</td>
                    {anyAmounts && (
                      <td className="num py-2 pr-3 text-right whitespace-nowrap">
                        {!show ? <span className="text-slate-300">—</span>
                          : c?.amount == null ? <span className="text-xs text-amber-800" title="Per calcolare l'importo serve la RAL puntuale della persona">{person?.ralNd ? 'RAL Q/: inserire la RAL puntuale' : 'RAL da inserire'}</span>
                          : <span className={iv.status === 'pending' ? 'text-slate-500' : 'font-semibold text-slate-900'} title={iv.status === 'pending' ? 'Stimato: entra nel consuntivo se approvato' : undefined}>{fmtEur(c.amount + params.callFee)}{iv.status === 'pending' ? '*' : ''}</span>}
                      </td>
                    )}
                    <td className="py-2 pr-3">
                      <InterventionChip info={{ chip: iv.status === 'approved' ? 'approved' : iv.status === 'rejected' ? 'rejected' : 'pending', count: 1 }} />
                      {iv.status !== 'pending' && <div className="mt-0.5 text-[11px] text-slate-500">{iv.decidedByName}</div>}
                      {iv.status === 'rejected' && iv.rejectReason && <div className="mt-0.5 max-w-52 text-[11px] text-red-800">“{iv.rejectReason}”</div>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {can && rejecting?.id === iv.id ? (
                        <form className="flex flex-col items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); void decide(iv, 'rejected', rejecting.reason) }}>
                          <textarea autoFocus rows={2} maxLength={500} value={rejecting.reason} onChange={(e) => setRejecting({ id: iv.id, reason: e.target.value })} placeholder="Motivo del rifiuto (obbligatorio)" className="w-64 rounded-lg px-2 py-1 text-sm ring-1 ring-inset ring-slate-300" />
                          <span className="flex gap-1.5"><Button type="button" variant="ghost" onClick={() => setRejecting(null)}>Annulla</Button><Button type="submit" variant="danger" disabled={busy === iv.id || !rejecting.reason.trim()}>Rifiuta</Button></span>
                        </form>
                      ) : can ? (
                        <span className="flex justify-end gap-1.5">
                          {iv.status === 'pending' && <Button variant="primary" disabled={busy === iv.id} onClick={() => void decide(iv, 'approved')}>Approva</Button>}
                          {iv.status === 'pending' && <Button disabled={busy === iv.id} onClick={() => setRejecting({ id: iv.id, reason: '' })}>Rifiuta</Button>}
                          {iv.status !== 'pending' && <Button variant="ghost" disabled={busy === iv.id} onClick={() => confirm('Riportare l\'intervento in approvazione?') && void decide(iv, 'pending')}>Riporta in approvazione</Button>}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
              {!list.length && <tr><td colSpan={anyAmounts ? 8 : 7} className="py-6 text-center text-slate-500">Nessun intervento.</td></tr>}
            </tbody>
          </table>
          {anyAmounts && <p className="mt-2 text-xs text-slate-500">Importo = straordinario CCNL per fascia + {fmtEur(params.callFee)} per la chiamata. * stimato: entra nel consuntivo solo se approvato. Le prime {params.otDayFirstHours} ore feriali diurne si contano per giorno su tutti gli interventi della persona.</p>}
        </div>
      )}
    </div>
  )
}
