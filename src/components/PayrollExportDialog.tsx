import { useMemo, useState } from 'react'
import { romeToday } from '../lib/dayStatus'
import { buildPayroll, payPeriods, payrollFileName, type PayPeriod, type PayrollExport, type PayrollInput } from '../lib/payrollExport'
import { Button } from './ui'

const SHEETS = [
  ['Reperibilità CCNL', 'Indennità per ogni turno erogato, per persona.'],
  ['Gettoni integrativi', 'Gettone lordo per turno erogato, per persona.'],
  ['Straordinario per interventi', 'Interventi approvati: orari, ore per fascia CCNL, importo ed eventuale compenso per intervento.'],
  ['Riepilogo paghe', 'Una riga per persona con indennità, gettone, straordinario, eventuali compensi per intervento e totale.'],
] as const

/** Export per l'ufficio paghe: un mese o una settimana; solo turni erogati e interventi approvati. */
export function PayrollExportDialog({ input, busy, onClose, onExport }: { input: PayrollInput; busy?: boolean; onClose: () => void; onExport: (data: PayrollExport, fileName: string) => void }) {
  const { months, weeks } = useMemo(() => payPeriods(), [])
  const today = romeToday()
  const [kind, setKind] = useState<'month' | 'week'>('month')
  const [monthKey, setMonthKey] = useState(() => (months.find((m) => m.from <= today && today <= m.to) ?? months[0]).key)
  const [weekKey, setWeekKey] = useState(() => (weeks.find((w) => w.from <= today && today <= w.to) ?? weeks[0]).key)
  const period: PayPeriod = kind === 'month' ? months.find((m) => m.key === monthKey)! : weeks.find((w) => w.key === weekKey)!
  const data = useMemo(() => buildPayroll(input, period), [input, period])
  const fileName = payrollFileName(period)
  const empty = !data.shifts.length && !data.overtime.length
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const counts = [n(data.shifts.length, 'turno', 'turni'), n(data.shifts.length, 'turno', 'turni'), n(data.overtime.length, 'intervento', 'interventi'), n(data.summary.length, 'persona', 'persone')]
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="pay-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form onSubmit={(e) => { e.preventDefault(); if (!empty) onExport(data, fileName) }} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="pay-title" className="text-lg font-semibold text-slate-900">Esporta per l'ufficio paghe</h3>
        <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Periodo">
          {([['month', 'Mese'], ['week', 'Settimana']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1.5 font-medium ${kind === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-600">{kind === 'month' ? 'Mese' : 'Settimana'}</span>
          {kind === 'month' ? (
            <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className="mt-1 block w-full rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-inset ring-slate-300">
              {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          ) : (
            <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)} className="mt-1 block w-full rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-inset ring-slate-300">
              {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          )}
        </label>
        <div className="mt-4 text-xs font-medium text-slate-600">Fogli del file</div>
        <ol className="mt-1.5 space-y-1.5">
          {SHEETS.map(([name, help], i) => (
            <li key={name} className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-blue-700 text-xs font-semibold text-white">{i + 1}</span>
              <span className="min-w-0 flex-1"><strong className="block text-slate-900">{name}</strong><span className="text-xs text-slate-600">{help}</span></span>
              <span className="shrink-0 text-xs text-slate-500">{counts[i]}</span>
            </li>
          ))}
        </ol>
        {data.notes.map((n) => <p key={n} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{n}</p>)}
        <p className="mt-3 text-xs text-slate-500">Solo turni dei giorni <strong>erogati</strong> e interventi <strong>approvati</strong>. File: <span className="break-all font-mono">{fileName}</span></p>
        {empty && <p className="mt-2 text-sm text-slate-600">Nel periodo non ci sono ancora turni erogati né interventi approvati.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button type="submit" variant="primary" disabled={busy || empty}>{busy ? 'Preparazione…' : 'Esporta Excel'}</Button>
        </div>
      </form>
    </div>
  )
}
