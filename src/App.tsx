import { useEffect, useRef, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Dashboard } from './components/Dashboard'
import { Approach } from './components/Approach'
import { Login } from './components/Login'
import { ParamsPanel } from './components/ParamsPanel'
import { Payroll } from './components/Payroll'
import { Planner } from './components/Planner'
import { EyeIcon, PasswordDialog, TeamGate } from './components/TeamGate'
import { useRevealSensitive } from './components/useRevealSensitive'
import { TeamPanel } from './components/TeamPanel'
import { Button, Section } from './components/ui'
import { isAuthenticated, setAuthenticated } from './lib/auth'
import { download, fullReportCsv } from './lib/reports'
import { buildShiftsPdf, buildShiftsXlsx } from './lib/shiftsExport'
import { defaultData, normalizeWithReport, useAppData } from './lib/store'
import type { Assignments, Person } from './lib/types'

const NAV = [
  ['doc', 'Approccio'],
  ['params', 'A · Parametri'],
  ['team', 'B · Team'],
  ['planner', 'C · Calendario'],
  ['payroll', 'D · Consuntivo'],
  ['pnl', 'E · Conto economico'],
] as const
type PageId = (typeof NAV)[number][0]

const readPage = (): PageId => {
  const h = location.hash.replace(/^#\/?/, '')
  return (NAV.find(([id]) => id === h)?.[0] ?? 'doc')
}

/** Navigazione a pagine tramite hash (#/planner…): funziona anche aprendo il file in locale. */
function usePage() {
  const [page, setPage] = useState<PageId>(readPage)
  useEffect(() => {
    const on = () => { setPage(readPage()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return page
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated)
  if (!authed) return <Login onSuccess={() => { setAuthenticated(true); setAuthed(true) }} />
  return <ErrorBoundary><Main onLogout={() => { setAuthenticated(false); setAuthed(false) }} /></ErrorBoundary>
}

function Main({ onLogout }: { onLogout: () => void }) {
  const { data, setData, storageOk } = useAppData()
  const fileRef = useRef<HTMLInputElement>(null)
  const page = usePage()
  const [menuOpen, setMenuOpen] = useState(false)

  const [confirmExport, setConfirmExport] = useState(false)
  const doExportJson = () => download('reperibilita-q4-2026-config.json', JSON.stringify(data, null, 2), 'application/json')
  const exportCsv = () => download('reperibilita-q4-2026-report-hr-finance.csv', fullReportCsv(data.people, data.assignments, data.params, data.excludedDays), 'text/csv;charset=utf-8')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const exportShiftsPdf = async () => {
    setExporting(true)
    try {
      const buf = await buildShiftsPdf(data.people, data.assignments, data.excludedDays)
      download('turni-reperibilita-nov-dic-2026.pdf', buf, 'application/pdf')
    } catch (e) {
      setNotice({ tone: 'error', text: `Export PDF non riuscito: ${(e as Error).message}` })
    } finally {
      setExporting(false)
    }
  }
  const exportShiftsXlsx = async () => {
    setExporting(true)
    try {
      const buf = await buildShiftsXlsx(data.people, data.assignments, data.excludedDays)
      download('turni-reperibilita-nov-dic-2026.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (e) {
      setNotice({ tone: 'error', text: `Export Excel non riuscito: ${(e as Error).message}` })
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
      if (!confirm(`Importare ${next.people.length} risorse e ${Object.keys(next.assignments).length} turni? I dati attuali verranno sostituiti.`)) return
      setData(next)
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
  const reset = () => confirm('Ripristinare parametri, team placeholder e calendario vuoto? I dati attuali verranno sovrascritti.') && setData(defaultData())

  function openImport() { fileRef.current?.click() }

  const sections: Record<PageId, React.ReactNode> = {
    doc: (
      <Section id="doc" title="L'approccio" subtitle="Principi, funzionamento e sostenibilità del modello proposto.">
        <Approach params={data.params} people={data.people} />
      </Section>
    ),
    params: (
      <Section id="params" letter="A" title="Parametri economici & ricavi" subtitle="Ogni modifica ricalcola istantaneamente vincoli, consuntivo e marginalità.">
        <ParamsPanel params={data.params} onChange={(params) => setData((d) => ({ ...d, params }))} />
      </Section>
    ),
    team: (
      <TeamGate>
        {(lock) => <TeamPage lock={lock} people={data.people} assignments={data.assignments}
          onChange={(people, assignments) => setData((d) => ({ ...d, people, assignments: assignments ?? d.assignments }))} />}
      </TeamGate>
    ),
    planner: (
      <Section id="planner" letter="C" title="Pianificatore calendario Nov – Dic 2026" subtitle="Le persone che violerebbero un vincolo sono disabilitate nel menu; il pannello a destra spiega il motivo esatto."
        actions={<>
          <Button onClick={exportShiftsXlsx} disabled={exporting}>Esporta turni (Excel)</Button>
          <Button onClick={exportShiftsPdf} disabled={exporting}>Esporta turni (PDF)</Button>
        </>}>
        <Planner people={data.people} assignments={data.assignments} params={data.params} excludedDays={data.excludedDays} pinned={data.pinned}
          onChange={(assignments) => setData((d) => ({ ...d, assignments }))} onToggleDay={toggleDay}
          onTogglePin={(sid) => setData((d) => ({ ...d, pinned: d.pinned.includes(sid) ? d.pinned.filter((x) => x !== sid) : [...d.pinned, sid] }))} />
      </Section>
    ),
    payroll: (
      <Section id="payroll" letter="D" title="Consuntivo mensile cedolino" subtitle="Per persona e settimana: indennità CCNL, gettone di disponibilità e alternativa in ore."
        actions={<Button onClick={exportCsv}>Esporta report HR &amp; Finance (CSV)</Button>}>
        <Payroll people={data.people} assignments={data.assignments} params={data.params} />
      </Section>
    ),
    pnl: (
      <Section id="pnl" letter="E" title="Dashboard economica & marginalità (P&L)" actions={<Button onClick={exportCsv}>Esporta report HR &amp; Finance (CSV)</Button>}>
        <Dashboard people={data.people} assignments={data.assignments} params={data.params} excludedDays={data.excludedDays} />
      </Section>
    ),
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <a href="#/doc" className="font-semibold text-slate-900">Piano reperibilità <span className="text-blue-700">- ARM</span></a>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Sezioni">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#/${id}`} aria-current={page === id ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 font-medium ${page === id ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-slate-400 xl:inline">{storageOk ? '● Salvataggio automatico' : 'Salvataggio locale non disponibile: usa Esporta JSON'}</span>
            <div className="relative">
              <Button onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu">Dati ▾</Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div role="menu" className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <MenuItem onClick={() => { setMenuOpen(false); setConfirmExport(true) }}>Esporta configurazione JSON</MenuItem>
                    <MenuItem onClick={() => { setMenuOpen(false); openImport() }}>Importa configurazione JSON</MenuItem>
                    <MenuItem danger onClick={() => { setMenuOpen(false); reset() }}>Ripristina dati iniziali</MenuItem>
                  </div>
                </>
              )}
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
            </div>
            <Button variant="ghost" onClick={onLogout}>Esci</Button>
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
        {sections[page]}
      </main>
      {confirmExport && (
        <PasswordDialog
          title="Esporta configurazione"
          description="Il file contiene l'anagrafica completa: reinserisci la password dell'anagrafica per esportarlo."
          onSuccess={() => { setConfirmExport(false); doExportJson() }}
          onClose={() => setConfirmExport(false)}
        />
      )}
    </div>
  )
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button role="menuitem" type="button" onClick={onClick}
      className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 ${danger ? 'text-red-700' : 'text-slate-700'}`}>{children}</button>
  )
}

/** Pagina anagrafica: RAL e livello oscurati finché non si reinserisce la password (lo stato si azzera cambiando pagina). */
function TeamPage({ lock, people, assignments, onChange }: { lock: () => void; people: Person[]; assignments: Assignments; onChange: (people: Person[], assignments?: Assignments) => void }) {
  const { revealed, toggle, dialog } = useRevealSensitive()
  return (
    <>
      <Section id="team" letter="B" title="Anagrafica team" subtitle="Chi ha dato KO resta in anagrafica ma non compare nel calendario. La disponibilità guida l'auto-compilazione."
        actions={<>
          <Button onClick={toggle} aria-pressed={revealed} className={revealed ? 'ring-blue-300 bg-blue-50 text-blue-800' : ''}>
            <EyeIcon off={revealed} /> {revealed ? 'Oscura RAL e livello' : 'Mostra RAL e livello'}
          </Button>
          <Button variant="ghost" onClick={lock}>Blocca anagrafica</Button>
        </>}>
        <TeamPanel people={people} assignments={assignments} onChange={onChange} revealed={revealed} />
      </Section>
      {dialog}
    </>
  )
}
