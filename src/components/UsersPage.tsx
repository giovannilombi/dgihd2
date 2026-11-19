import { useCallback, useEffect, useState } from 'react'
import { ROLE_HELP, ROLE_LABEL, ROLES, type Profile, type Role } from '../lib/roles'
import { TEAM_LABEL, USER_TEAMS, type Person, type UserTeam } from '../lib/types'
import { adminCall, supabase } from '../lib/supabase'
import type { NamesMode } from '../lib/shiftsView'
import { accountFor, canCreateAccount, createTurnistaAccounts, type Credential } from '../lib/accounts'
import { Badge, Button } from './ui'
import { CredentialsDialog } from './CredentialsDialog'

interface UserRow extends Profile { created_at: string; last_sign_in_at: string | null }

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

/** Gestione accessi (solo super admin): creazione, livello, reset password, eliminazione. */
export function UsersPage({ me, people, flush }: { me: Profile; people: Person[]; flush: () => Promise<void> }) {
  const [tab, setTab] = useState<'account' | 'turnisti'>('account')
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [secret, setSecret] = useState<{ email: string; password: string; reason: string } | null>(null)
  const [form, setForm] = useState({ email: '', display_name: '', role: 'viewer' as Role, team: '' as UserTeam | '', person_id: '' })
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
      const r = await adminCall<{ temp_password: string }>({ action: 'create', ...form, team: form.team || null, person_id: form.role === 'turnista' ? form.person_id || null : null })
      setSecret({ email: form.email.trim().toLowerCase(), password: r.temp_password, reason: 'Account creato' })
      setForm({ email: '', display_name: '', role: 'viewer', team: '', person_id: '' })
    })
  }
  const reset = (u: UserRow) => {
    if (!confirm(`Reimpostare la password di ${u.email}? Riceverà una nuova password temporanea da cambiare al primo accesso; finché non la cambia non vedrà alcun dato.`)) return
    void run(async () => {
      const r = await adminCall<{ temp_password: string }>({ action: 'reset', user_id: u.id })
      setSecret({ email: u.email, password: r.temp_password, reason: 'Password reimpostata' })
    })
  }
  /** Dare o togliere il livello Super admin richiede una conferma esplicita: vede e modifica tutto. */
  const setRole = (u: UserRow, role: Role) => {
    if (role === u.role) return
    if (role === 'super_admin' && !confirm(`Rendere ${u.display_name || u.email} SUPER ADMIN? Vedrà e modificherà tutto, RAL comprese, e gestirà gli utenti.`)) return
    if (u.role === 'super_admin' && !confirm(`Togliere il livello Super admin a ${u.display_name || u.email}?`)) return
    return run(async () => { await adminCall({ action: 'set_role', user_id: u.id, role }) })
  }
  const setTeam = (u: UserRow, team: UserTeam | '') => run(async () => { await adminCall({ action: 'set_team', user_id: u.id, team: team || null }) })
  const setPerson = (u: UserRow, personId: string) => run(async () => { await adminCall({ action: 'set_person', user_id: u.id, person_id: personId || null }) })
  // Risorse collegabili: in ordine alfabetico; quelle già collegate ad altri account non sono selezionabili
  const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const linkedTo = new Map(users.filter((u) => u.person_id).map((u) => [u.person_id as string, u.id]))
  const personOptions = (selfId?: string) => sortedPeople.map((p) => {
    const taken = linkedTo.has(p.id) && linkedTo.get(p.id) !== selfId
    return <option key={p.id} value={p.id} disabled={taken}>{p.name}{taken ? ' (già collegata)' : ''}</option>
  })
  const remove = (u: UserRow) => {
    if (!confirm(`Eliminare definitivamente l'account ${u.email}? Non potrà più accedere.`)) return
    void run(async () => { await adminCall({ action: 'delete', user_id: u.id }) })
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Viste" className="-mt-1 flex gap-6 border-b border-slate-200 text-sm font-medium">
        <TabButton active={tab === 'account'} onClick={() => setTab('account')}>Account ({users.length})</TabButton>
        <TabButton active={tab === 'turnisti'} onClick={() => setTab('turnisti')}>Turnisti ({people.length})</TabButton>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {tab === 'turnisti' ? <TurnistiTab people={people} users={users} loading={loading} flush={flush} reload={load} /> : <>

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
        {form.role === 'turnista' && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Risorsa collegata</span>
            <select value={form.person_id} onChange={(e) => setForm({ ...form, person_id: e.target.value })} className="mt-1 block max-w-56 rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
              <option value="">— da collegare —</option>
              {personOptions()}
            </select>
          </label>
        )}
        <Button type="submit" variant="primary" disabled={busy || !form.email}>+ Crea utente</Button>
        <p className="w-full text-xs text-slate-500">Viene generata una password temporanea (es. giraffa-camaleonte-12), mostrata una sola volta: comunicala alla persona, che dovrà cambiarla al primo accesso. Il team decide quali RAL vede: solo quelle del proprio team; HR e Governance le vedono tutte.</p>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Utente</th>
              <th className="py-2 pr-3 font-medium">Livello</th>
              <th className="py-2 pr-3 font-medium" title="RAL e livello visibili: solo del proprio team; HR e Governance tutti">Team</th>
              <th className="py-2 pr-3 font-medium" title="Per il Turnista: la sua scheda nel Team, per riconoscere i propri turni">Risorsa</th>
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
                  <select value={u.role} disabled={busy || !ROLES.includes(u.role)} onChange={(e) => void setRole(u, e.target.value as Role)} aria-label={`Livello di ${u.email}`} className="rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200">
                    {/* Livello non riconosciuto (pagina non aggiornata): mostrato com'è, mai sostituito dal primo dell'elenco */}
                    {!ROLES.includes(u.role) && <option value={u.role}>{String(u.role)} · ricarica la pagina</option>}
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
                <td className="py-2 pr-3">
                  {u.role === 'turnista' ? (
                    <>
                      <select value={u.person_id ?? ''} disabled={busy} onChange={(e) => void setPerson(u, e.target.value)} aria-label={`Risorsa collegata a ${u.email}`}
                        className={`max-w-52 rounded-md bg-white px-2 py-1 ring-1 ring-inset ${u.person_id ? 'ring-slate-200' : 'text-amber-800 ring-amber-300'}`}>
                        <option value="">— da collegare —</option>
                        {personOptions(u.id)}
                      </select>
                      <div className="mt-0.5 text-[11px] text-slate-400">{u.person_id ? 'Vede evidenziati i propri turni' : 'Senza collegamento non vede i propri turni'}</div>
                    </>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="py-2 pr-3">{u.must_change_password ? <Badge tone="amber">Deve cambiare password</Badge> : <Badge tone="green">Attivo</Badge>}</td>
                <td className="py-2 pr-3 text-slate-600">{fmtDate(u.last_sign_in_at)}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" disabled={busy} onClick={() => reset(u)}>Reimposta password</Button>
                  {u.id !== me.id && <Button variant="ghost" className="text-red-700" disabled={busy} onClick={() => remove(u)}>Elimina</Button>}
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">{loading ? 'Caricamento…' : 'Nessun utente.'}</td></tr>}
          </tbody>
        </table>
      </div>
      </>}

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

/** Impostazione del super admin: i Turnisti vedono i nomi di tutti oppure solo i propri turni. */
function TurnistaNamesSetting() {
  const [mode, setMode] = useState<NamesMode | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('calendar_settings').select('turnista_names').eq('id', 1).maybeSingle()
    if (err) setError(`Impostazione non disponibile: ${err.message}`)
    else setMode((data as { turnista_names?: string } | null)?.turnista_names === 'own' ? 'own' : 'all')
  }, [])
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const save = async (next: NamesMode) => {
    const prev = mode
    setMode(next)
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('calendar_settings').update({ turnista_names: next, updated_at: new Date().toISOString() }).eq('id', 1)
    setSaving(false)
    if (err) { setMode(prev); setError(`Salvataggio non riuscito: ${err.message}`) }
  }

  const option = (value: NamesMode, label: string, help: string) => (
    <label className={`flex flex-1 cursor-pointer items-start gap-2 rounded-lg px-3 py-2 ring-1 ${mode === value ? 'bg-blue-50 ring-blue-300' : 'bg-white ring-slate-200 hover:bg-slate-50'}`}>
      <input type="radio" name="turnista-names" className="mt-1" checked={mode === value} disabled={mode === null || saving} onChange={() => void save(value)} />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{help}</span>
      </span>
    </label>
  )

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Calendario dei Turnisti: nomi visibili</h3>
      <div role="radiogroup" aria-label="Nomi visibili ai Turnisti" className="mt-2 flex flex-col gap-2 md:flex-row">
        {option('all', 'Tutti i nomi', 'Ogni Turnista vede chi copre ciascun turno.')}
        {option('own', 'Solo i propri turni', 'I turni degli altri compaiono come "Turno coperto": i loro nomi non vengono inviati al browser.')}
      </div>
      <p className="mt-2 text-xs text-slate-500">Vale per tutti gli account con livello Turnista. Ognuno vede evidenziati i propri turni se il suo account è collegato alla sua risorsa (colonna Risorsa).</p>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`-mb-px border-b-2 px-1 py-2.5 ${active ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
      {children}
    </button>
  )
}

const ACCOUNT_TONE = (role: Role) => role === 'turnista' ? 'bg-blue-50 text-blue-800 ring-blue-200' : 'bg-indigo-50 text-indigo-800 ring-indigo-200'
const roleOfPerson = (p: Person) => (!p.active ? 'KO' : p.reserve ? `Riserva n. ${p.reserveOrder ?? '?'}` : 'Primario')

/**
 * Tutte le persone dell'anagrafica con il loro account (riconosciuto dal collegamento o dall'email):
 * il super admin crea da qui gli account Turnista, uno alla volta o in blocco.
 */
function TurnistiTab({ people, users, loading, flush, reload }: { people: Person[]; users: UserRow[]; loading: boolean; flush: () => Promise<void>; reload: () => Promise<void> }) {
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [includeKo, setIncludeKo] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: Credential[]; errors: string[] } | null>(null)

  const pool = [...people].filter((p) => includeKo || p.active).sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const missing = pool.filter((p) => !accountFor(p, users))
  const shown = onlyMissing ? missing : pool
  const eligible = pool.filter((p) => canCreateAccount(p, users))
  const chosen = eligible.filter((p) => selected.has(p.id))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const create = async (list: Person[]) => {
    if (!list.length) return
    if (list.length > 1 && !confirm(`Creare ${list.length} account Turnista? Ognuno riceve una password temporanea, mostrata una sola volta.`)) return
    setBusy(true)
    try {
      await flush() // schede ed email devono essere già salvate
      const r = await createTurnistaAccounts(list)
      setResult(r)
      setSelected(new Set())
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <TurnistaNamesSetting />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5 text-sm" role="group" aria-label="Filtro">
          <button type="button" aria-pressed={!onlyMissing} onClick={() => setOnlyMissing(false)} className={`rounded-md px-3 py-1.5 font-medium ${!onlyMissing ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Tutti ({pool.length})</button>
          <button type="button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(true)} className={`rounded-md px-3 py-1.5 font-medium ${onlyMissing ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Senza account ({missing.length})</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={includeKo} onChange={(e) => setIncludeKo(e.target.checked)} className="h-4 w-4 accent-blue-700" />
          Includi chi è KO (fuori rotazione)
        </label>
        <span className="ml-auto text-xs text-slate-500">Persone dell'anagrafica; l'account si riconosce dall'email.</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="w-8 py-2 pr-2 pl-3 font-medium"><span className="sr-only">Selezione</span></th>
              <th className="py-2 pr-3 font-medium">Turnista</th>
              <th className="py-2 pr-3 font-medium">Team</th>
              <th className="py-2 pr-3 font-medium">Ruolo</th>
              <th className="py-2 pr-3 font-medium">Account</th>
              <th className="py-2 pr-3 font-medium">Ultimo accesso</th>
              <th className="py-2"><span className="sr-only">Azione</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const acc = accountFor(p, users)
              const can = canCreateAccount(p, users)
              return (
                <tr key={p.id} className={`border-b border-slate-100 align-middle ${p.active ? '' : 'bg-slate-50'}`}>
                  <td className="py-2 pr-2 pl-3">
                    {can && <input type="checkbox" checked={selected.has(p.id)} disabled={busy} onChange={() => toggle(p.id)} aria-label={`Seleziona ${p.name}`} className="h-4 w-4 accent-blue-700" />}
                  </td>
                  <td className="py-2 pr-3">
                    <div className={`font-medium ${p.active ? 'text-slate-900' : 'text-slate-600'}`}>{p.name}</div>
                    {p.email ? <div className="text-xs text-slate-500">{p.email}</div> : <Badge tone="amber">Email da inserire</Badge>}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{p.team ? TEAM_LABEL[p.team] : '—'}</td>
                  <td className="py-2 pr-3 text-slate-700">{roleOfPerson(p)}</td>
                  <td className="py-2 pr-3">
                    {acc ? <span className={`inline-flex rounded-md px-1.5 py-px text-[11px] font-semibold ring-1 ring-inset ${ACCOUNT_TONE(acc.role)}`}>{ROLE_LABEL[acc.role]}</span>
                      : <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">Nessun account</span>}
                    {acc?.must_change_password && <div className="mt-0.5 text-[11px] text-amber-700">Password temporanea non ancora cambiata</div>}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{acc ? fmtDate(acc.last_sign_in_at) : '—'}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {can && <Button disabled={busy} onClick={() => void create([p])}>Crea account</Button>}
                    {!acc && !p.email && <a href="#/team" className="text-xs text-blue-700 hover:underline">Inserisci l'email in B · Team</a>}
                  </td>
                </tr>
              )
            })}
            {!shown.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">{loading ? 'Caricamento…' : onlyMissing ? 'Tutte le persone hanno già un account.' : 'Nessuna persona in anagrafica.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50/60 px-3 py-2.5 ring-1 ring-blue-200">
        <span className="text-sm font-medium text-blue-950">{chosen.length === 1 ? '1 selezionato' : `${chosen.length} selezionati`}</span>
        <Button disabled={busy || !eligible.length} onClick={() => setSelected(new Set(eligible.map((p) => p.id)))}>Seleziona tutti quelli senza account</Button>
        <Button variant="primary" disabled={busy || !chosen.length} onClick={() => void create(chosen)}>
          {busy ? 'Creazione in corso…' : chosen.length > 1 ? `Crea ${chosen.length} account Turnista` : 'Crea account Turnista'}
        </Button>
        <span className="text-xs text-slate-600">Account Turnista già collegati alla scheda; password temporanee mostrate una sola volta.</span>
      </div>

      {result && <CredentialsDialog items={result.created} errors={result.errors} onClose={() => setResult(null)} />}
    </div>
  )
}
