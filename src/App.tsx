import { useEffect, useRef, useState } from 'react'
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
import { defaultData, normalize, useAppData } from './lib/store'

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
  return <Main onLogout={() => { setAuthenticated(false); setAuthed(false) }} />
}

function Main({ onLogout }: { onLogout: () => void }) {
  const { data, setData, storageOk } = useAppData()
  const fileRef = useRef<HTMLInputElement>(null)

  // In stampa/PDF tutte le sezioni collassabili vengono espanse e poi ripristinate.
  useEffect(() => {
    let closed: HTMLDetailsElement[] = []
    const before = () => {
      closed = [...document.querySelectorAll('details:not([open])')] as HTMLDetailsElement[]
      closed.forEach((d) => (d.open = true))
    }
    const after = () => closed.forEach((d) => (d.open = false))
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after) }
  }, [])

  const exportJson = () => download('reperibilita-q4-2026-config.json', JSON.stringify(data, null, 2), 'application/json')
  const exportCsv = () => download('reperibilita-q4-2026-report-hr-finance.csv', fullReportCsv(data.people, data.assignments, data.params), 'text/csv;charset=utf-8')
  const importJson = async (f?: File) => {
    if (!f) return
    try {
      setData(normalize(JSON.parse(await f.text())))
    } catch (e) {
      alert(`Import non riuscito: ${(e as Error).message}`)
    }
    if (fileRef.current) fileRef.current.value = ''
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
            <Button onClick={() => window.print()}>Stampa / Salva PDF</Button>
            <Button onClick={exportJson}>Esporta configurazione JSON</Button>
            <Button onClick={() => fileRef.current?.click()}>Importa configurazione JSON</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
            <Button variant="ghost" onClick={reset}>Ripristina dati iniziali</Button>
          </div>
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

        <Section id="planner" letter="C" title="Pianificatore calendario Nov – Dic 2026" subtitle="Le persone che violerebbero un vincolo sono disabilitate nel menu; il pannello a destra spiega il motivo esatto.">
          <Planner people={data.people} assignments={data.assignments} params={data.params} onChange={(assignments) => setData((d) => ({ ...d, assignments }))} />
        </Section>

        <div className="print-break" />
        <Section id="payroll" letter="D" title="Consuntivo mensile cedolino" subtitle="Per persona e settimana: indennità CCNL, integrazione, ore di compensazione e giorno di imputazione.">
          <Payroll people={data.people} assignments={data.assignments} params={data.params} />
        </Section>

        <Section id="pnl" letter="D" title="Dashboard economica & marginalità (P&L)" actions={<><Button onClick={exportCsv}>Esporta CSV</Button><Button onClick={() => window.print()}>Stampa PDF</Button></>}>
          <Dashboard people={data.people} assignments={data.assignments} params={data.params} />
        </Section>
      </main>
    </div>
  )
}
