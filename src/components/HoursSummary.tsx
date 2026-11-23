import { useEffect, useMemo, useRef, useState } from 'react'
import { daysInRange, fmtDay, HORIZON_END, HORIZON_START, monthKey } from '../lib/calendar'
import { dayState, romeNow, romeToday, type DayStatusMap } from '../lib/dayStatus'
import { validateRange } from '../lib/exportRange'
import { buildHoursPdf, buildHoursReport, buildHoursXlsx, hoursFileName, periodText, rangePeriod, rateHours, SHIFT_CAT_LABEL, SHIFT_CATS, zipFiles, type HoursReport } from '../lib/hoursReport'
import type { Intervention } from '../lib/interventions'
import { BAND_LABEL, BANDS, fmtMinutes, RATE_KEYS, rateLabel, rateOf, type RateKey } from '../lib/overtime'
import { payPeriods, type PayPeriod } from '../lib/payrollExport'
import { download } from '../lib/reports'
import { teamLabel, type TeamId } from '../lib/teams'
import { useTeams } from '../lib/useTeams'
import type { Assignments, Params, Person } from '../lib/types'
import { Button, Collapsible } from './ui'

interface Props {
  people: Person[]
  assignments: Assignments
  params: Params
  days: DayStatusMap
  interventions: Intervention[]
  noInt: ReadonlySet<string>
  /** Team proposto all'apertura (il Director parte dal proprio); null = tutti */
  defaultTeam?: TeamId | null
  /** Riepilogo limitato a un team (Director non abilitato a tutti i team); null = nessun team, undefined = libero */
  lockedTeam?: TeamId | null
  /** Può consuntivare un mese intero (Space admin, Governance, Director, HR) */
  canCloseMonth?: boolean
  onCloseMonth?: (month: string) => Promise<number>
}

const dur = (m: number) => (m > 0 ? fmtMinutes(m) : '–')
const th = 'py-2 pr-3 font-medium'
/**
 * Intestazione (e totali) sempre visibili: su schermi larghi restano fissi sotto la barra in alto mentre
 * scorre la pagina; su schermi stretti la tabella scorre dentro il suo riquadro (anche in orizzontale).
 */
const scrollBox = 'max-h-[calc(100vh-var(--app-header-h,57px)-2rem)] overflow-auto xl:max-h-none xl:overflow-visible'

const Chevron = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 shrink-0 text-slate-500 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 8l5 5 5-5" /></svg>
)

/** Menu a tendina con la stessa altezza e la stessa freccia degli altri controlli. */
function SelectBox({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-lg bg-white pl-3 pr-9 text-sm text-slate-800 ring-1 ring-inset ring-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600">
        {children}
      </select>
      <Chevron className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
    </label>
  )
}

