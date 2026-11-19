import { useEffect, useRef, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Dashboard } from './components/Dashboard'
import { Approach } from './components/Approach'
import { Login } from './components/Login'
import { ParamsPanel } from './components/ParamsPanel'
import { Payroll } from './components/Payroll'
import { Planner } from './components/Planner'
import { EyeIcon, PasswordDialog } from './components/PasswordDialog'
import { useRevealSensitive } from './components/useRevealSensitive'
import { ForcedPasswordChange } from './components/ChangePassword'
import { MenuItem, UserMenu } from './components/UserMenu'
import { TurnistaApp } from './components/ShiftsView'
import { CredentialsDialog } from './components/CredentialsDialog'
import { createTurnistaAccount, type Credential } from './lib/accounts'
import { useAccounts } from './lib/useAccounts'
import { UsersPage } from './components/UsersPage'
import { TeamPanel } from './components/TeamPanel'
import { Button, Section } from './components/ui'
import { useAuth, verifyOwnPassword } from './lib/useAuth'
import { useRemoteData, type SyncStatus } from './lib/useRemoteData'
import { useHeightVar } from './lib/useStickyBar'
import { canEdit, canManageUsers, canReadFull, type Profile, type Role } from './lib/roles'
import { download, fullReportCsv } from './lib/reports'
import { buildShiftsPdf, buildShiftsXlsx } from './lib/shiftsExport'
import type { ExportRange } from './lib/exportRange'
import { ExportDialog, type ExportFormat } from './components/ExportDialog'
import { normalizeWithReport } from './lib/store'
import { HORIZON_LABEL } from './lib/calendar'
import { defaultResourceTeam, seesAllSalaries, type Assignments, type Person, type UserTeam } from './lib/types'
import { regenerate } from './lib/rules'
import { callFunction } from './lib/supabase'
import { needsServerChecks, useServerChecks } from './lib/serverChecks'

const NAV = [
  ['doc', 'Approccio'],
  ['params', 'A · Parametri'],
  ['team', 'B · Team'],
  ['planner', 'C · Calendario'],
  ['payroll', 'D · Consuntivo'],
  ['pnl', 'E · Conto economico'],
  ['users', 'Utenti'],
] as const
type PageId = (typeof NAV)[number][0]

/** Pagine visibili per livello: il viewer vede solo il calendario, la gestione utenti è del super admin. */
const pagesFor = (role: Role): PageId[] =>
  role === 'viewer' ? ['planner']
  : NAV.map(([id]) => id).filter((id) => id !== 'users' || canManageUsers(role))

