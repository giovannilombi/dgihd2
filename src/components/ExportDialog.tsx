import { useState } from 'react'
import { HORIZON_END, HORIZON_START } from '../lib/calendar'
import { exportableMonths, exportFileName, rangeText, validateRange, type ExportRange } from '../lib/exportRange'
import { Button } from './ui'

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'
const TITLES: Record<ExportFormat, string> = {
  csv: 'Esporta report (CSV)',
  xlsx: 'Esporta turni (Excel)',
  pdf: 'Esporta turni (PDF)',
}

/** Scelta del periodo da esportare: un mese dal menu oppure un intervallo Dal/Al. */
export function ExportDialog({ format, busy, onClose, onExport }: {
  format: ExportFormat
  busy?: boolean
  onClose: () => void
  onExport: (range: ExportRange, fileName: string) => void
}) {
  const months = exportableMonths()
  const [mode, setMode] = useState<'month' | 'range'>('month')
  const [month, setMonth] = useState(months[0].key)
  const [from, setFrom] = useState(HORIZON_START)
  const [to, setTo] = useState(HORIZON_END)

  const m = months.find((x) => x.key === month)!
  const range: ExportRange = mode === 'month' ? { from: m.from, to: m.to } : { from, to }
  const error = mode === 'range' ? validateRange(range) : undefined
  const fileName = error ? '' : exportFileName(format, range)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="exp-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!error) onExport(range, fileName) }}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 id="exp-title" className="text-lg font-semibold text-slate-900">{TITLES[format]}</h3>
        <p className="mt-0.5 text-sm text-slate-500">Scegli il periodo da includere nel file.</p>

        <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Tipo di periodo">
          {([['month', 'Mese'], ['range', 'Intervallo di date']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
              className={`rounded-md px-3 py-1.5 font-medium ${mode === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
          ))}
        </div>

        {mode === 'month' ? (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-600">Mese</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 block w-full rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-inset ring-slate-300">
              {months.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Dal</span>
              <input type="date" value={from} min={HORIZON_START} max={HORIZON_END} onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block w-full rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Al</span>
              <input type="date" value={to} min={HORIZON_START} max={HORIZON_END} onChange={(e) => setTo(e.target.value)}
                className="mt-1 block w-full rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300" />
            </label>
          </div>
        )}

        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          {error ? <p role="alert" className="text-red-700">{error}</p> : (
            <>
              <div className="text-slate-600">Periodo: <strong className="text-slate-900">{rangeText(range)}</strong></div>
              <div className="mt-0.5 break-all font-mono text-xs text-slate-500">{fileName}</div>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button type="submit" variant="primary" disabled={!!error || busy}>{busy ? 'Preparazione…' : 'Scarica'}</Button>
        </div>
      </form>
    </div>
  )
}