/** Filtro per persona: caselle di spunta; nessuna scelta = tutte. */
function PeopleFilter({ options, selected, onChange }: { options: Person[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const teams = useTeams()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [open])
  const names = new Map(options.map((p) => [p.id, p.name]))
  const label = !selected.length ? 'Tutte le persone' : selected.length === 1 ? names.get(selected[0]) ?? '1 persona' : `${selected.length} persone`
  const shown = options.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div ref={box} className="relative" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
        className={`inline-flex h-9 items-center gap-3 rounded-lg pl-3 pr-3 text-sm ring-1 ring-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${selected.length ? 'bg-blue-50 text-blue-900 ring-blue-300' : 'bg-white text-slate-800 ring-slate-300'}`}>
        {label}
        <Chevron />
      </button>
      {open && (
        <div role="dialog" aria-label="Scegli le persone" className="absolute left-0 z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome" aria-label="Cerca per nome"
            className="w-full rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
          <div className="mt-2 flex items-center justify-between px-1 text-xs">
            <span className="text-slate-500">{selected.length ? `${selected.length} su ${options.length}` : `Tutte (${options.length})`}</span>
            <span className="flex gap-3">
              <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => onChange(shown.map((p) => p.id))}>Seleziona {q ? 'trovate' : 'tutte'}</button>
              <button type="button" className="font-medium text-slate-600 hover:underline disabled:opacity-40" disabled={!selected.length} onClick={() => onChange([])}>Azzera</button>
            </span>
          </div>
          <ul className="mt-1.5 max-h-72 overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-blue-700" />
                  <span className="min-w-0 flex-1 truncate text-slate-900">{p.name}</span>
                  <span className="text-xs text-slate-400">{teamLabel(teams, p.team)}</span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-1.5 py-2 text-sm text-slate-500">Nessuna persona{q ? ' con questo nome' : ' nel periodo'}.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Intestazione di una fascia CCNL dello straordinario, con la sua maggiorazione. */
function RateHead({ k, params }: { k: RateKey; params: Params }) {
  return (
    <th className={`${th} text-right text-balance`} title="Ore riconosciute nella fascia (minimo, tolleranza e arrotondamento applicati)">
      {rateLabel(k, params)}
      <span className="block font-normal text-slate-500">{rateHours(k, params)}</span>
      <span className="block font-normal text-slate-400">+{Math.round(rateOf(k, params) * 1000) / 10}%</span>
    </th>
  )
}

/** Turni di una cella: effettuati e, nel previsionale, "+N" programmati. */
function Shifts({ done, planned, forecast, strong = false }: { done: number; planned: number; forecast: boolean; strong?: boolean }) {
  if (!done && !planned) return <span className="text-slate-300">–</span>
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className={done ? (strong ? 'font-semibold text-slate-900' : 'text-slate-900') : 'text-slate-400'}>{done}</span>
      {forecast && planned > 0 && <span className="rounded bg-sky-50 px-1 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-200" title={`${planned} ${planned === 1 ? 'programmato' : 'programmati'}, non ancora ${planned === 1 ? 'erogato' : 'erogati'}`}>+{planned}</span>}
    </span>
  )
}

/**
 * Riepilogo per le paghe, senza importi: per persona i turni per categoria (giorno di riferimento =
 * giorno di inizio) e gli interventi approvati in ore, per fascia. Da qui si consuntiva il mese e si
 * esporta il file per l'ufficio paghe.
 */
export function HoursSummary({ people, assignments, params, days, interventions, noInt, defaultTeam = null, lockedTeam, canCloseMonth = false, onCloseMonth }: Props) {
  const teams = useTeams()
  const { months, weeks } = useMemo(() => payPeriods(), [])
  const today = romeToday()
  const [kind, setKind] = useState<'month' | 'week' | 'range'>('month')
  const [monthSel, setMonthSel] = useState(() => (months.find((m) => m.from <= today && today <= m.to) ?? months[0]).key)
  const [weekSel, setWeekSel] = useState(() => (weeks.find((w) => w.from <= today && today <= w.to) ?? weeks[0]).key)
  const thisMonth = months.find((m) => m.from <= today && today <= m.to) ?? months[0]
  const [rangeFrom, setRangeFrom] = useState(thisMonth.from)
  const [rangeTo, setRangeTo] = useState(thisMonth.to)
  const rangeError = kind === 'range' ? validateRange({ from: rangeFrom, to: rangeTo }) : undefined
  const [teamSel, setTeam] = useState<TeamId | null>(defaultTeam)
  const team = lockedTeam !== undefined ? lockedTeam : teamSel
  /** Persone scelte con il filtro; vuoto = tutte */
  const [selected, setSelected] = useState<string[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  /** Previsionale: anche i turni programmati nel calendario e non ancora erogati */
  const [forecast, setForecast] = useState(false)
  const [busy, setBusy] = useState<'export' | 'close' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const period: PayPeriod = kind === 'month' ? months.find((m) => m.key === monthSel)!
    : kind === 'week' ? weeks.find((w) => w.key === weekSel)!
    : rangeError ? thisMonth : rangePeriod(rangeFrom, rangeTo)
  const input = useMemo(() => ({ people, assignments, params, days, interventions, noInt, now: romeNow() }), [people, assignments, params, days, interventions, noInt])
  const base = useMemo(() => buildHoursReport(input, period, team, { forecast }), [input, period, team, forecast])
  const report = useMemo(() => (selected.length ? buildHoursReport(input, period, team, { forecast, persons: selected }) : base), [base, input, period, team, forecast, selected])
  // nel filtro: le persone con reperibilità o interventi nel periodo, più quelle già scelte
  const options = useMemo(() => {
    const ids = new Set([...base.people.map((r) => r.person.id), ...selected])
    return people.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'it'))
  }, [base, people, selected])
  const rows = report.people
  const empty = !!rangeError || (!report.shifts.length && !report.interventions.length)

  /** Giorni erogati del mese (di calendario) ancora da consuntivare. */
  const toClose = kind === 'month' ? daysInRange().filter((d) => monthKey(d) === period.key && dayState(days, d) === 'erogato').length : 0
  const closeMonth = async () => {
    if (!onCloseMonth) return
    if (!confirm(`Consuntivare ${period.label}? Su tutti i giorni erogati del mese si chiude l'inserimento di nuovi interventi; quelli già segnalati si possono ancora approvare o rifiutare.`)) return
    setBusy('close')
    setNotice(null)
    try {
      const n = await onCloseMonth(period.key)
      setNotice({ tone: 'ok', text: n ? `${period.label}: ${n} ${n === 1 ? 'giorno consuntivato' : 'giorni consuntivati'}.` : `${period.label}: nessun giorno da consuntivare tra quelli su cui hai il permesso.` })
    } catch (e) {
      setNotice({ tone: 'error', text: `Consuntivazione non riuscita: ${(e as Error).message}` })
    } finally {
      setBusy(null)
    }
  }
  /** Un file per tutti, oppure un archivio ZIP con un file per turnista (stesso schema e dettaglio). */
  const runExport = async (format: 'xlsx' | 'pdf', split: boolean) => {
    setBusy('export')
    setNotice(null)
    const build = (r: HoursReport) => (format === 'xlsx' ? buildHoursXlsx(r, teams, params) : buildHoursPdf(r, teams, params))
    const now = new Date()
    try {
      if (!split) {
        download(hoursFileName(period, now, forecast, format), await build(report), format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf')
      } else {
        const files: { name: string; data: ArrayBuffer }[] = []
        for (const r of report.people) {
          const one = buildHoursReport(input, period, team, { forecast, person: r.person.id })
          files.push({ name: hoursFileName(period, now, forecast, format, r.person.name), data: await build(one) })
        }
        download(hoursFileName(period, now, forecast, 'zip'), await zipFiles(files), 'application/zip')
      }
      setExportOpen(false)
    } catch (e) {
      setNotice({ tone: 'error', text: `Export non riuscito: ${(e as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0)
  if (lockedTeam === null) return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Non hai un team assegnato: il Riepilogo mostra le persone del tuo team. Chiedi allo Space admin di assegnartelo.</p>
  const seg = (on: boolean) => `inline-flex h-8 items-center rounded-md px-3 font-medium ${on ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`
  const dateInput = 'h-9 rounded-lg bg-white px-2.5 text-sm text-slate-800 ring-1 ring-inset ring-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex h-9 items-center rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Periodo">
          {([['month', 'Mese'], ['week', 'Settimana'], ['range', 'Intervallo']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={seg(kind === k)}>{l}</button>
          ))}
        </div>
        {kind === 'month' ? (
          <SelectBox label="Mese" value={monthSel} onChange={setMonthSel}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </SelectBox>
        ) : kind === 'week' ? (
          <SelectBox label="Settimana" value={weekSel} onChange={setWeekSel}>
            {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </SelectBox>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
            Dal <input type="date" aria-label="Dal" value={rangeFrom} min={HORIZON_START} max={HORIZON_END} onChange={(e) => setRangeFrom(e.target.value)} className={dateInput} />
            al <input type="date" aria-label="Al" value={rangeTo} min={HORIZON_START} max={HORIZON_END} onChange={(e) => setRangeTo(e.target.value)} className={dateInput} />
          </span>
        )}
        <div className="inline-flex h-9 items-center rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Turni da mostrare">
          {([[false, 'Solo effettuati'], [true, 'Anche programmati']] as const).map(([k, l]) => (
            <button key={l} type="button" role="radio" aria-checked={forecast === k} onClick={() => setForecast(k)}
              title={k ? 'Previsionale: anche i turni di reperibilità del calendario non ancora erogati; gli interventi restano solo quelli effettuati' : 'Solo i turni di reperibilità dei giorni erogati'}
              className={seg(forecast === k)}>{l}</button>
          ))}
        </div>
        {lockedTeam !== undefined ? (
          <span className="inline-flex h-9 items-center rounded-lg bg-slate-100 px-3 text-sm text-slate-700" title="Nel Riepilogo vedi le persone del tuo team">Team {lockedTeam ? teamLabel(teams, lockedTeam) : '—'}</span>
        ) : (
          <SelectBox label="Team" value={team ?? ''} onChange={(v) => { setTeam(v || null); setSelected([]) }}>
            <option value="">Tutti i team</option>
            {teams.list.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </SelectBox>
        )}
        <PeopleFilter options={options} selected={selected} onChange={setSelected} />
        <div className="ml-auto flex flex-wrap gap-2">
          {canCloseMonth && toClose > 0 && (
            <Button className="h-9" disabled={busy !== null} onClick={() => void closeMonth()} title="Chiude l'inserimento degli interventi su tutti i giorni erogati del mese">
              {busy === 'close' ? 'Consuntivazione…' : `Consuntiva il mese (${toClose} ${toClose === 1 ? 'giorno erogato' : 'giorni erogati'})`}
            </Button>
          )}
          <Button variant="primary" className="h-9" disabled={busy !== null || empty} onClick={() => setExportOpen(true)}>{forecast ? 'Esporta previsionale…' : 'Esporta per paghe…'}</Button>
        </div>
      </div>

      {rangeError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{rangeError}</p>}
      {!rangeError && <p className="text-sm font-medium text-slate-700">Periodo: {periodText(period)}</p>}
      {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${notice.tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{notice.text}</p>}
      {report.notes.map((n) => <p key={n} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{n}</p>)}
      <p className="text-sm text-slate-600">
        {forecast
          ? <>Previsionale: turni di reperibilità <strong>effettuati</strong> (giorni erogati) e, con <span className="rounded bg-sky-50 px-1 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-200">+N</span>, quelli <strong>programmati</strong> nel calendario e non ancora erogati. Gli interventi sono solo quelli effettuati e approvati.</>
          : <>Solo turni di reperibilità dei giorni <strong>erogati</strong> e interventi <strong>approvati</strong>.</>} Il turno conta nel giorno in cui <strong>inizia</strong>: la notte di domenica, dalle 18:00 alle 09:00 di lunedì, è "domenica/festivo notturno".
        Le ore riconosciute di ogni intervento (minimo, tolleranza e arrotondamento applicati) sono divise nelle fasce CCNL secondo il giorno e l'ora di ogni minuto; i minuti aggiunti o tolti dall'arrotondamento vanno nella fascia in cui l'intervento finisce. Sotto la tabella e nei file (Excel o PDF) c'è il dettaglio dei turni di reperibilità e degli interventi.
      </p>

      {empty ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Nel periodo non ci sono ancora turni {forecast ? 'nel calendario' : 'erogati né interventi approvati'}{team ? ` per il team ${teamLabel(teams, team)}` : ''}{selected.length ? ' per le persone scelte' : ''}.</p>
      ) : (
        <div className={`${scrollBox} rounded-xl border border-slate-200 bg-white`}>
          <table className="num w-full min-w-[1250px] text-sm xl:min-w-0">
            <thead className="sticky top-0 z-20 bg-slate-50 xl:top-[var(--app-header-h,57px)] shadow-[inset_0_-1px_0_#e2e8f0] [&_th]:bg-slate-50">
              <tr className="text-left text-xs text-slate-500">
                <th className={`${th} sticky left-0 z-30 bg-slate-50 pl-4`} rowSpan={2}>Persona</th>
                <th className="pt-2 pr-3 text-center font-semibold text-slate-700" colSpan={SHIFT_CATS.length + 1}>{forecast ? 'Turni di reperibilità effettuati + programmati' : 'Turni di reperibilità'}</th>
                <th className="pt-2 pr-3 text-center font-semibold text-slate-700" colSpan={RATE_KEYS.length + 3}>Interventi approvati · ore riconosciute per fascia CCNL</th>
              </tr>
              <tr className="text-left text-xs text-slate-500">
                {SHIFT_CATS.map((c) => <th key={c} className={`${th} text-right`}>{SHIFT_CAT_LABEL[c]}</th>)}
                <th className={`${th} text-right`}>Totale</th>
                <th className={`${th} text-right`}>N.</th>
                <th className={`${th} text-right`} title="Durata reale degli interventi">Durata effettiva</th>
                {RATE_KEYS.map((k) => <RateHead key={k} k={k} params={params} />)}
                <th className={`${th} text-right`} title="Minimo, tolleranza e arrotondamento applicati">Ore riconosciute</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.person.id} className="border-b border-slate-100">
                  <td className="sticky left-0 z-10 bg-white py-2 pl-4 pr-3"><div className="whitespace-nowrap font-medium text-slate-900">{r.person.name}</div><div className="text-xs text-slate-500">{teamLabel(teams, r.person.team)}</div></td>
                  {SHIFT_CATS.map((c) => <td key={c} className="whitespace-nowrap py-2 pr-3 text-right"><Shifts done={r.shifts[c]} planned={r.planned[c]} forecast={forecast} /></td>)}
                  <td className="whitespace-nowrap py-2 pr-3 text-right"><Shifts done={r.totalShifts} planned={r.totalPlanned} forecast={forecast} strong /></td>
                  <td className={`whitespace-nowrap py-2 pr-3 text-right ${r.interventions ? 'text-slate-900' : 'text-slate-300'}`}>{r.interventions || '–'}</td>
                  <td className={`whitespace-nowrap py-2 pr-3 text-right ${r.minutes ? 'text-slate-500' : 'text-slate-300'}`}>{dur(r.minutes)}</td>
                  {RATE_KEYS.map((k) => <td key={k} className={`whitespace-nowrap py-2 pr-3 text-right ${r.byRate[k] ? 'text-slate-900' : 'text-slate-300'}`}>{dur(r.byRate[k])}</td>)}
                  <td className={`whitespace-nowrap py-2 pr-3 text-right ${r.hours ? 'font-semibold text-slate-900' : 'text-slate-300'}`}>{r.hours ? `${r.hours} h` : '–'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-slate-50 shadow-[inset_0_1px_0_#e2e8f0]">
              <tr className="bg-slate-50 font-semibold text-slate-900">
                <td className="sticky left-0 z-10 bg-slate-50 py-2 pl-4 pr-3">Totale</td>
                {SHIFT_CATS.map((c) => <td key={c} className="whitespace-nowrap py-2 pr-3 text-right"><Shifts done={sum((r) => r.shifts[c])} planned={sum((r) => r.planned[c])} forecast={forecast} strong /></td>)}
                <td className="whitespace-nowrap py-2 pr-3 text-right"><Shifts done={sum((r) => r.totalShifts)} planned={sum((r) => r.totalPlanned)} forecast={forecast} strong /></td>
                <td className="whitespace-nowrap py-2 pr-3 text-right">{report.interventions.length}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right font-normal text-slate-500">{dur(sum((r) => r.minutes))}</td>
                {RATE_KEYS.map((k) => <td key={k} className="whitespace-nowrap py-2 pr-3 text-right">{dur(sum((r) => r.byRate[k]))}</td>)}
                <td className="whitespace-nowrap py-2 pr-3 text-right">{sum((r) => r.hours)} h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!empty && report.shifts.length > 0 && (
        <Collapsible title={<span className="font-medium">Dettaglio dei turni di reperibilità ({report.shifts.length}{forecast ? `, di cui ${report.shifts.filter((x) => x.state === 'programmato').length} programmati` : ''})</span>}>
          <div className={scrollBox}>
            <table className="num w-full min-w-[900px] text-sm xl:min-w-0">
              <thead className="sticky top-0 z-10 bg-white xl:top-[var(--app-header-h,57px)] shadow-[inset_0_-1px_0_#e2e8f0] [&_th]:bg-white">
                <tr className="text-left text-xs text-slate-500">
                  <th className={th}>Persona</th><th className={th}>Giorno di riferimento</th><th className={th} title="Il tipo di reperibilità decide indennità CCNL e gettone">Tipo di gettone</th>
                  <th className={th}>Orario</th><th className={th}>Stato</th><th className={`${th} text-right`}>Interventi approvati</th><th className={`${th} text-right`}>Ore riconosciute</th>
                </tr>
              </thead>
              <tbody>
                {[...report.shifts].sort((a, b) => a.person.name.localeCompare(b.person.name, 'it') || a.slot.localeCompare(b.slot)).map((x) => (
                  <tr key={`${x.slot}|${x.person.id}`} className={`border-b border-slate-100 ${x.state === 'programmato' ? 'text-sky-800' : ''}`}>
                    <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-slate-900">{x.person.name}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3">{fmtDay(x.date)}</td>
                    <td className="py-1.5 pr-3">{SHIFT_CAT_LABEL[x.cat]}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">{x.start.slice(11, 16)} → {x.end.slice(0, 10) === x.start.slice(0, 10) ? '' : `${fmtDay(x.end.slice(0, 10))} `}{x.end.slice(11, 16)}</td>
                    <td className="py-1.5 pr-3">{x.state === 'programmato'
                      ? <span className="rounded bg-sky-50 px-1.5 py-px text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-200">Programmata</span>
                      : <span className={`rounded px-1.5 py-px text-xs font-medium ring-1 ring-inset ${x.state === 'consuntivato' ? 'bg-indigo-50 text-indigo-800 ring-indigo-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'}`}>{x.state === 'consuntivato' ? 'Consuntivata' : 'Erogata'}</span>}</td>
                    <td className={`whitespace-nowrap py-1.5 pr-3 text-right ${x.ivCount ? '' : 'text-slate-300'}`}>{x.ivCount || '–'}</td>
                    <td className={`whitespace-nowrap py-1.5 pr-3 text-right ${x.ivHours ? 'font-semibold' : 'text-slate-300'}`}>{x.ivHours ? `${x.ivHours} h` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}

      {!empty && report.interventions.length > 0 && (
        <Collapsible title={<span className="font-medium">Dettaglio degli interventi approvati ({report.interventions.length})</span>}>
          <div className={scrollBox}>
            <table className="num w-full min-w-[1100px] text-sm xl:min-w-0">
              <thead className="sticky top-0 z-10 bg-white xl:top-[var(--app-header-h,57px)] shadow-[inset_0_-1px_0_#e2e8f0] [&_th]:bg-white">
                <tr className="text-left text-xs text-slate-500">
                  <th className={th}>Persona</th><th className={th}>Turno</th><th className={th}>Orario e durata effettiva per fascia</th><th className={`${th} text-right`}>Durata</th>
                  {RATE_KEYS.map((k) => <RateHead key={k} k={k} params={params} />)}
                  <th className={`${th} text-right`}>Ore riconosciute</th>
                </tr>
              </thead>
              <tbody>
                {report.interventions.map((o) => (
                  <tr key={o.iv.id} className="border-b border-slate-100 align-top">
                    <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-slate-900">{o.person.name}</td>
                    <td className="py-1.5 pr-3 text-slate-700">{fmtDay(o.date)} · {SHIFT_CAT_LABEL[o.cat]}</td>
                    <td className="py-1.5 pr-3 text-slate-700">
                      <div className="whitespace-nowrap">{fmtDay(o.iv.start.slice(0, 10))} {o.iv.start.slice(11, 16)} → {o.iv.end.slice(0, 10) === o.iv.start.slice(0, 10) ? '' : `${fmtDay(o.iv.end.slice(0, 10))} `}{o.iv.end.slice(11, 16)}</div>
                      <div className="text-xs text-slate-500">{BANDS.filter((b) => o.effective[b] > 0).map((b) => `${fmtMinutes(o.effective[b])} ${BAND_LABEL[b].toLowerCase()}`).join(' · ')}</div>
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-right text-slate-500">{fmtMinutes(o.minutes)}</td>
                    {RATE_KEYS.map((k) => <td key={k} className={`whitespace-nowrap py-1.5 pr-3 text-right ${o.byRate[k] ? 'text-slate-900' : 'text-slate-300'}`}>{dur(o.byRate[k])}</td>)}
                    <td className="whitespace-nowrap py-1.5 pr-3 text-right font-semibold">{o.hours} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}
      {exportOpen && (
        <ExportHoursDialog period={periodText(period)} forecast={forecast} people={report.people.length} busy={busy === 'export'}
          onClose={() => setExportOpen(false)} onExport={(f, split) => void runExport(f, split)} />
      )}
    </div>
  )
}

/** Export del riepilogo: Excel o PDF, un file unico oppure uno per turnista (archivio ZIP). */
function ExportHoursDialog({ period, forecast, people, busy, onClose, onExport }: { period: string; forecast: boolean; people: number; busy: boolean; onClose: () => void; onExport: (format: 'xlsx' | 'pdf', split: boolean) => void }) {
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx')
  const [split, setSplit] = useState(false)
  const choice = (active: boolean) => `flex-1 rounded-lg px-3 py-2 text-left text-sm ring-1 ring-inset ${active ? 'bg-blue-50 ring-blue-300' : 'bg-white ring-slate-200 hover:bg-slate-50'}`
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="hx-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form onSubmit={(e) => { e.preventDefault(); onExport(format, split) }} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="hx-title" className="text-lg font-semibold text-slate-900">{forecast ? 'Esporta il previsionale' : "Esporta per l'ufficio paghe"}</h3>
        <p className="mt-1 text-sm text-slate-600">Periodo: <strong>{period}</strong>. {forecast ? 'Turni di reperibilità effettuati e programmati, interventi solo effettuati e approvati.' : 'Turni di reperibilità effettuati (giorni erogati) e interventi approvati.'} Nessun importo.</p>
        <div className="mt-4 text-xs font-medium text-slate-600">Formato</div>
        <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Formato">
          <button type="button" role="radio" aria-checked={format === 'xlsx'} onClick={() => setFormat('xlsx')} className={choice(format === 'xlsx')}>
            <strong className="block text-slate-900">Excel</strong><span className="text-xs text-slate-600">Riepilogo per persona, Turni di reperibilità, Interventi.</span>
          </button>
          <button type="button" role="radio" aria-checked={format === 'pdf'} onClick={() => setFormat('pdf')} className={choice(format === 'pdf')}>
            <strong className="block text-slate-900">PDF</strong><span className="text-xs text-slate-600">Riepilogo e, per ogni persona, turni di reperibilità e interventi.</span>
          </button>
        </div>
        <div className="mt-4 text-xs font-medium text-slate-600">File</div>
        <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="File">
          <button type="button" role="radio" aria-checked={!split} onClick={() => setSplit(false)} className={choice(!split)}>
            <strong className="block text-slate-900">Unico</strong><span className="text-xs text-slate-600">Tutti i turnisti in un file.</span>
          </button>
          <button type="button" role="radio" aria-checked={split} onClick={() => setSplit(true)} className={choice(split)}>
            <strong className="block text-slate-900">Uno per turnista</strong><span className="text-xs text-slate-600">{people} file in un archivio ZIP, ognuno con schema e dettaglio.</span>
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">I file contengono nomi ed email: salvali solo nelle cartelle dell'ufficio paghe.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Preparazione…' : 'Esporta'}</Button>
        </div>
      </form>
    </div>
  )
}
