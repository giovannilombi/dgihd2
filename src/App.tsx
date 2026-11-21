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
import { canEdit, canManageUsers, canReadFull, canReadPlan, seesAllSalaries, type Profile, type Role } from './lib/roles'
import { download, fullReportCsv } from './lib/reports'
import { buildShiftsPdf, buildShiftsXlsx } from './lib/shiftsExport'
import type { ExportRange } from './lib/exportRange'
import { ExportDialog, type ExportFormat } from './components/ExportDialog'
import { normalizeWithReport } from './lib/store'
import { HORIZON_LABEL } from './lib/calendar'
import type { Assignments, Person } from './lib/types'
import { defaultResourceTeam, type TeamId } from './lib/teams'
import { useTeams } from './lib/useTeams'
import { TeamsProvider } from './components/TeamsProvider'
import { regenerate } from './lib/rules'
import { callFunction } from './lib/supabase'
import { needsServerChecks, useServerChecks } from './lib/serverChecks'
import { dayPerms, lockedSlots, romeNow } from './lib/dayStatus'
import { amountsVisible, bySlot, shiftChip } from './lib/interventions'
import { useInterventions, useMyShifts } from './lib/useInterventions'
import { InterventionsReview } from './components/InterventionsReview'
import { MyInterventions } from './components/MyInterventions'
import { PayrollExportDialog } from './components/PayrollExportDialog'
import { buildPayrollXlsx, type PayrollExport } from './lib/payrollExport'
import { consuntivaDay, consuntivaMonth, markDayErogato, unlockDay, useDayStatus } from './lib/useDayStatus'
import type { DayActions } from './components/Planner'

/** Pagine nell'ordine del lavoro; "I miei interventi" e "Utenti" stanno a parte nella riga delle schede. */
const NAV = [
  ['doc', 'Approccio'],
  ['params', 'Parametri'],
  ['team', 'Team'],
  ['planner', 'Calendario'],
  ['interventi', 'Interventi'],
  ['payroll', 'Consuntivo'],
  ['pnl', 'Conto economico'],
  ['miei', 'I miei interventi'],
  ['users', 'Utenti'],
] as const
type PageId = (typeof NAV)[number][0]

/**
 * Pagine visibili per livello: il viewer vede solo il calendario, la gestione utenti è dello space admin.
 * "I miei interventi" compare a chi è collegato a una scheda del piano (anche se è di turno).
 */
const pagesFor = (role: Role, linked: boolean): PageId[] => {
  const mine: PageId[] = linked ? ['miei'] : []
  if (role === 'viewer') return ['planner', ...mine]
  // PM: approccio, calendario e interventi (solo ore), senza parametri, anagrafica e importi
  if (role === 'pm') return ['doc', 'planner', 'interventi', ...mine]
  return NAV.map(([id]) => id).filter((id) => (id !== 'users' || canManageUsers(role)) && (id !== 'miei' || linked))
}

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
          <p className="mt-2 text-slate-600">Questo account non ha un livello di accesso assegnato. Contatta lo space admin.</p>
          <Button className="mt-4" onClick={signOut}>Esci</Button>
        </div>
      </div>
    )
  }
  const { profile } = state
  if (profile.must_change_password) return <ForcedPasswordChange email={profile.email} onSubmit={changePassword} onSignOut={signOut} />
  // Il Turnista ha una vista a sé: solo il calendario, letto tramite la funzione del database
  if (profile.role === 'turnista') return <ErrorBoundary><TeamsProvider><TurnistaApp key={profile.id} profile={profile} onLogout={signOut} onChangePassword={changePassword} /></TeamsProvider></ErrorBoundary>
  return <ErrorBoundary><TeamsProvider><Main key={profile.id + profile.role} profile={profile} onLogout={signOut} onChangePassword={changePassword} /></TeamsProvider></ErrorBoundary>
}

