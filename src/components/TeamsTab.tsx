import { useState } from 'react'
import { canReadFull, ROLE_LABEL, type Profile } from '../lib/roles'
import type { Person } from '../lib/types'
import { teamLabelError, type Team } from '../lib/teams'
import { createTeam, deleteTeam, updateTeam } from '../lib/teamsApi'
import { useReloadTeams, useTeams } from '../lib/useTeams'
import { Badge, Button } from './ui'

const inputCls = 'rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300'

/**
 * Gestione dei team (solo super admin): nome, director e "vede tutto".
 * Il director è un account del team con accesso completo in lettura; un team in uso non si elimina.
 */
export function TeamsTab({ me, people, users, loading }: { me: Profile; people: Person[]; users: Profile[]; loading: boolean }) {
  const teams = useTeams()
  const reloadTeams = useReloadTeams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null)
  const [seesAllChange, setSeesAllChange] = useState<{ team: Team; next: boolean } | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newSeesAll, setNewSeesAll] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await fn(); await reloadTeams() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const resourcesOf = (t: Team) => people.filter((p) => p.team === t.id).length
  const accountsOf = (t: Team) => users.filter((u) => u.team === t.id)
  /** Possibili director: account del team che leggono tutto (Viewer esteso, Full edit, Super admin). */
  const candidates = (t: Team) => accountsOf(t).filter((u) => canReadFull(u.role)).sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email, 'it'))

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const err = teamLabelError(newLabel, teams)
    if (err) return setError(err)
    void run(async () => {
      await createTeam(newLabel, newSeesAll, teams)
      setNewLabel('')
      setNewSeesAll(false)
    })
  }
  const saveRename = () => {
    if (!renaming) return
    const err = teamLabelError(renaming.label, teams, renaming.id)
    if (err) return setError(err)
    void run(async () => { await updateTeam(renaming.id, { label: renaming.label.trim() }); setRenaming(null) })
  }
  const remove = (t: Team) => {
    if (!confirm(`Eliminare il team ${t.label}?`)) return
    void run(async () => { await deleteTeam(t.id) })
  }
  const setDirector = (t: Team, id: string) => void run(async () => { await updateTeam(t.id, { director_id: id || null }) })

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Il <strong>director</strong> di un team approva o rifiuta gli interventi dichiarati dai turnisti del suo team, segna come erogati i loro turni
        (e li sblocca) e vede gli importi degli interventi del team. Se un team non ha director, lo fa il super admin.
        I team che <strong>vedono tutto</strong> vedono RAL, livelli e importi di tutti i team.
        <span className="text-slate-500"> Erogato e interventi arrivano con i prossimi rilasci.</span>
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Team</th>
              <th className="py-2 pr-3 font-medium">Director</th>
              <th className="py-2 pr-3 font-medium">Vede RAL e importi</th>
              <th className="py-2 pr-3 font-medium">Risorse</th>
              <th className="py-2 pr-3 font-medium">Account</th>
              <th className="py-2"><span className="sr-only">Azioni</span></th>
            </tr>
          </thead>
          <tbody>
            {teams.list.map((t) => {
              const nRes = resourcesOf(t)
              const nAcc = accountsOf(t).length
              const options = candidates(t)
              const inUse = nRes > 0 || nAcc > 0
              return (
                <tr key={t.id} className="border-b border-slate-100 align-middle">
                  <td className="py-2 pr-3">
                    {renaming?.id === t.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); saveRename() }} className="flex items-center gap-2">
                        <input autoFocus value={renaming.label} maxLength={40} onChange={(e) => setRenaming({ id: t.id, label: e.target.value })} aria-label={`Nuovo nome del team ${t.label}`}
                          onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} className={`${inputCls} w-40`} />
                        <Button type="submit" variant="primary" disabled={busy}>Salva</Button>
                        <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>Annulla</Button>
                      </form>
                    ) : <span className="font-semibold text-slate-900">{t.label}</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <select value={t.directorId ?? ''} disabled={busy || (!options.length && !t.directorId)} onChange={(e) => setDirector(t, e.target.value)} aria-label={`Director del team ${t.label}`}
                      className="max-w-72 rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200 disabled:text-slate-500">
                      <option value="">— nessuno: approva il super admin —</option>
                      {options.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.email} ({ROLE_LABEL[u.role]})</option>)}
                    </select>
                    {!options.length && !t.directorId && !loading && (
                      <div className="mt-0.5 max-w-72 text-[11px] text-slate-400">Nessun account del team con livello Viewer esteso, Full edit o Super admin.</div>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={t.seesAll} disabled={busy} onChange={(e) => setSeesAllChange({ team: t, next: e.target.checked })} className="h-4 w-4 accent-red-700" />
                      {t.seesAll ? <Badge tone="red">Tutti i team</Badge> : <span className="text-slate-600">Solo del proprio team</span>}
                    </label>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{nRes}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{loading ? '…' : nAcc}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {renaming?.id !== t.id && <Button variant="ghost" disabled={busy} onClick={() => setRenaming({ id: t.id, label: t.label })}>Rinomina</Button>}
                    <Button variant="ghost" className="text-red-700" disabled={busy || loading || inUse} onClick={() => remove(t)}
                      title={inUse ? 'Il team ha risorse o account: spostali prima in un altro team' : undefined}>Elimina</Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="block min-w-56">
          <span className="text-xs font-medium text-slate-600">Nuovo team</span>
          <input value={newLabel} maxLength={40} onChange={(e) => setNewLabel(e.target.value)} placeholder="Es. Data" className={`mt-1 block w-full ${inputCls}`} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={newSeesAll} onChange={(e) => setNewSeesAll(e.target.checked)} className="h-4 w-4 accent-red-700" />
          Vede RAL e importi di tutti i team
        </label>
        <Button type="submit" variant="primary" disabled={busy || !newLabel.trim()}>+ Crea team</Button>
        <p className="w-full text-xs text-slate-500">
          Il director si sceglie dopo aver assegnato al team almeno un account (scheda Account). Un team con risorse o account non si può eliminare: prima vanno spostati.
          Se il director cambia team o passa a un livello senza accesso completo, il team resta senza director.
        </p>
      </form>

      {seesAllChange && (
        <SeesAllDialog change={seesAllChange} accounts={accountsOf(seesAllChange.team)} isMine={me.team === seesAllChange.team.id}
          onCancel={() => setSeesAllChange(null)}
          onConfirm={() => { const c = seesAllChange; setSeesAllChange(null); void run(async () => { await updateTeam(c.team.id, { sees_all: c.next }) }) }} />
      )}
    </div>
  )
}

