import { useState } from 'react'
import { ROLE_LABEL, type Profile } from '../lib/roles'
import type { Person } from '../lib/types'
import { teamLabelError, type Team } from '../lib/teams'
import { createTeam, deleteTeam, updateTeam } from '../lib/teamsApi'
import { useReloadTeams, useTeams } from '../lib/useTeams'
import { Button } from './ui'

const inputCls = 'rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300'

/**
 * Gestione dei team (solo space admin): il team indica solo l'appartenenza di risorse e account.
 * Ogni team ha un solo capo: il suo Director, oppure lo Space admin assegnato a quel team.
 */
export function TeamsTab({ people, users, loading }: { people: Person[]; users: Profile[]; loading: boolean }) {
  const teams = useTeams()
  const reloadTeams = useReloadTeams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null)
  const [newLabel, setNewLabel] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await fn(); await reloadTeams() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const resourcesOf = (t: Team) => people.filter((p) => p.team === t.id).length
  const accountsOf = (t: Team) => users.filter((u) => u.team === t.id)
  const headOf = (t: Team) => accountsOf(t).find((u) => u.role === 'director' || u.role === 'super_admin')

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const err = teamLabelError(newLabel, teams)
    if (err) return setError(err)
    void run(async () => { await createTeam(newLabel, teams); setNewLabel('') })
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Il team indica a quale gruppo appartengono risorse e account. Cosa vede e può fare ogni account lo decide il suo <strong>profilo</strong> (scheda Account).
        Ogni team ha <strong>un solo capo</strong>: il suo <strong>Director</strong> (vede RAL e importi delle sole risorse del team e ne approva gli interventi), oppure lo Space admin se è assegnato a quel team. Gli interventi di tutti i team li approvano anche i PM e lo Space admin.
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Team</th>
              <th className="py-2 pr-3 font-medium">Capo del team</th>
              <th className="py-2 pr-3 font-medium">Risorse</th>
              <th className="py-2 pr-3 font-medium">Account</th>
              <th className="py-2"><span className="sr-only">Azioni</span></th>
            </tr>
          </thead>
          <tbody>
            {teams.list.map((t) => {
              const nRes = resourcesOf(t)
              const nAcc = accountsOf(t).length
              const head = headOf(t)
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
                  <td className="py-2 pr-3 text-slate-700">{loading ? '…' : head ? <>{head.display_name || head.email} <span className="text-xs text-slate-500">({ROLE_LABEL[head.role]})</span></> : <span className="text-slate-400">nessuno: approvano PM e Space admin</span>}</td>
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
        <Button type="submit" variant="primary" disabled={busy || !newLabel.trim()}>+ Crea team</Button>
        <p className="w-full text-xs text-slate-500">Un team con risorse o account non si può eliminare: prima vanno spostati. Per nominare il capo, nella scheda Account assegna il profilo Director e il team: l'app chiede conferma mostrando quali RAL vedrà.</p>
      </form>
    </div>
  )
}