function Main({ profile, onLogout, onChangePassword }: { profile: Profile; onLogout: () => void; onChangePassword: (pwd: string) => Promise<void> }) {
  const role = profile.role
  const editable = canEdit(role)
  const headerRef = useHeightVar('--app-header-h')
  const { data, setData, replace, status, error: syncError, flush } = useRemoteData(canReadFull(role), editable, canReadPlan(role))
  const teams = useTeams()
  // Import/export della configurazione completa: solo chi vede RAL e livello di tutti i team
  const fullConfig = seesAllSalaries(role)
  const { checks: serverChecks, state: serverChecksState } = useServerChecks(data, status, canReadFull(role))
  // Giorni erogati (turni definitivi) e consuntivati; le azioni passano dalle funzioni del database
  const { days, reload: reloadDays } = useDayStatus(true)
  const me = { id: profile.id, role, team: profile.team }
  const dayAction = (fn: (day: string) => Promise<unknown>) => async (day: string) => { await flush(); await fn(day); await reloadDays() }
  const dayActions: DayActions = {
    perms: (day) => dayPerms(day, me, data.people, data.assignments),
    mark: dayAction(markDayErogato),
    close: dayAction(consuntivaDay),
    unlock: async (day, note) => { await unlockDay(day, note); await reloadDays() },
  }
  const closeMonth = async (month: string) => { const n = await consuntivaMonth(month); await reloadDays(); return n }
  // Interventi: tutti per chi legge il consuntivo; i propri per chi è collegato a una scheda del piano
  const { ivs, noInt } = useInterventions(canReadPlan(role))
  const mine = useMyShifts(true)
  const myPersonId = mine.data?.me?.id ?? null
  const ivBySlot = bySlot(ivs)
  const ivChip = canReadPlan(role) ? (sid: string) => { const info = shiftChip(sid, ivBySlot[sid] ?? [], noInt.has(sid), romeNow()); return info.chip === 'future' || info.chip === 'running' ? null : info } : undefined
  const pendingCount = ivs.filter((x) => x.status === 'pending').length
  // I miei interventi: turni da compilare e interventi rifiutati da correggere
  const myIvBySlot = bySlot(mine.data?.interventions ?? [])
  const myTodo = (mine.data?.shifts ?? []).filter((s) => !s.consuntivato && shiftChip(s.slot, myIvBySlot[s.slot] ?? [], s.noIntervention, romeNow()).chip === 'todo').length
    + (mine.data?.interventions ?? []).filter((x) => x.status === 'rejected').length
  /**
   * Auto-compilazione: in pagina se l'utente vede tutte le RAL e non ci sono RAL Q/, altrimenti sul
   * server (che conosce RAL e media di riferimento) dopo aver salvato le modifiche in corso.
   */
  const autofill = async (from: string, to: string): Promise<Assignments> => {
    // i turni dei giorni erogati restano come sono (il database rifiuterebbe ogni modifica)
    const locked = lockedSlots(days, data.assignments)
    if (!data.people.some(needsServerChecks)) return regenerate(data.people, data.assignments, data.params, from, to, data.excludedDays, [...data.pinned, ...locked])
    await flush()
    const res = await callFunction<{ assignments: Assignments }>('planner', { action: 'autofill', from, to })
    const out = Object.fromEntries(Object.entries(res.assignments).filter(([sid]) => !days[sid.slice(0, 10)]))
    for (const sid of locked) out[sid] = data.assignments[sid]
    return out
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const allowed = pagesFor(role, !!myPersonId)
  const page = usePage(allowed)
  const [menuOpen, setMenuOpen] = useState(false)
  const verify = (password: string) => verifyOwnPassword(profile.email, password)

  const [confirmExport, setConfirmExport] = useState(false)
  const doExportJson = () => download(`${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-ARM-HD2-configurazione.json`, JSON.stringify(data, null, 2), 'application/json')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null)
  const [payExport, setPayExport] = useState(false)
  /** Export per le paghe: il file resta sul computer di chi lo scarica (contiene importi personali). */
  const runPayrollExport = async (x: PayrollExport, fileName: string) => {
    setExporting(true)
    try {
      download(fileName, await buildPayrollXlsx(x, teams, data.params), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      setPayExport(false)
    } catch (e) {
      setNotice({ tone: 'error', text: `Export non riuscito: ${(e as Error).message}` })
    } finally {
      setExporting(false)
    }
  }

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
      const { data: next, warnings } = normalizeWithReport(raw, new Set(teams.list.map((t) => t.id)))
      const noEmail = next.people.filter((p) => !p.email)
      if (noEmail.length) return setNotice({ tone: 'error', text: `Import non riuscito: ${noEmail.length} ${noEmail.length === 1 ? 'risorsa non ha' : 'risorse non hanno'} un'email valida (${noEmail.slice(0, 3).map((p) => p.name).join(', ')}${noEmail.length > 3 ? '…' : ''}). L'email è obbligatoria: aggiungila nel file e riprova.` })
      const withTeam = next.people.filter((p) => p.team).length
      if (!confirm(`Importare ${next.people.length} risorse e ${Object.keys(next.assignments).length} turni? I dati condivisi attuali verranno sostituiti per tutti gli utenti.${withTeam ? `\n\nAttenzione: ${withTeam} risorse hanno un team nel file; il capo di ciascun team vedrà RAL, livello e importi delle sue risorse (oltre a Space admin, Governance e HR).` : ''}`)) return
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
    if (days[day]) return // giorno erogato: definitivo
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
  const setDaysExcluded = (list: string[], excluded: boolean) => {
    // i giorni erogati sono definitivi: non diventano "non richiesti"
    const targets = excluded ? list.filter((d) => !days[d]) : list
    const set = new Set(targets)
    if (!excluded) {
      setData((d) => ({ ...d, excludedDays: d.excludedDays.filter((x) => !set.has(x)) }))
      return
    }
    const assigned = Object.keys(data.assignments).filter((sid) => set.has(sid.slice(0, 10)))
    if (!confirm(`Segnare come non richiesti ${targets.length} giorni?${targets.length < list.length ? ` (${list.length - targets.length} erogati restano come sono)` : ''}${assigned.length ? ` ${assigned.length} ${assigned.length === 1 ? 'turno assegnato verrà liberato' : 'turni assegnati verranno liberati'}.` : ''}`)) return
    setData((d) => ({
      ...d,
      excludedDays: [...new Set([...d.excludedDays, ...targets])].sort(),
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
      <Section id="params" title="Parametri economici & ricavi" subtitle="Ogni modifica ricalcola istantaneamente vincoli, consuntivo e marginalità.">
        <fieldset disabled={!editable} className="min-w-0"><ParamsPanel params={data.params} onChange={(params) => setData((d) => ({ ...d, params }))} /></fieldset>
      </Section>
    ),
    team: (
      <TeamPage verify={verify} editable={editable} role={role} myTeam={profile.team} people={data.people} assignments={data.assignments}
        superAdmin={canManageUsers(role)} flush={flush}
        onChange={(people, assignments) => setData((d) => ({ ...d, people, assignments: assignments ?? d.assignments }))} />
    ),
    planner: (
      <Section id="planner" title={`Pianificatore calendario ${HORIZON_LABEL}`} subtitle="Le persone che violerebbero un vincolo sono disabilitate nel menu; il pannello a destra spiega il motivo esatto."
        actions={<>
          <Button onClick={() => setExportFormat('xlsx')}>Esporta turni (Excel)</Button>
          <Button onClick={() => setExportFormat('pdf')}>Esporta turni (PDF)</Button>
        </>}>
        <Planner readOnly={!editable} simple={role === 'viewer' || role === 'pm'} people={data.people} assignments={data.assignments} params={data.params} excludedDays={data.excludedDays} pinned={data.pinned}
          onChange={(assignments) => setData((d) => ({ ...d, assignments }))} onToggleDay={toggleDay}
          autofill={autofill} serverChecks={serverChecks} serverChecksState={serverChecksState}
          onSetDaysExcluded={setDaysExcluded} days={days} dayActions={dayActions} ivChip={role === 'viewer' ? undefined : ivChip}
          onTogglePin={(sid) => setData((d) => ({ ...d, pinned: d.pinned.includes(sid) ? d.pinned.filter((x) => x !== sid) : [...d.pinned, sid] }))} />
      </Section>
    ),
    payroll: (
      <Section id="payroll" title="Consuntivo mensile cedolino" subtitle="Per persona e settimana: indennità CCNL, gettone integrativo e totale lordo."
        actions={<>
          <Button onClick={() => setExportFormat('csv')}>Esporta report (CSV)</Button>
          <Button variant="primary" onClick={() => setPayExport(true)}>Esporta per paghe (Excel)</Button>
        </>}>
        <Payroll people={data.people} assignments={data.assignments} params={data.params} nd={serverChecks?.nd}
          days={days} canCloseMonth={editable || role === 'hr'} onCloseMonth={closeMonth}
          interventions={ivs} ivChip={ivChip} showAmounts={(p) => amountsVisible(p, me)} />
      </Section>
    ),
    pnl: (
      <Section id="pnl" title="Dashboard economica & marginalità (P&L)" actions={<Button onClick={() => setExportFormat('csv')}>Esporta report (CSV)</Button>}>
        <Dashboard people={data.people} assignments={data.assignments} params={data.params} excludedDays={data.excludedDays} nd={serverChecks?.nd} />
      </Section>
    ),
    interventi: canReadPlan(role) ? (
      <Section id="interventi" title="Interventi in reperibilità" subtitle="Dichiarati dai turnisti; li approvano o rifiutano i Director del team della persona, i PM e lo space admin. Si pagano come straordinario CCNL, in aggiunta a indennità e gettone.">
        <InterventionsReview ivs={ivs} noInt={noInt} people={data.people} assignments={data.assignments} params={data.params} me={me} myPersonId={myPersonId} teams={teams} />
      </Section>
    ) : null,
    miei: myPersonId ? (
      <Section id="miei" title="I miei interventi">
        <MyInterventions data={mine.data} error={mine.error} reload={mine.reload} rules={canReadPlan(role) ? data.params : undefined} />
      </Section>
    ) : null,
    users: canManageUsers(role) ? (
      <Section id="users" title="Utenti e livelli di accesso" subtitle="Solo lo space admin vede questa pagina.">
        <UsersPage me={profile} people={data.people} flush={flush} />
      </Section>
    ) : null,
  }

  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        {/* Riga 1: nome, periodo, stato, utente */}
        <div className="border-b border-slate-100">
          <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2">
            <a href="#/doc" className="whitespace-nowrap font-semibold text-slate-900">Piano reperibilità <span className="text-blue-700">- ARM</span></a>
            <span className="hidden text-xs text-slate-500 sm:inline">{HORIZON_LABEL}</span>
            <div className="ml-auto flex items-center gap-3">
              <SyncBadge status={status} />
              <UserMenu profile={profile} onLogout={onLogout} onChangePassword={onChangePassword} />
            </div>
          </div>
        </div>
        {/* Riga 2: schede nell'ordine del lavoro; a destra Dati e Utenti. Su schermi stretti scorre in orizzontale. */}
        <div className="relative mx-auto max-w-[1500px]">
          <nav aria-label="Sezioni" className="flex items-stretch gap-5 overflow-x-auto px-4 text-sm">
            {NAV.filter(([id]) => allowed.includes(id) && id !== 'miei' && id !== 'users').map(([id, label]) => (
              <NavTab key={id} id={id} active={page === id}>
                {label}
                {id === 'interventi' && pendingCount > 0 && <span className="rounded-full bg-yellow-100 px-1.5 text-xs font-semibold text-yellow-900 ring-1 ring-yellow-300" title="Interventi in approvazione">{pendingCount}</span>}
              </NavTab>
            ))}
            {allowed.includes('miei') && (
              <>
                <span className="my-2.5 w-px shrink-0 bg-slate-200" aria-hidden />
                <NavTab id="miei" active={page === 'miei'}>
                  I miei interventi
                  {myTodo > 0 && <span className="rounded-full bg-orange-100 px-1.5 text-xs font-semibold text-orange-900 ring-1 ring-orange-300" title="Turni da compilare o interventi da correggere">{myTodo}</span>}
                </NavTab>
              </>
            )}
            <span className="ml-auto flex shrink-0 items-stretch gap-5">
              {editable && fullConfig && (
                <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu"
                  className={`inline-flex items-center gap-1 whitespace-nowrap border-b-2 px-0.5 py-2.5 font-medium ${menuOpen ? 'border-slate-300 text-slate-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
                  Dati
                  <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M5 8l5 5 5-5" /></svg>
                </button>
              )}
              {allowed.includes('users') && <NavTab id="users" active={page === 'users'}>Utenti</NavTab>}
            </span>
          </nav>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
              <div role="menu" className="absolute right-4 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                <MenuItem onClick={() => { setMenuOpen(false); setConfirmExport(true) }}>Esporta configurazione JSON</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); openImport() }}>Importa configurazione JSON</MenuItem>
              </div>
            </>
          )}
          {editable && fullConfig && <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />}
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
      {payExport && (
        <PayrollExportDialog busy={exporting} onClose={() => setPayExport(false)} onExport={(x, f) => void runPayrollExport(x, f)}
          input={{ people: data.people, assignments: data.assignments, params: data.params, nd: serverChecks?.nd, days, interventions: ivs, showAmounts: (p) => amountsVisible(p, me) }} />
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
function TeamPage({ verify, editable, role, myTeam, people, assignments, superAdmin, flush, onChange }: { verify: (pwd: string) => Promise<boolean>; editable: boolean; role: Role; myTeam: TeamId | null; people: Person[]; assignments: Assignments; superAdmin: boolean; flush: () => Promise<void>; onChange: (people: Person[], assignments?: Assignments) => void }) {
  const { revealed, toggle, dialog } = useRevealSensitive(verify)
  const teams = useTeams()
  // Solo lo space admin vede il tipo di account di ogni risorsa e può creare quello da Turnista
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
      <Section id="team" title="Anagrafica team" subtitle="Chi ha dato KO resta in anagrafica ma non compare nel calendario. La disponibilità guida l'auto-compilazione."
        actions={<>
          <Button onClick={toggle} aria-pressed={revealed} className={revealed ? 'ring-blue-300 bg-blue-50 text-blue-800' : ''}>
            <EyeIcon off={revealed} /> {revealed ? 'Oscura RAL e livello' : 'Mostra RAL e livello'}
          </Button>
        </>}>
        <fieldset disabled={!editable} className="min-w-0">
          <TeamPanel people={people} assignments={assignments} onChange={onChange} revealed={revealed}
            myTeam={myTeam} role={role} canSetTeam={editable && seesAllSalaries(role)} newTeam={defaultResourceTeam(teams, myTeam)}
            accounts={superAdmin && loaded ? accounts : undefined} onCreateAccount={superAdmin ? createAccount : undefined} />
        </fieldset>
      </Section>
      {dialog}
      {creds && <CredentialsDialog items={creds} onClose={() => setCreds(null)} />}
    </>
  )
}

/** Scheda della riga di navigazione: sottolineata quando è la pagina corrente. */
function NavTab({ id, active, children }: { id: string; active: boolean; children: React.ReactNode }) {
  return (
    <a href={`#/${id}`} aria-current={active ? 'page' : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 py-2.5 ${active ? 'border-blue-700 font-semibold text-blue-800' : 'border-transparent font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
      {children}
    </a>
  )
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, [string, string, string]> = {
    loading: ['Caricamento…', 'text-slate-500', 'bg-slate-300'],
    synced: ['Sincronizzato', 'text-emerald-700', 'bg-emerald-500'],
    saving: ['Salvataggio…', 'text-amber-700', 'bg-amber-500'],
    error: ['Errore di sincronizzazione', 'text-red-700', 'bg-red-600'],
  }
  const [label, cls, dot] = map[status]
  return (
    <span className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${cls}`} title={label}>
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </span>
  )
}
