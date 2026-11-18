import { useRef, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Dashboard } from './components/Dashboard'
import { HrDoc } from './components/HrDoc'
import { Login } from './components/Login'
import { ParamsPanel } from './components/ParamsPanel'
import { Payroll } from './components/Payroll'
import { Planner } from './components/Planner'
import { TeamPanel } from './components/TeamPanel'
import { Button, Section } from './components/ui'
import { isAuthenticated, setAuthenticated } from './lib/auth'
import { download, fullReportCsv } from './lib/reports'
import { buildShiftsXlsx } from './lib/shiftsExport'
import { defaultData, normalizeWithReport, useAppData } from './lib/store'

const NAV = [
  ['doc', 'Documento HR'],
  ['params', 'A · Parametri'],
  ['team', 'B · Team'],
  ['planner', 'C · Calendario'],
  ['payroll', 'D · Consuntivo'],
  ['pnl', 'D · Conto economico'],
] as const

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated)
  if (!authed) return <Login onSuccess={() => { setAuthenticated(true); setAuthed(true) }} />
  return <ErrorBoundary><Main onLogout={() => { setAuthenticated(false); setAuthed(false) }} /></ErrorBoundary>
}

function Main({ onLogout }: { onLogout: () => void }) {
  const { data, setData, storageOk } = useAppData()
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = () => download('reperibilita-q4-2026-config.json', JSON.stringify(data, null, 2), 'application/json')
  const exportCsv = () => download('reperibilita-q4-2026-report-hr-finance.csv', fullReportCsv(data.people, data.assignments, data.params, data.excludedDays), 'text/csv;charset=utf-8')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)
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

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <div className="font-semibold text-slate-900">Piano Reperibilità <span className="text-blue-700">Q4 2026</span></div>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900">{label}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-slate-400 md:inline">{storageOk ? '● Salvataggio automatico in LocalStorage' : 'Salvataggio locale non disponibile: usa Esporta JSON'}</span>
            <Button variant="ghost" onClick={onLogout}>Esci</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Specifica progetto &amp; documento HR</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Piano Reperibilità Q4 2026 (Novembre – Dicembre)</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Documentazione HR, simulatore operativo con validazione dei vincoli in tempo reale, consuntivo cedolino e conto economico.</p>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={exportCsv}>Esporta report HR &amp; Finance (CSV)</Button>
            <Button onClick={exportShiftsXlsx} disabled={exporting}>{exporting ? 'Preparazione…' : 'Esporta turni (Excel)'}</Button>
            <Button onClick={exportJson}>Esporta configurazione JSON</Button>
            <Button onClick={() => fileRef.current?.click()}>Importa configurazione JSON</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
            <Button variant="ghost" onClick={reset}>Ripristina dati iniziali</Button>
          </div>
          {notice && (
            <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-3 flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${notice.tone === 'error' ? 'bg-red-50 text-red-800' : notice.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
              <span className="flex-1">{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)} className="text-xs font-medium opacity-70 hover:opacity-100" aria-label="Chiudi messaggio">Chiudi</button>
            </div>
          )}
        </div>

        <Section id="doc" title="Documentazione formale per Risorse Umane" subtitle="Abstract sempre visibile; approfondimenti normativi, matematici e legali espandibili.">
          <HrDoc params={data.params} people={data.people} />
        </Section>

        <Section id="params" letter="A" title="Parametri economici & ricavi" subtitle="Ogni modifica ricalcola istantaneamente vincoli, consuntivo e marginalità.">
          <ParamsPanel params={data.params} onChange={(params) => setData((d) => ({ ...d, params }))} />
        </Section>

        <Section id="team" letter="B" title="Anagrafica team" subtitle="Le risorse escluse non compaiono nel calendario ma conservano i dati anagrafici.">
          <TeamPanel people={data.people} assignments={data.assignments} onChange={(people, assignments) => setData((d) => ({ ...d, people, assignments: assignments ?? d.assignments }))} />
        </Section>

        <Section id="planner" letter="C" title="Pianificatore calendario Nov – Dic 2026" subtitle="Le persone che violerebbero un vincolo sono disabilitate nel menu; il pannello a destra spiega il motivo esatto." actions={<Button onClick={exportShiftsXlsx} disabled={exporting}>Esporta turni (Excel)</Button>}>
          <Planner people={data.people} assignments={data.assignments} params={data.params} excludedDays={data.excludedDays}
            onChange={(assignments) => setData((d) => ({ ...d, assignments }))} onToggleDay={toggleDay} />
        </Section>

        <div className="print-break" />
        <Section id="payroll" letter="D" title="Consuntivo mensile cedolino" subtitle="Per persona e settimana: indennità CCNL, integrazione, ore di compensazione e giorno di imputazione.">
          <Payroll people={data.people} assignments={data.assignments} params={data.params} />
        </Section>

        <Section id="pnl" letter="D" title="Dashboard economica & marginalità (P&L)" actions={<Button onClick={exportCsv}>Esporta CSV</Button>}>
          <Dashboard people={data.people} assignments={data.assignments} params={data.params} excludedDays={data.excludedDays} />
        </Section>
      </main>
    </div>
  )
}
