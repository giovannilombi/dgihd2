import { useState } from 'react'
import { HOLIDAYS, HORIZON_END, HORIZON_START, daysInRange, fmtDay, isWeekendOrHoliday, monthKey, monthLabel, rangeLabel, toDate, toRanges } from '../lib/calendar'
import type { Person } from '../lib/types'
import { Badge, Button } from './ui'

type DayState = 'off' | 'pref' | undefined
type Mode = 'off' | 'pref' | 'clear'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

/**
 * Gestione per persona di ferie/assenze (blocco assoluto) e giorni di disponibilità (preferenza).
 * Si lavora su una bozza: le modifiche si applicano solo con "Salva".
 */
export function AvailabilityDialog({ person, onClose, onSave }: {
  person: Person
  onClose: () => void
  onSave: (unavailable: string[], preferred: string[]) => void
}) {
  const [state, setState] = useState<Record<string, DayState>>(() => {
    const m: Record<string, DayState> = {}
    for (const d of person.preferredDays ?? []) m[d] = 'pref'
    for (const d of person.unavailable ?? []) m[d] = 'off'
    return m
  })
  const [from, setFrom] = useState(HORIZON_START)
  const [to, setTo] = useState(HORIZON_START)
  const [mode, setMode] = useState<Mode>('off')
  const [error, setError] = useState('')

  const list = (k: 'off' | 'pref') => Object.keys(state).filter((d) => state[d] === k).sort()
  const off = list('off')
  const pref = list('pref')

  const setDays = (days: string[], value: DayState) =>
    setState((s) => {
      const n = { ...s }
      for (const d of days) { if (value) n[d] = value; else delete n[d] }
      return n
    })

  const applyRange = () => {
    if (!from || !to) return setError('Indica data di inizio e di fine.')
    if (to < from) return setError('La data di fine è precedente a quella di inizio.')
    if (from < HORIZON_START || to > HORIZON_END) return setError('Le date devono essere comprese nel periodo pianificato (1 Nov – 31 Dic 2026).')
    setError('')
    setDays(daysInRange(from, to), mode === 'clear' ? undefined : mode)
  }

  /** Click su un giorno: nessuna indicazione → non disponibile → disponibile → nessuna indicazione. */
  const cycle = (d: string) => setDays([d], state[d] === undefined ? 'off' : state[d] === 'off' ? 'pref' : undefined)

  const months = [...new Set(daysInRange().map(monthKey))]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="av-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="av-title" className="text-lg font-semibold text-slate-900">Disponibilità di {person.name}</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              <strong className="text-red-700">Non disponibile</strong> (ferie, assenze): la persona non viene mai assegnata in quei giorni.{' '}
              <strong className="text-emerald-700">Disponibile</strong>: in quei giorni l'auto-compilazione la sceglie per prima.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge tone="red">{off.length} gg non disponibile</Badge>
            <Badge tone="green">{pref.length} gg disponibile</Badge>
          </div>
        </div>

        {/* Inserimento per intervallo */}
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Dal</span>
            <input type="date" value={from} min={HORIZON_START} max={HORIZON_END} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }}
              className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Al</span>
            <input type="date" value={to} min={from || HORIZON_START} max={HORIZON_END} onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Segna come</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
              <option value="off">Non disponibile (ferie / assenza)</option>
              <option value="pref">Disponibile</option>
              <option value="clear">Nessuna indicazione (rimuovi)</option>
            </select>
          </label>
          <Button variant="primary" onClick={applyRange}>Applica al periodo</Button>
          {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          {/* Mini calendario: click per cambiare stato */}
          <div className="grid gap-4 sm:grid-cols-2">
            {months.map((m) => {
              const days = daysInRange().filter((d) => monthKey(d) === m)
              const lead = (toDate(days[0]).getUTCDay() + 6) % 7
              return (
                <div key={m}>
                  <div className="mb-1.5 text-sm font-semibold text-slate-800">{monthLabel(m)}</div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 uppercase">
                    {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
                    {days.map((d) => {
                      const st = state[d]
                      const festive = isWeekendOrHoliday(d)
                      return (
                        <button key={d} type="button" onClick={() => cycle(d)}
                          title={`${fmtDay(d)}${HOLIDAYS[d] ? ` · ${HOLIDAYS[d]}` : ''} — ${st === 'off' ? 'Non disponibile' : st === 'pref' ? 'Disponibile' : 'Nessuna indicazione'} (clicca per cambiare)`}
                          aria-label={`${fmtDay(d)}: ${st === 'off' ? 'non disponibile' : st === 'pref' ? 'disponibile' : 'nessuna indicazione'}`}
                          className={`h-8 rounded-md text-xs font-medium ring-1 ring-inset transition-colors ${
                            st === 'off' ? 'bg-red-600 text-white ring-red-700 line-through'
                            : st === 'pref' ? 'bg-emerald-600 text-white ring-emerald-700'
                            : festive ? 'bg-indigo-50 text-slate-700 ring-indigo-200 hover:bg-indigo-100' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}>
                          {toDate(d).getUTCDate()}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <p className="text-xs text-slate-500 sm:col-span-2">Clic su un giorno: nessuna indicazione → <span className="font-semibold text-red-700">non disponibile</span> → <span className="font-semibold text-emerald-700">disponibile</span> → nessuna indicazione.</p>
          </div>

          {/* Riepilogo per periodi */}
          <div className="space-y-3 text-sm">
            {([['off', 'Non disponibile', off, 'text-red-700'], ['pref', 'Disponibile', pref, 'text-emerald-700']] as const).map(([k, label, dates, color]) => (
              <div key={k}>
                <div className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</div>
                {dates.length ? (
                  <ul className="mt-1 space-y-1">
                    {toRanges(dates).map((r) => (
                      <li key={r.from} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1">
                        <span className="flex-1">{rangeLabel(r)} <span className="text-xs text-slate-400">· {r.days} gg</span></span>
                        <button type="button" onClick={() => setDays(daysInRange(r.from, r.to), undefined)} className="text-xs text-slate-500 hover:text-red-700" aria-label={`Rimuovi ${rangeLabel(r)}`}>Rimuovi</button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-xs text-slate-400">Nessun giorno indicato.</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" className="mr-auto" onClick={() => setState({})}>Azzera tutto</Button>
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button variant="primary" onClick={() => onSave(off, pref)}>Salva</Button>
        </div>
      </div>
    </div>
  )
}