const readPage = (allowed: PageId[]): PageId => {
  const h = location.hash.replace(/^#\/?/, '') as PageId
  return allowed.includes(h) ? h : allowed[0]
}

/** Navigazione a pagine tramite hash (#/planner…). */
function usePage(allowed: PageId[]) {
  const key = allowed.join(',')
  const [page, setPage] = useState<PageId>(() => readPage(allowed))
  useEffect(() => {
    const list = key.split(',') as PageId[]
    const on = () => { setPage(readPage(list)); window.scrollTo(0, 0) }
    on()
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [key])
  return page
}

export default function App() {
  const { state, signIn, signOut, changePassword } = useAuth()
  if (state.status === 'loading') return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Caricamento…</div>
  if (state.status === 'signed-out') return <Login onSignIn={signIn} notice={state.notice} />
  if (state.status === 'no-profile') {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-sm shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Account non abilitato</h1>
          <p className="mt-2 text-slate-600">Questo account non ha un livello di accesso assegnato. Contatta il super admin.</p>
          <Button className="mt-4" onClick={signOut}>Esci</Button>
        </div>
      </div>
    )
  }
  const { profile } = state
  if (profile.must_change_password) return <ForcedPasswordChange email={profile.email} onSubmit={changePassword} onSignOut={signOut} />
  // Il Turnista ha una vista a sé: solo il calendario, letto tramite la funzione del database
  if (profile.role === 'turnista') return <ErrorBoundary><TurnistaApp key={profile.id} profile={profile} onLogout={signOut} onChangePassword={changePassword} /></ErrorBoundary>
  return <ErrorBoundary><Main key={profile.id + profile.role} profile={profile} onLogout={signOut} onChangePassword={changePassword} /></ErrorBoundary>
}

function Main({ profile, onLogout, onChangePassword }: { profile: Profile; onLogout: () => void; onChangePassword: (pwd: string) => Promise<void> }) {
  const role = profile.role
  const editable = canEdit(role)
  const headerRef = useHeightVar('--app-header-h')
  const { data, setData, replace, status, error: syncError, flush } = useRemoteData(canReadFull(role), editable)
  // Import/export della configurazione completa: solo chi vede RAL e livello di tutti i team
  const fullConfig = seesAllSalaries(profile.team)
  const { checks: serverChecks, state: serverChecksState } = useServerChecks(data, status, canReadFull(role))
  /**
   * Auto-compilazione: in pagina se l'utente vede tutte le RAL e non ci sono RAL Q/, altrimenti sul
   * server (che conosce RAL e media di riferimento) dopo aver salvato le modifiche in corso.
   */
  const autofill = async (from: string, to: string): Promise<Assignments> => {
    if (!data.people.some(needsServerChecks)) return regenerate(data.people, data.assignments, data.params, from, to, data.excludedDays, data.pinned)
    await flush()
    const res = await callFunction<{ assignments: Assignments }>('planner', { action: 'autofill', from, to })
    return res.assignments
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const allowed = pagesFor(role)
  const page = usePage(allowed)
  const [menuOpen, setMenuOpen] = useState(false)
  const verify = (password: string) => verifyOwnPassword(profile.email, password)

  const [confirmExport, setConfirmExport] = useState(false)
  const doExportJson = () => download(`${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-ARM-HD2-configurazione.json`, JSON.stringify(data, null, 2), 'application/json')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null)

  /** Genera il file del formato scelto, limitato al periodo indicato nella finestra di export. */
  const runExport = async (format: ExportFormat, range: ExportRange, fileName: string) => {
    setExporting(true)
    try {
      if (format === 'csv') {
        download(fileName, fullReportCsv(data.people, data.assignments, data.params, data.excludedDays, range, serverChecks?.nd), 'text/csv;charset=utf-8')
      } else if (format === 'xlsx') {
        download(fileName, await buildShiftsXlsx(data.people, data.assignments, data.excludedDays, range), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      } else {
        download(fileName, await buildShiftsPdf(data.people, data.assignments, data.excludedDays, range), 'application/pdf')
      }
      setExportFormat(null)
    } catch (e) {
      setNotice({ tone: 'error', text: `Export non riuscito: ${(e as Error).message}` })
    } finally {
      setExporting(false)
    }
  }
  const importJson = async (f?: File) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!f) return
    if (!/\.json$/i.test(f.name)) return setNotice({ tone: 'error', text: `Import non riuscito: "${f.name}" non è un file .json. Usa un file creato con "Esporta configurazione JSON".` })
    if (f.size > 2_000_000) return setNotice({ tone: 'error', text: 'Import non riuscito: file troppo grande per essere una configurazione del tool.' })
    let raw: unknown
    try {
      raw = JSON.parse(await f.text())
    } catch {
      return setNotice({ tone: 'error', text: 'Import non riuscito: il file non contiene JSON valido (forse è danneggiato o non è una configurazione del tool).' })
    }
    try {
      const { data: next, warnings } = normalizeWithReport(raw)
      const noEmail = next.people.filter((p) => !p.email)
      if (noEmail.length) return setNotice({ tone: 'error', text: `Import non riuscito: ${noEmail.length} ${noEmail.length === 1 ? 'risorsa non ha' : 'risorse non hanno'} un'email valida (${noEmail.slice(0, 3).map((p) => p.name).join(', ')}${noEmail.length > 3 ? '…' : ''}). L'email è obbligatoria: aggiungila nel file e riprova.` })
      if (!confirm(`Importare ${next.people.length} risorse e ${Object.keys(next.assignments).length} turni? I dati condivisi attuali verranno sostituiti per tutti gli utenti.`)) return
      await replace(next)
      setNotice(warnings.length
        ? { tone: 'warn', text: `Configurazione importata con avvisi: ${warnings.join('; ')}.` }
        : { tone: 'ok', text: `Configurazione importata: ${next.people.length} risorse, ${Object.keys(next.assignments).length} turni.` })
    } catch (e) {
      setNotice({ tone: 'error', text: `Import non riuscito: ${(e as Error).message}` })
    }
  }
  /** Blocca/sblocca un giorno non richiesto dal cliente; bloccandolo si rimuovono i turni già assegnati. */
  const toggleDay = (day: string) => {
    if (data.excludedDays.includes(day)) {
      setData((d) => ({ ...d, excludedDays: d.excludedDays.filter((x) => x !== day) }))
      return
    }
    const assigned = Object.keys(data.assignments).filter((sid) => sid.startsWith(day + '|'))
    if (assigned.length && !confirm(`Il giorno ha ${assigned.length} ${assigned.length === 1 ? 'turno assegnato' : 'turni assegnati'}: bloccandolo verranno rimossi. Continuare?`)) return
    setData((d) => ({
      ...d,
      excludedDays: [...d.excludedDays, day].sort(),
      assignments: Object.fromEntries(Object.entries(d.assignments).filter(([sid]) => !sid.startsWith(day + '|'))),
    }))
  }
  /** Blocca/sblocca in blocco i giorni di un periodo; bloccando si liberano i turni già assegnati in quei giorni. */
  const setDaysExcluded = (days: string[], excluded: boolean) => {
    const set = new Set(days)
    if (!excluded) {
      setData((d) => ({ ...d, excludedDays: d.excludedDays.filter((x) => !set.has(x)) }))
      return
    }
    const assigned = Object.keys(data.assignments).filter((sid) => set.has(sid.slice(0, 10)))
    if (!confirm(`Segnare come non richiesti ${days.length} giorni?${assigned.length ? ` ${assigned.length} ${assigned.length === 1 ? 'turno assegnato verrà liberato' : 'turni assegnati verranno liberati'}.` : ''}`)) return
    setData((d) => ({
      ...d,
      excludedDays: [...new Set([...d.excludedDays, ...days])].sort(),
      assignments: Object.fromEntries(Object.entries(d.assignments).filter(([sid]) => !set.has(sid.slice(0, 10)))),
    }))
  }

  function openImport() { fileRef.current?.click() }

  const sections: Record<PageId, React.ReactNode> = {
    doc: (
      <Section id="doc" title="L'approccio" subtitle="Principi, funzionamento e sostenibilità del modello proposto.">
        <Approach params={data.params} people={data.people} />
      </Section>
    ),
    params: (
      <Section id="params" letter="A" title="Parametri economici & ricavi" subtitle="Ogni modifica ricalcola istantaneamente vincoli, consuntivo e marginalità.">
        <fieldset disabled={!editable} className="min-w-0"><ParamsPanel params={data.params} onChange={(params) => setData((d) => ({ ...d, params }))} /></fieldset>
      </Section>
    ),
    team: (
      <TeamPage verify={verify} editable={editable} myTeam={profile.team} people={data.people} assignments={data.assignments}
        superAdmin={canManageUsers(role)} flush={flush}
        onChange={(people, assignments) => setData((d) => ({ ...d, people, assignments: assignments ?? d.assignments }))} />
    ),
    planner: (
      <Section id="planner" letter="C" title={`Pianificatore calendario ${HORIZON_LABEL}`} subtitle="Le persone che violerebbero un vincolo sono disabilitate nel menu; il pannello a destra spiega il motivo esatto."
        actions={<>
          <Button onClick={() => setExportFormat('xlsx')}>Esporta turni (Excel)</Button>
          <Button onClick={() => setExportFormat('pdf')}>Esporta turni (PDF)</Button>
        </>}>
        <Planner readOnly={!editable} simple={role === 'viewer'} people={data.people} assignments={data.assignments} params={data.params} excludedDays={data.excludedDays} pinned={data.pinned}
          onChange={(assignments) => setData((d) => ({ ...d, assignments }))} onToggleDay={toggleDay}
          autofill={autofill} serverChecks={serverChecks} serverChecksState={serverChecksState}
          onSetDaysExcluded={setDaysExcluded}
          onTogglePin={(sid) => setData((d) => ({ ...d, pinned: d.pinned.includes(sid) ? d.pinned.filter((x) => x !== sid) : [...d.pinned, sid] }))} />
      </Section>
    ),
    payroll: (
      <Section id="payroll" letter="D" title="Consuntivo mensile cedolino" subtitle="Per persona e settimana: indennità CCNL, gettone di disponibilità e alternativa in ore."
        actions={<Button onClick={() => setExportFormat('csv')}>Esporta report (CSV)</Button>}>
        <Payroll people={data.people} assignments={data.assignments} params={data.params} nd={serverChecks?.nd} />
      </Section>
    ),
    pnl: (
      <Section id="pnl" letter="E" title="Dashboard economica & marginalità (P&L)" actions={<Button onClick={() => setExportFormat('csv')}>Esporta report (CSV)</Button>}>
        <Dashboard people={data.people} assignments={data.assignments} params={data.params} excludedDays={data.excludedDays} nd={serverChecks?.nd} />
      </Section>
    ),
    users: canManageUsers(role) ? (
      <Section id="users" title="Utenti e livelli di accesso" subtitle="Solo il super admin vede questa pagina.">
        <UsersPage me={profile} people={data.people} flush={flush} />
      </Section>
    ) : null,
  }

  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <a href="#/doc" className="font-semibold text-slate-900">Piano reperibilità <span className="text-blue-700">- ARM</span></a>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Sezioni">
            {NAV.filter(([id]) => allowed.includes(id)).map(([id, label]) => (
              <a key={id} href={`#/${id}`} aria-current={page === id ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 font-medium ${page === id ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SyncBadge status={status} />
            {editable && fullConfig && (
              <div className="relative">
                <Button onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu">Dati ▾</Button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                    <div role="menu" className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                      <MenuItem onClick={() => { setMenuOpen(false); setConfirmExport(true) }}>Esporta configurazione JSON</MenuItem>
                      <MenuItem onClick={() => { setMenuOpen(false); openImport() }}>Importa configurazione JSON</MenuItem>
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
              </div>
            )}
            <UserMenu profile={profile} onLogout={onLogout} onChangePassword={onChangePassword} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-6">
        {notice && (
          <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${notice.tone === 'error' ? 'bg-red-50 text-red-800' : notice.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
            <span className="flex-1">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs font-medium opacity-70 hover:opacity-100" aria-label="Chiudi messaggio">Chiudi</button>
          </div>
        )}
        {syncError && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{syncError}</div>}
        {status === 'loading' ? <p className="py-10 text-center text-sm text-slate-500">Caricamento dei dati condivisi…</p> : sections[page]}
      </main>
      {exportFormat && (
        <ExportDialog format={exportFormat} busy={exporting} onClose={() => setExportFormat(null)}
          onExport={(range, fileName) => runExport(exportFormat, range, fileName)} />
      )}
      {confirmExport && (
        <PasswordDialog
          title="Esporta configurazione"
          description="Il file contiene l'anagrafica completa: reinserisci la tua password per esportarlo."
          verify={verify}
          onSuccess={() => { setConfirmExport(false); doExportJson() }}
          onClose={() => setConfirmExport(false)}
        />
      )}
    </div>
  )
}

/** Pagina anagrafica: RAL e livello oscurati finché non si reinserisce la password (lo stato si azzera cambiando pagina). */
function TeamPage({ verify, editable, myTeam, people, assignments, superAdmin, flush, onChange }: { verify: (pwd: string) => Promise<boolean>; editable: boolean; myTeam: UserTeam | null; people: Person[]; assignments: Assignments; superAdmin: boolean; flush: () => Promise<void>; onChange: (people: Person[], assignments?: Assignments) => void }) {
  const { revealed, toggle, dialog } = useRevealSensitive(verify)
  // Solo il super admin vede il tipo di account di ogni risorsa e può creare quello da Turnista
  const { accounts, loaded, reload } = useAccounts(superAdmin)
  const [creds, setCreds] = useState<Credential[] | null>(null)
  const createAccount = async (p: Person) => {
    await flush() // la scheda (e la sua email) deve essere già salvata
    const c = await createTurnistaAccount(p)
    await reload()
    setCreds([c])
  }
  return (
    <>
      <Section id="team" letter="B" title="Anagrafica team" subtitle="Chi ha dato KO resta in anagrafica ma non compare nel calendario. La disponibilità guida l'auto-compilazione."
        actions={<>
          <Button onClick={toggle} aria-pressed={revealed} className={revealed ? 'ring-blue-300 bg-blue-50 text-blue-800' : ''}>
            <EyeIcon off={revealed} /> {revealed ? 'Oscura RAL e livello' : 'Mostra RAL e livello'}
          </Button>
        </>}>
        <fieldset disabled={!editable} className="min-w-0">
          <TeamPanel people={people} assignments={assignments} onChange={onChange} revealed={revealed}
            myTeam={myTeam} canSetTeam={editable && seesAllSalaries(myTeam)} newTeam={defaultResourceTeam(myTeam)}
            accounts={superAdmin && loaded ? accounts : undefined} onCreateAccount={superAdmin ? createAccount : undefined} />
        </fieldset>
      </Section>
      {dialog}
      {creds && <CredentialsDialog items={creds} onClose={() => setCreds(null)} />}
    </>
  )
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, [string, string]> = {
    loading: ['Caricamento…', 'text-slate-400'],
    synced: ['● Sincronizzato', 'text-emerald-700'],
    saving: ['● Salvataggio…', 'text-amber-700'],
    error: ['● Errore di sincronizzazione', 'text-red-700'],
  }
  const [label, cls] = map[status]
  return <span className={`hidden text-xs xl:inline ${cls}`}>{label}</span>
}
