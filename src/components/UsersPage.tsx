import { useCallback, useEffect, useState } from 'react'
import { ROLE_HELP, ROLE_LABEL, ROLES, type Profile, type Role } from '../lib/roles'
import { TEAM_LABEL, USER_TEAMS, type UserTeam } from '../lib/types'
import { adminCall } from '../lib/supabase'
import { Badge, Button } from './ui'

interface UserRow extends Profile { created_at: string; last_sign_in_at: string | null }

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

/** Gestione accessi (solo super admin): creazione, livello, reset password, eliminazione. */
export function UsersPage({ me }: { me: Profile }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [secret, setSecret] = useState<{ email: string; password: string; reason: string } | null>(null)
  const [form, setForm] = useState({ email: '', display_name: '', role: 'viewer' as Role, team: '' as UserTeam | '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await adminCall<{ users: UserRow[] }>({ action: 'list' })
      setUsers(r.users)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await fn(); await load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await adminCall<{ temp_password: string }>({ action: 'create', ...form, team: form.team || null })
      setSecret({ email: form.email.trim().toLowerCase(), password: r.temp_password, reason: 'Account creato' })
      setForm({ email: '', display_name: '', role: 'viewer', team: '' })
    })
  }
  const reset = (u: UserRow) => {
    if (!confirm(`Reimpostare la password di ${u.email}? Riceverà una nuova password temporanea da cambiare al primo accesso; finché non la cambia non vedrà alcun dato.`)) return
    void run(async () => {
      const r = await adminCall<{ temp_password: string }>({ action: 'reset', user_id: u.id })
      setSecret({ email: u.email, password: r.temp_password, reason: 'Password reimpostata' })
    })
  }
  const setRole = (u: UserRow, role: Role) => run(async () => { await adminCall({ action: 'set_role', user_id: u.id, role }) })
  const setTeam = (u: UserRow, team: UserTeam | '') => run(async () => { await adminCall({ action: 'set_team', user_id: u.id, team: team || null }) })
  const remove = (u: UserRow) => {
    if (!confirm(`Eliminare definitivamente l'account ${u.email}? Non potrà più accedere.`)) return
    void run(async () => { await adminCall({ action: 'delete', user_id: u.id }) })
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="block min-w-64 flex-1">
          <span className="text-xs font-medium text-slate-600">Email</span>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 block w-full rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300" />
        </label>
        <label className="block min-w-48">
          <span className="text-xs font-medium text-slate-600">Nome e cognome</span>
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="mt-1 block w-full rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Livello</span>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Team</span>
          <select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value as UserTeam | '' })} className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
            <option value="">— nessuno —</option>
            {USER_TEAMS.map((t) => <option key={t} value={t}>{TEAM_LABEL[t]}</option>)}
          </select>
        </label>
        <Button type="submit" variant="primary" disabled={busy || !form.email}>+ Crea utente</Button>
        <p className="w-full text-xs text-slate-500">Viene generata una password temporanea (es. giraffa-camaleonte-12), mostrata una sola volta: comunicala alla persona, che dovrà cambiarla al primo accesso. Il team decide quali RAL vede: solo quelle del proprio team; HR e Governance le vedono tutte.</p>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Utente</th>
              <th className="py-2 pr-3 font-medium">Livello</th>
              <th className="py-2 pr-3 font-medium" title="RAL e livello visibili: solo del proprio team; HR e Governance tutti">Team</th>
              <th className="py-2 pr-3 font-medium">Stato</th>
              <th className="py-2 pr-3 font-medium">Ultimo accesso</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3">
                  <div className="font-medium text-slate-900">{u.display_name || '—'}{u.id === me.id && <span className="ml-2 text-xs font-normal text-slate-500">(tu)</span>}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="py-2 pr-3">
                  <select value={u.role} disabled={busy} onChange={(e) => void setRole(u, e.target.value as Role)} aria-label={`Livello di ${u.email}`} className="rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200">
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <div className="mt-0.5 text-[11px] text-slate-400">{ROLE_HELP[u.role]}</div>
                </td>
                <td className="py-2 pr-3">
                  <select value={u.team ?? ''} disabled={busy} onChange={(e) => void setTeam(u, e.target.value as UserTeam | '')} aria-label={`Team di ${u.email}`}
                    className={`rounded-md bg-white px-2 py-1 ring-1 ring-inset ${u.team ? 'ring-slate-200' : 'text-amber-800 ring-amber-300'}`}>
                    <option value="">— nessuno —</option>
                    {USER_TEAMS.map((t) => <option key={t} value={t}>{TEAM_LABEL[t]}</option>)}
                  </select>
                  <div className="mt-0.5 text-[11px] text-slate-400">{u.team === 'hr' || u.team === 'governance' ? 'Vede le RAL di tutti i team' : u.team ? `Vede le RAL del team ${TEAM_LABEL[u.team]}` : 'Non vede RAL'}</div>
                </td>
                <td className="py-2 pr-3">{u.must_change_password ? <Badge tone="amber">Deve cambiare password</Badge> : <Badge tone="green">Attivo</Badge>}</td>
                <td className="py-2 pr-3 text-slate-600">{fmtDate(u.last_sign_in_at)}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" disabled={busy} onClick={() => reset(u)}>Reimposta password</Button>
                  {u.id !== me.id && <Button variant="ghost" className="text-red-700" disabled={busy} onClick={() => remove(u)}>Elimina</Button>}
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">{loading ? 'Caricamento…' : 'Nessun utente.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {secret && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="sec-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="sec-title" className="text-lg font-semibold text-slate-900">{secret.reason}</h3>
            <p className="mt-1 text-sm text-slate-500">Password temporanea per <strong>{secret.email}</strong>. Viene mostrata <strong>solo ora</strong>: copiala e comunicala alla persona su un canale riservato.</p>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
              <code className="flex-1 font-mono text-lg font-semibold text-slate-900 select-all">{secret.password}</code>
              <Button onClick={() => navigator.clipboard?.writeText(secret.password)}>Copia</Button>
            </div>
            <div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => setSecret(null)}>Ho copiato la password</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}
