import { useCallback, useEffect, useState } from 'react'
import { ASSIGNABLE_ROLES, normalizeRole, ROLE_HELP, ROLE_LABEL, roleAccess, roleRank, ROLES, seesAllSalaries, type Profile, type Role } from '../lib/roles'
import type { Person } from '../lib/types'
import { teamLabel, type TeamDir, type TeamId } from '../lib/teams'
import { useTeams } from '../lib/useTeams'
import { TeamsTab } from './TeamsTab'
import { adminCall, supabase } from '../lib/supabase'
import { effectiveNames, parseNamesSetting, type NamesMode, type NamesSetting } from '../lib/shiftsView'
import { accountFor, canCreateAccount, createTurnistaAccounts, type Credential } from '../lib/accounts'
import { AccordionSummary, Badge, Button } from './ui'
import { CredentialsDialog } from './CredentialsDialog'

interface UserRow extends Profile { created_at: string; last_sign_in_at: string | null; temp_password?: string | null }

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

/** Gestione accessi (solo space admin): creazione, livello, reset password, eliminazione. */
export function UsersPage({ me, people, flush }: { me: Profile; people: Person[]; flush: () => Promise<void> }) {
  const teams = useTeams()
  const [tab, setTab] = useState<'account' | 'turnisti' | 'team'>('account')
  const [roleFilter, setRoleFilter] = useState<Set<Role>>(new Set())
  /** I Turnisti sono tanti: si includono o escludono a parte, indipendentemente dal filtro dei livelli. */
  const [withTurnisti, setWithTurnisti] = useState(false)
  const [sortBy, setSortBy] = useState<'role' | 'name' | 'last' | 'created'>('role')
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [namesMode, setNamesMode] = useState<NamesSetting>('all')
  useEffect(() => {
    void supabase.from('calendar_settings').select('turnista_names').eq('id', 1).maybeSingle()
      .then(({ data }) => setNamesMode(parseNamesSetting((data as { turnista_names?: string } | null)?.turnista_names)))
  }, [tab])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [secret, setSecret] = useState<{ email: string; password: string; reason: string } | null>(null)
  const [form, setForm] = useState({ email: '', display_name: '', role: 'viewer' as Role, team: '' as TeamId, turnista_view: 'own' as NamesMode })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await adminCall<{ users: UserRow[] }>({ action: 'list' })
      // livelli della versione precedente mostrati con il profilo corrispondente
      setUsers(r.users.map((u) => ({ ...u, role: normalizeRole(u.role, u.team) ?? u.role })))
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
    try { await fn(); await load() } catch (e) { setError(friendlyError((e as Error).message)) } finally { setBusy(false) }
  }

  const doCreate = (f: typeof form) => run(async () => {
    // Il Turnista si collega da solo alla persona dell'anagrafica con la stessa email
    const r = await adminCall<{ temp_password: string }>({ action: 'create', ...f, team: f.team || null, person_id: f.role === 'turnista' ? personByEmail(f.email)?.id ?? null : null })
    setSecret({ email: f.email.trim().toLowerCase(), password: r.temp_password, reason: 'Account creato' })
    setForm({ email: '', display_name: '', role: 'viewer', team: '', turnista_view: 'own' })
  })
  /** Un nuovo account che vedrà RAL (Governance, HR, Director) passa dalla stessa conferma dei cambi di profilo. */
  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const team = form.team || null
    if (grantsRal(form.role, team)) return setPending({ user: null, who: form.display_name.trim() || form.email.trim(), role: form.role, team, draft: { ...form } })
    void doCreate(form)
  }
  const reset = (u: UserRow) => {
    if (!confirm(`Reimpostare la password di ${u.email}? Riceverà una nuova password temporanea da cambiare al primo accesso; finché non la cambia non vedrà alcun dato.`)) return
    void run(async () => {
      const r = await adminCall<{ temp_password: string }>({ action: 'reset', user_id: u.id })
      setSecret({ email: u.email, password: r.temp_password, reason: 'Password reimpostata' })
    })
  }
  /** Ogni cambio di profilo passa da una conferma che dice cosa vedrà la persona (RAL comprese). */
  const setRole = (u: UserRow, role: Role) => { if (role !== u.role) setPending({ user: u, who: u.display_name || u.email, role, team: u.team }) }
  /** Per il Director (e lo Space admin a capo di un team) il team decide RAL e approvazioni: anche questo cambio va confermato. */
  const setTeam = (u: UserRow, value: TeamId) => {
    const team = value || null
    if (team === u.team) return
    if (u.role === 'director' || u.role === 'super_admin') return setPending({ user: u, who: u.display_name || u.email, role: u.role, team })
    return run(async () => { await adminCall({ action: 'set_team', user_id: u.id, team }) })
  }
  const applyPending = (c: PendingChange) => {
    setPending(null)
    if (!c.user) { if (c.draft) void doCreate(c.draft); return }
    const u = c.user
    void run(async () => {
      if (c.role !== u.role) await adminCall({ action: 'set_role', user_id: u.id, role: c.role })
      if (c.team !== u.team) await adminCall({ action: 'set_team', user_id: u.id, team: c.team })
    })
  }
  /** Capo attuale del team (Director, o Space admin assegnato al team), escluso l'account in modifica. */
  const headOf = (team: TeamId | null, exceptId?: string) => (team ? users.find((u) => u.team === team && isHead(u.role) && u.id !== exceptId) : undefined)
  // Filtro per livello (nessuno selezionato = tutti) e ordinamento
  const counts = Object.fromEntries(ROLES.map((r) => [r, users.filter((u) => u.role === r).length])) as Record<Role, number>
  const toggleRole = (r: Role) => setRoleFilter((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n })
  const byName = (a: UserRow, b: UserRow) => (a.display_name || a.email).localeCompare(b.display_name || b.email, 'it')
  const shownUsers = users
    .filter((u) => u.role === 'turnista' ? withTurnisti : !roleFilter.size || roleFilter.has(u.role))
    .sort((a, b) =>
      sortBy === 'role' ? roleRank(a.role) - roleRank(b.role) || byName(a, b)
      : sortBy === 'name' ? byName(a, b)
      : sortBy === 'last' ? (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? '') || byName(a, b)
      : a.created_at.localeCompare(b.created_at))
  /** Persona dell'anagrafica con la stessa email dell'account: è così che il Turnista riconosce i propri turni. */
  const personByEmail = (email: string) => people.find((p) => p.email && p.email === email.trim().toLowerCase())
  const personOf = (u: UserRow) => people.find((p) => p.id === u.person_id) ?? personByEmail(u.email)
  const setView = (u: UserRow, view: NamesMode) => { if (view !== (u.turnista_view ?? 'own')) void run(async () => { await adminCall({ action: 'set_view', user_id: u.id, turnista_view: view }) }) }
  const remove = (u: UserRow) => {
    if (!confirm(`Eliminare definitivamente l'account ${u.email}? Non potrà più accedere.`)) return
    void run(async () => { await adminCall({ action: 'delete', user_id: u.id }) })
  }

  return (
    <div className="space-y-6">
      <AccessGuide />
      <div role="tablist" aria-label="Viste" className="-mt-1 flex gap-6 border-b border-slate-200 text-sm font-medium">
        <TabButton active={tab === 'account'} onClick={() => setTab('account')}>Account ({users.length})</TabButton>
        <TabButton active={tab === 'turnisti'} onClick={() => setTab('turnisti')}>Turnisti ({people.length})</TabButton>
        <TabButton active={tab === 'team'} onClick={() => setTab('team')}>Team ({teams.list.length})</TabButton>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {tab === 'team' ? <TeamsTab people={people} users={users} loading={loading} /> : tab === 'turnisti' ? <TurnistiTab people={people} users={users} loading={loading} flush={flush} reload={load} /> : <>

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
          <span className="text-xs font-medium text-slate-600">Profilo</span>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Team</span>
          {/* Nel team PM il profilo proposto è PM */}
          <select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value, role: e.target.value === 'pm' && form.role === 'viewer' ? 'pm' : form.role })} className={`mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ${form.role === 'director' && !form.team ? 'ring-amber-400' : 'ring-slate-300'}`}>
            <option value="">— nessuno —</option>
            {teams.list.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {form.role === 'turnista' && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Visibilità</span>
            <select value={form.turnista_view} onChange={(e) => setForm({ ...form, turnista_view: e.target.value as NamesMode })} className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
              <option value="own">Propri turni</option>
              <option value="all">Tutti i turni</option>
            </select>
          </label>
        )}
        {form.role === 'turnista' && form.email.includes('@') && !personByEmail(form.email) && (
          <p className="w-full text-xs text-amber-800">Nessuna persona dell'anagrafica ha questa email: il Turnista non vedrà evidenziati i propri turni finché l'email non coincide con quella della sua scheda nella pagina Team.</p>
        )}
        {form.role === 'director' && !form.team && <p className="w-full text-xs text-amber-800">Il Director vede le RAL e approva gli interventi del proprio team: scegli il team.</p>}
        <Button type="submit" variant="primary" disabled={busy || !form.email || (form.role === 'director' && !form.team)}>+ Crea utente</Button>
        <p className="w-full text-xs text-slate-500">{ROLE_HELP[form.role]}. Viene generata una password provvisoria (es. giraffa-camaleonte-12), copiabile dalla lista finché la persona non la cambia al primo accesso.</p>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Profilo:</span>
        <button type="button" aria-pressed={!roleFilter.size} onClick={() => setRoleFilter(new Set())}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${!roleFilter.size ? 'bg-blue-700 text-white ring-blue-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>Tutti ({users.length - counts.turnista})</button>
        {ROLES.filter((r) => r !== 'turnista').map((r) => (
          <button key={r} type="button" aria-pressed={roleFilter.has(r)} onClick={() => toggleRole(r)} disabled={!counts[r] && !roleFilter.has(r)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset disabled:opacity-40 ${roleFilter.has(r) ? 'bg-blue-50 text-blue-800 ring-blue-400' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>
            {ROLE_LABEL[r]} ({counts[r]})
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        <button type="button" role="switch" aria-checked={withTurnisti} onClick={() => setWithTurnisti((v) => !v)}
          className="flex items-center gap-2 rounded-full px-1 py-0.5 text-xs font-medium text-slate-700">
          <span className={`relative h-5 w-9 rounded-full transition-colors ${withTurnisti ? 'bg-blue-700' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${withTurnisti ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
          Includi turnisti ({counts.turnista})
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs font-medium text-slate-600">
          Ordina per
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded-md bg-white px-2 py-1 text-sm font-normal ring-1 ring-inset ring-slate-300">
            <option value="role">Profilo</option>
            <option value="name">Nome</option>
            <option value="last">Ultimo accesso</option>
            <option value="created">Data di creazione</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Utente</th>
              <th className="py-2 pr-3 font-medium">Profilo</th>
              <th className="py-2 pr-3 font-medium" title="Appartenenza; per il Director decide RAL visibili e interventi da approvare">Team</th>
              <th className="py-2 pr-3 font-medium" title="Per i Turnisti: propri turni o tutti i turni (vale quando l'impostazione generale è Per persona)">Visibilità</th>
              <th className="py-2 pr-3 font-medium">Stato</th>
              <th className="py-2 pr-3 font-medium">Ultimo accesso</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {shownUsers.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3">
                  <div className="font-medium text-slate-900">{u.display_name || '—'}{u.id === me.id && <span className="ml-2 text-xs font-normal text-slate-500">(tu)</span>}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="py-2 pr-3">
                  {u.role === 'super_admin' ? (
                    <span className="inline-flex rounded-md bg-red-50 px-2 py-1 text-sm font-semibold text-red-800 ring-1 ring-inset ring-red-200" title="Lo Space admin è uno solo e non si cambia da qui">Space admin</span>
                  ) : (
                    <select value={u.role} disabled={busy || !ROLES.includes(u.role)} onChange={(e) => void setRole(u, e.target.value as Role)} aria-label={`Profilo di ${u.email}`} className="rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200">
                      {/* Profilo non riconosciuto (pagina non aggiornata): mostrato com'è, mai sostituito dal primo dell'elenco */}
                      {!ROLES.includes(u.role) && <option value={u.role}>{String(u.role)} · ricarica la pagina</option>}
                      {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  )}
                  <div className="mt-0.5 max-w-64 text-[11px] text-slate-400">{ROLE_HELP[u.role]}</div>
                </td>
                <td className="py-2 pr-3">
                  <select value={u.team ?? ''} disabled={busy} onChange={(e) => void setTeam(u, e.target.value)} aria-label={`Team di ${u.email}`}
                    className={`rounded-md bg-white px-2 py-1 ring-1 ring-inset ${u.team ? 'ring-slate-200' : 'text-amber-800 ring-amber-300'}`}>
                    <option value="">— nessuno —</option>
                    {teams.list.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    {u.team && !teams.byId[u.team] && <option value={u.team}>{u.team}</option>}
                  </select>
                  <div className={`mt-0.5 text-[11px] ${roleAccess(u.role, u.team, teams).ral === 'all' ? 'font-medium text-red-700' : 'text-slate-400'}`}>{ralHint(u, teams)}</div>
                </td>
                <td className="py-2 pr-3">
                  {u.role === 'turnista' ? (
                    <>
                      <select value={u.turnista_view ?? 'own'} disabled={busy} onChange={(e) => setView(u, e.target.value as NamesMode)} aria-label={`Visibilità di ${u.email}`}
                        className="rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200">
                        <option value="own">Propri turni</option>
                        <option value="all">Tutti i turni</option>
                      </select>
                      <div className="mt-0.5 max-w-52 text-[11px] text-slate-400">{viewHint(namesMode, u.turnista_view)}</div>
                      {!personOf(u) && (
                        <div className="mt-1 max-w-52 text-[11px] font-medium text-amber-800" title="L'email dell'account deve coincidere con quella della sua scheda nella pagina Team">La sua email non corrisponde a nessuna scheda dell'anagrafica: non vede evidenziati i propri turni</div>
                      )}
                    </>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="py-2 pr-3">
                  {u.must_change_password ? <Badge tone="amber">Password provvisoria</Badge> : <Badge tone="green">Attivo</Badge>}
                  {u.must_change_password && <TempPassword password={u.temp_password} />}
                </td>
                <td className="py-2 pr-3 text-slate-600">{fmtDate(u.last_sign_in_at)}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  {u.id === me.id
                    ? <span className="px-2 text-xs text-slate-400" title="Per il tuo account usa Cambia password dal menu in alto a destra: una reimpostazione chiuderebbe la tua sessione">Il tuo account</span>
                    : <Button variant="ghost" disabled={busy} onClick={() => reset(u)}>Reimposta password</Button>}
                  {u.id !== me.id && <Button variant="ghost" className="text-red-700" disabled={busy} onClick={() => remove(u)}>Elimina</Button>}
                </td>
              </tr>
            ))}
            {!shownUsers.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">{loading ? 'Caricamento…' : users.length ? 'Nessun utente con questi filtri.' : 'Nessun utente.'}</td></tr>}
          </tbody>
        </table>
      </div>
      </>}

      {pending && <AccessChangeDialog change={pending} teams={teams} people={people} conflict={isHead(pending.role) ? headOf(pending.team, pending.user?.id) : undefined}
        namesMode={effectiveNames(namesMode, pending.user?.turnista_view)} onCancel={() => setPending(null)} onConfirm={() => applyPending(pending)} />}
      {secret && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="sec-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="sec-title" className="text-lg font-semibold text-slate-900">{secret.reason}</h3>
            <p className="mt-1 text-sm text-slate-500">Password temporanea per <strong>{secret.email}</strong>. Copiala e comunicala alla persona su un canale riservato.</p>
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

const GUIDE: [Role, string, string, string][] = [
  ['super_admin', 'Tutte le pagine, utenti e team', 'Tutti', 'Tutto; può essere a capo di un team (ne approva gli interventi). Uno solo: non si assegna né si cambia da qui'],
  ['governance', 'Tutte le pagine tranne Utenti', 'Tutti', 'Modifica tutto il piano, anche il team delle risorse'],
  ['director', 'Tutte le pagine tranne Utenti', 'Solo del proprio team', 'Modifica il piano; capo del team: approva gli interventi del team e sblocca i giorni dei suoi turni. Uno solo per team'],
  ['hr', 'Tutte le pagine tranne Utenti', 'Tutti', 'Non modifica il piano; consuntiva i giorni e i mesi ed esporta per le paghe'],
  ['pm', 'Approccio, Calendario, Interventi', 'Nessuno (solo ore)', 'Approva o rifiuta gli interventi di tutti i team'],
  ['viewer', 'Solo Calendario', 'Nessuno', 'Niente'],
  ['turnista', 'Calendario e I miei interventi', 'Nessuno', 'Dichiara i propri interventi'],
]

/** Guida a scomparsa: profili, cosa vede ciascuno, come si protegge l'accesso alle RAL. */
function AccessGuide() {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50">
      <AccordionSummary compact>Come funzionano profili e accessi</AccordionSummary>
      <div className="space-y-3 border-t border-slate-200 p-4 text-sm text-slate-700">
        <p>Ogni account ha <strong>un profilo</strong>, che decide cosa vede e cosa può fare. Il <strong>team</strong> indica solo a quale gruppo appartiene: conta per il Director (vede le RAL e approva gli interventi delle sole persone del suo team) e per lo Space admin a capo di un team.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3 font-medium">Profilo</th><th className="py-2 pr-3 font-medium">Pagine</th><th className="py-2 pr-3 font-medium">RAL, livelli e importi</th><th className="py-2 font-medium">Può fare</th></tr></thead>
            <tbody>
              {GUIDE.map(([r, pages, ral, can]) => (
                <tr key={r} className="border-b border-slate-100 align-top">
                  <td className="py-1.5 pr-3 font-semibold text-slate-900">{ROLE_LABEL[r]}</td>
                  <td className="py-1.5 pr-3">{pages}</td>
                  <td className={`py-1.5 pr-3 ${ral === 'Tutti' ? 'font-medium text-red-800' : ral.startsWith('Solo') ? 'text-amber-800' : 'text-slate-600'}`}>{ral}</td>
                  <td className="py-1.5">{can}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="ml-5 list-disc space-y-1">
          <li>Ogni team ha <strong>un solo capo</strong>: il suo Director, oppure lo Space admin se assegnato a quel team.</li>
          <li>Prima di ogni modifica che dà accesso alle RAL (nuovo account Governance, HR o Director, cambio di profilo, cambio di team di un Director, spostamento di una risorsa in un altro team) l'app dice <strong>quante e quali RAL</strong> la persona vedrà e chiede conferma.</li>
          <li>Gli importi (gettone, straordinario) li vede solo chi vede la RAL della persona. In anagrafica le RAL restano oscurate finché non si reinserisce la propria password.</li>
          <li>Le regole sono applicate anche nel database: un errore nell'interfaccia non può mostrare dati a chi non è autorizzato.</li>
        </ul>
      </div>
    </details>
  )
}

/** Impostazione dello space admin: i Turnisti vedono i nomi di tutti oppure solo i propri turni. */
function TurnistaNamesSetting() {
  const [mode, setMode] = useState<NamesSetting | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('calendar_settings').select('turnista_names').eq('id', 1).maybeSingle()
    if (err) setError(`Impostazione non disponibile: ${err.message}`)
    else setMode(parseNamesSetting((data as { turnista_names?: string } | null)?.turnista_names))
  }, [])
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const save = async (next: NamesSetting) => {
    const prev = mode
    setMode(next)
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('calendar_settings').update({ turnista_names: next, updated_at: new Date().toISOString() }).eq('id', 1)
    setSaving(false)
    if (err) { setMode(prev); setError(`Salvataggio non riuscito: ${err.message}`) }
  }

  const option = (value: NamesSetting, label: string, help: string) => (
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
      <h3 className="text-sm font-semibold text-slate-800">Calendario dei Turnisti: cosa vedono</h3>
      <div role="radiogroup" aria-label="Cosa vedono i Turnisti" className="mt-2 flex flex-col gap-2 md:flex-row">
        {option('all', 'Tutti i turni', 'Ogni Turnista vede chi copre ciascun turno.')}
        {option('own', 'Solo i propri turni', 'I turni degli altri compaiono come "Turno coperto": i loro nomi non vengono inviati al browser.')}
        {option('per_user', 'Per persona (ibrida)', 'Ognuno vede ciò che indica la sua Visibilità nella scheda Account: "Propri turni" oppure "Tutti i turni".')}
      </div>
      <p className="mt-2 text-xs text-slate-500">Vale per tutti gli account con livello Turnista. Ognuno vede sempre evidenziati i propri turni (riconosciuti dall'email della sua scheda in anagrafica).</p>
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
 * lo space admin crea da qui gli account Turnista, uno alla volta o in blocco.
 */
function TurnistiTab({ people, users, loading, flush, reload }: { people: Person[]; users: UserRow[]; loading: boolean; flush: () => Promise<void>; reload: () => Promise<void> }) {
  const teams = useTeams()
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
    if (list.length > 1 && !confirm(`Creare ${list.length} account Turnista? Ognuno riceve una password provvisoria, copiabile dalla lista finché non la cambia.`)) return
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
                  <td className="py-2 pr-3 text-slate-700">{p.team ? teamLabel(teams, p.team) : '—'}</td>
                  <td className="py-2 pr-3 text-slate-700">{roleOfPerson(p)}</td>
                  <td className="py-2 pr-3">
                    {acc ? <span className={`inline-flex rounded-md px-1.5 py-px text-[11px] font-semibold ring-1 ring-inset ${ACCOUNT_TONE(acc.role)}`}>{ROLE_LABEL[acc.role]}</span>
                      : <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">Nessun account</span>}
                    {acc?.must_change_password && <TempPassword password={(acc as UserRow).temp_password} />}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{acc ? fmtDate(acc.last_sign_in_at) : '—'}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {can && <Button disabled={busy} onClick={() => void create([p])}>Crea account</Button>}
                    {!acc && !p.email && <a href="#/team" className="text-xs text-blue-700 hover:underline">Inserisci l'email nella pagina Team</a>}
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
        <span className="text-xs text-slate-600">Account Turnista già collegati alla scheda; password provvisorie copiabili dalla lista finché non vengono cambiate.</span>
      </div>

      {result && <CredentialsDialog items={result.created} errors={result.errors} onClose={() => setResult(null)} />}
    </div>
  )
}

interface PendingChange {
  /** Account esistente, oppure null per un nuovo account (dati in `draft`) */
  user: UserRow | null
  who: string
  role: Role
  team: TeamId | null
  draft?: { email: string; display_name: string; role: Role; team: TeamId; turnista_view: NamesMode }
}

/** Il profilo vede RAL (tutti i team, o il proprio team per il Director con un team). */
const grantsRal = (role: Role, team: TeamId | null) => seesAllSalaries(role) || (role === 'director' && !!team)
/** Capo di un team: il Director, oppure lo Space admin assegnato a quel team. */
const isHead = (role: Role) => role === 'director' || role === 'super_admin'
/** Messaggi leggibili per i vincoli del database. */
const friendlyError = (m: string) =>
  /profiles_one_head_per_team/.test(m) ? 'Il team ha già un capo (Director o Space admin): cambia prima il suo profilo o il suo team.'
  : /profiles_one_super_admin/.test(m) ? 'Lo Space admin è uno solo.'
  : m

/** Breve indicazione sotto il team: cosa vede davvero, tenendo conto anche del profilo. */
const ralHint = (u: { role: Role; team: TeamId | null }, teams: TeamDir) => {
  const a = roleAccess(u.role, u.team, teams)
  if (a.ral === 'all') return u.role === 'super_admin' && u.team ? `Vede RAL e importi di tutti i team · a capo del team ${teamLabel(teams, u.team)}` : 'Vede RAL e importi di tutti i team'
  if (a.ral === 'team' && u.team) return `Director: RAL e importi del team ${teamLabel(teams, u.team)}`
  return u.role === 'director' ? 'Director senza team: nessuna RAL, nessuna approvazione' : `Non vede RAL (profilo ${ROLE_LABEL[u.role] ?? u.role})`
}

/** Persone di cui il profilo vedrebbe la RAL. */
const ralPeople = (role: Role, team: TeamId | null, people: Person[]) =>
  seesAllSalaries(role) ? people : role === 'director' && team ? people.filter((p) => p.team === team) : []

/**
 * Conferma di un nuovo account, di un cambio di profilo o di team: dice a cosa accederà la persona, con le RAL
 * in evidenza (quante e di chi), e blocca un secondo capo nello stesso team.
 */
function AccessChangeDialog({ change, teams, people, conflict, namesMode, onCancel, onConfirm }: { change: PendingChange; teams: TeamDir; people: Person[]; conflict?: UserRow; namesMode: NamesMode; onCancel: () => void; onConfirm: () => void }) {
  const { user, who, role, team } = change
  const before = user ? roleAccess(user.role, user.team, teams, namesMode) : null
  const after = roleAccess(role, team, teams, namesMode)
  const beforeIds = new Set(user ? ralPeople(user.role, user.team, people).map((p) => p.id) : [])
  const afterPeople = ralPeople(role, team, people)
  const gained = afterPeople.filter((p) => !beforeIds.has(p.id))
  const lostHead = user && isHead(user.role) && user.team && (role !== user.role || team !== user.team) ? teamLabel(teams, user.team) : ''
  const label = (r: Role, t: TeamId | null) => `${ROLE_LABEL[r]} · ${t ? teamLabel(teams, t) : 'nessun team'}`
  const title = !user ? `Creare l'account ${who}?` : role !== user.role ? `Cambiare il profilo di ${who}?` : `Cambiare il team di ${who}?`
  const ralTone = after.ral === 'all' ? 'bg-red-50 text-red-900 ring-red-200' : after.ral === 'team' ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-emerald-50 text-emerald-900 ring-emerald-200'
  const becomesHead = isHead(role) && !!team && (!user || !isHead(user.role) || user.team !== team)
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="acc-title" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="acc-title" className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{user ? <>Da <strong>{label(user.role, user.team)}</strong> a </> : 'Profilo '}<strong className="text-slate-900">{label(role, team)}</strong>.</p>

        {gained.length > 0 && (
          <div role="alert" className="mt-4 rounded-lg bg-red-600 px-3 py-2.5 text-sm text-white">
            <strong>Attenzione: questa modifica dà accesso alle RAL.</strong> {who} vedrà RAL, livello e importi di <strong>{gained.length} {gained.length === 1 ? 'persona' : 'persone'}</strong> che oggi non vede{after.ral === 'all' ? ' (tutta l\'anagrafica)' : ''}.
          </div>
        )}
        {conflict && (
          <div role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-300">
            <strong>Il team {teamLabel(teams, team)} ha già un capo:</strong> {conflict.display_name || conflict.email} ({ROLE_LABEL[conflict.role]}). Ogni team ha un solo Director: cambia prima il suo profilo o il suo team.
          </div>
        )}

        <div className={`mt-4 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset ${ralTone}`}>
          <div className="font-semibold">RAL, livelli e importi: {after.ralText}</div>
          {before && before.ralText !== after.ralText && <div className="mt-0.5 text-xs opacity-90">Prima: {before.ralText}</div>}
          {afterPeople.length > 0 && after.ral === 'team' && (
            <div className="mt-1.5 text-xs">Persone del team ({afterPeople.length}): {afterPeople.map((p) => p.name).sort((a, b) => a.localeCompare(b, 'it')).join(', ')}</div>
          )}
          {afterPeople.length > 0 && after.ral === 'all' && <div className="mt-1.5 text-xs">Tutte le {afterPeople.length} persone dell'anagrafica, di tutti i team.</div>}
        </div>
        {becomesHead && !conflict && (
          <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 ring-1 ring-inset ring-blue-200">
            Sarà <strong>il capo del team {teamLabel(teams, team)}</strong>: approva o rifiuta gli interventi delle persone del team e sblocca i giorni dei loro turni.
          </p>
        )}
        {after.managesUsers && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-inset ring-red-200">
            <strong>Gestisce gli utenti:</strong> può cambiare profilo e team di chiunque.
          </p>
        )}

        <div className="mt-4 text-sm">
          <div className="font-semibold text-slate-900">Con questo profilo vedrà e potrà fare:</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">{after.sees.map((x) => <li key={x}>{x}</li>)}</ul>
          {after.excluded.length > 0 && (
            <>
              <div className="mt-3 font-semibold text-slate-900">Non vedrà né potrà fare:</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">{after.excluded.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
        </div>
        {lostHead && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">Non sarà più il capo del team {lostHead}: finché non ne viene nominato un altro, gli interventi del team li approvano i PM e lo space admin.</p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Annulla</Button>
          <Button variant={gained.length || after.managesUsers ? 'danger' : 'primary'} disabled={!!conflict} onClick={onConfirm}>
            {gained.length ? 'Confermo l\'accesso alle RAL' : !user ? 'Crea account' : role !== user.role ? `Conferma: ${ROLE_LABEL[role]}` : `Conferma: team ${team ? teamLabel(teams, team) : 'nessuno'}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Cosa vede davvero il Turnista con l'impostazione generale attuale. */
const viewHint = (setting: NamesSetting, own?: NamesMode) => {
  if (setting === 'all') return 'Ora vede tutti i turni: impostazione generale "Tutti i turni"'
  if (setting === 'own') return 'Ora vede solo i propri: impostazione generale "Solo i propri turni"'
  return effectiveNames(setting, own) === 'all' ? 'Ora vede tutti i turni (impostazione Per persona)' : 'Ora vede solo i propri turni (impostazione Per persona)'
}

/** Password provvisoria ancora da cambiare: copiabile per comunicarla di nuovo. Dopo il cambio resta solo "Reimposta password". */
function TempPassword({ password }: { password?: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!password) return <div className="mt-1 max-w-48 text-[11px] text-slate-500">Non ancora cambiata; la password provvisoria non è disponibile: usa Reimposta password.</div>
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-800 select-all">{password}</code>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(password); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }}
        className="rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50">{copied ? 'Copiata' : 'Copia'}</button>
    </div>
  )
}