/** Conferma per dare o togliere a un team la visibilità su RAL e importi di tutti: elenca chi ne è toccato. */
function SeesAllDialog({ change, accounts, isMine, onCancel, onConfirm }: { change: { team: Team; next: boolean }; accounts: Profile[]; isMine: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { team, next } = change
  const readers = accounts.filter((u) => canReadFull(u.role))
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="sa-title" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="sa-title" className="text-lg font-semibold text-slate-900">
          {next ? `Il team ${team.label} vedrà RAL e importi di tutti i team?` : `Il team ${team.label} vedrà solo le proprie RAL?`}
        </h3>
        <div className={`mt-3 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset ${next ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-amber-50 text-amber-900 ring-amber-200'}`}>
          {next
            ? 'Gli account del team con livello Viewer esteso, Full edit o Super admin vedranno RAL, livelli e importi di TUTTE le risorse, e potranno cambiare il team delle risorse.'
            : 'Gli account del team vedranno RAL, livelli e importi solo delle risorse del proprio team.'}
        </div>
        <div className="mt-3 text-sm">
          <div className="font-semibold text-slate-900">Account toccati ({readers.length})</div>
          {readers.length
            ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">{readers.map((u) => <li key={u.id}>{u.display_name || u.email} · {ROLE_LABEL[u.role]}</li>)}</ul>
            : <p className="mt-1 text-slate-500">Nessuno per ora: varrà per chi verrà assegnato al team.</p>}
        </div>
        {isMine && !next && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">È il tuo team: non vedrai più le RAL degli altri team (potrai comunque riattivarlo da qui).</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Annulla</Button>
          <Button variant={next ? 'danger' : 'primary'} onClick={onConfirm}>{next ? 'Conferma: vede tutto' : 'Conferma: solo il proprio team'}</Button>
        </div>
      </div>
    </div>
  )
}
