import { useMemo, useState } from 'react'
import {
  ALL_SLOTS, HOLIDAYS, HORIZON_END, HORIZON_START, RANGE_23NOV, SLOT_BY_ID, SLOT_HOURS, SLOT_LABEL,
  addDays, fmtDay, isWeekendOrHoliday, isoWeekNumber, slotsForDay, toDate, weekStart,
} from '../lib/calendar'
import { autoFill, checkAssignment, existingViolations, RULE_SHORT, type Violation } from '../lib/rules'
import type { Assignments, Params, Person } from '../lib/types'
import { Badge, Button } from './ui'

interface Props {
  people: Person[]
  assignments: Assignments
  params: Params
  onChange: (a: Assignments) => void
}

export type RangeMode = 'all' | 'from23'
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export function Planner({ people, assignments, params, onChange }: Props) {
  const [range, setRange] = useState<RangeMode>('all')
  const [focus, setFocus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const from = range === 'all' ? HORIZON_START : RANGE_23NOV
  const byId = useMemo(() => Object.fromEntries(people.map((x) => [x.id, x])), [people])

  // Esito della validazione per ogni slot × persona attiva (motore vincoli in tempo reale)
  const matrix = useMemo(() => {
    const out: Record<string, Record<string, Violation[]>> = {}
    for (const s of ALL_SLOTS) {
      out[s.id] = {}
      for (const p of people) out[s.id][p.id] = checkAssignment(p, s.id, assignments, params)
    }
    return out
  }, [people, assignments, params])
  const conflicts = useMemo(() => existingViolations(people, assignments, params), [people, assignments, params])

  const visibleSlots = ALL_SLOTS.filter((s) => s.date >= from)
  const covered = visibleSlots.filter((s) => byId[assignments[s.id]]).length
  const active = people.filter((p) => p.active)

  const weeks: string[] = []
  for (let w = weekStart(from); w <= HORIZON_END; w = addDays(w, 7)) weeks.push(w)

  const assign = (slotId: string, personId: string) => {
    const a = { ...assignments }
    if (personId) a[slotId] = personId
    else delete a[slotId]
    onChange(a)
    setNotice(null)
  }

  const runAutofill = () => {
    const res = autoFill(people, assignments, params, from, HORIZON_END)
    const added = Object.keys(res).length - Object.keys(assignments).length
    const missing = visibleSlots.filter((s) => !res[s.id]).length
    onChange(res)
    setNotice(`Auto-compilazione: ${added} turni aggiunti. ${missing ? `${missing} slot restano scoperti: nessuna risorsa attiva può coprirli senza violare i vincoli (aggiungi persone al team).` : 'Tutti gli slot del periodo sono coperti.'}`)
  }

  const clearRange = () => {
    if (!confirm(`Rimuovere tutte le assegnazioni ${range === 'all' ? 'di Nov–Dic 2026' : 'dal 23 Nov al 31 Dic'}?`)) return
    onChange(Object.fromEntries(Object.entries(assignments).filter(([sid]) => SLOT_BY_ID[sid]?.date < from)))
    setNotice(null)
  }

  const focusSlot = focus ? SLOT_BY_ID[focus] : null

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist" aria-label="Periodo">
          {([['all', 'Tutto Nov–Dic 2026'], ['from23', 'Solo dal 23 Nov al 31 Dic']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)} className={`rounded-md px-3 py-1.5 font-medium ${range === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
          ))}
        </div>
        <Button variant="primary" onClick={runAutofill} disabled={!active.length}>Auto-compila turni validi</Button>
        <Button variant="danger" onClick={clearRange}>Svuota periodo</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={covered === visibleSlots.length ? 'green' : covered ? 'amber' : 'red'}>{covered}/{visibleSlots.length} slot coperti</Badge>
          {Object.keys(conflicts).length > 0 && <Badge tone="red">{Object.keys(conflicts).length} conflitti</Badge>}
        </div>
      </div>
      {notice && <p className="no-print mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div />
              {WEEKDAYS.map((d) => <div key={d} className="px-1">{d}</div>)}
            </div>
            {weeks.map((w) => (
              <div key={w} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1 pb-1">
                <div className="pt-2 text-xs text-slate-400" title={`Settimana ISO ${isoWeekNumber(w)}`}>W{isoWeekNumber(w)}</div>
                {Array.from({ length: 7 }, (_, i) => addDays(w, i)).map((day) => {
                  if (day < from || day > HORIZON_END) return <div key={day} className="rounded-lg bg-slate-50/60" />
                  const festive = isWeekendOrHoliday(day)
                  const d = toDate(day)
                  return (
                    <div key={day} className={`rounded-lg border p-1.5 ${festive ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-white'}`}>
                      <div className="mb-1 flex items-baseline justify-between gap-1">
                        <span className="text-sm font-semibold text-slate-800">{d.getUTCDate()}{d.getUTCDate() === 1 || day === from ? ` ${fmtDay(day).split(' ')[2]}` : ''}</span>
                        {HOLIDAYS[day] && <span className="truncate text-[10px] font-medium text-indigo-700" title={HOLIDAYS[day]}>{HOLIDAYS[day]}</span>}
                      </div>
                      <div className="space-y-1">
                        {slotsForDay(day).map((s) => {
                          const pid = assignments[s.id]
                          const person = byId[pid]
                          const conflict = conflicts[s.id]
                          return (
                            <div key={s.id} onMouseEnter={() => setFocus(s.id)} className={`rounded-md ${conflict ? 'ring-2 ring-red-500' : ''}`}>
                              <div className="flex items-center justify-between px-0.5 text-[10px] text-slate-500">
                                <span>{SLOT_LABEL[s.kind]} <span className="text-slate-400">{SLOT_HOURS[s.kind]}</span></span>
                                {conflict && <span className="font-semibold text-red-600" title={conflict.map((c) => c.message).join('\n')}>⚠</span>}
                              </div>
                              <div className="flex items-center gap-1 rounded-md bg-white ring-1 ring-inset ring-slate-200" style={person ? { boxShadow: `inset 3px 0 0 ${person.color}` } : undefined}>
                                <select
                                  aria-label={`${fmtDay(day)} slot ${SLOT_LABEL[s.kind]}`}
                                  value={person ? pid : ''}
                                  onFocus={() => setFocus(s.id)}
                                  onChange={(e) => assign(s.id, e.target.value)}
                                  className={`w-full min-w-0 truncate rounded-md bg-transparent py-1 pl-2 pr-1 text-xs outline-none ${person ? 'font-medium text-slate-900' : 'text-slate-400'}`}
                                >
                                  <option value="">— scoperto —</option>
                                  {people.filter((p) => p.active || p.id === pid).map((p) => {
                                    const v = matrix[s.id][p.id]
                                    const blocked = v.length > 0 && p.id !== pid
                                    return (
                                      <option key={p.id} value={p.id} disabled={blocked} title={v.map((x) => x.message).join('\n')}>
                                        {p.name}{v.length ? ` — ⛔ ${[...new Set(v.map((x) => RULE_SHORT[x.rule]))].join(', ')}` : ''}
                                      </option>
                                    )
                                  })}
                                </select>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Pannello esplicativo dei vincoli per lo slot selezionato */}
        <aside className="no-print xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Disponibilità slot</h3>
            {focusSlot ? (
              <>
                <p className="mt-0.5 text-xs text-slate-500">{fmtDay(focusSlot.date)} · {SLOT_LABEL[focusSlot.kind]} {SLOT_HOURS[focusSlot.kind]}{HOLIDAYS[focusSlot.date] ? ` · ${HOLIDAYS[focusSlot.date]}` : ''}</p>
                {conflicts[focusSlot.id] && (
                  <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-800">
                    <strong>Assegnazione attuale in conflitto:</strong>
                    <ul className="mt-1 list-disc pl-4">{conflicts[focusSlot.id].map((c) => <li key={c.rule}>{c.message}</li>)}</ul>
                  </div>
                )}
                <ul className="mt-3 space-y-2">
                  {active.map((p) => {
                    const v = matrix[focusSlot.id][p.id]
                    const isAssigned = assignments[focusSlot.id] === p.id
                    return (
                      <li key={p.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                          <span className="font-medium text-slate-800">{p.name}</span>
                          <span className="ml-auto">{isAssigned ? <Badge tone="blue">Assegnato</Badge> : v.length ? <Badge tone="red">Bloccato</Badge> : <Badge tone="green">Disponibile</Badge>}</span>
                        </div>
                        {v.length > 0 && !isAssigned && <ul className="mt-1 space-y-0.5 pl-4.5 text-slate-600">{v.map((x) => <li key={x.rule}>{x.message}</li>)}</ul>}
                      </li>
                    )
                  })}
                  {!active.length && <li className="text-xs text-slate-500">Nessuna risorsa attiva in rotazione.</li>}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Passa con il mouse o seleziona uno slot del calendario per vedere chi è disponibile e il motivo esatto di ogni blocco.</p>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 p-4 text-xs text-slate-600">
            <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Regole applicate</h3>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Max 1 slot/giorno nei weekend e festivi</li>
              <li>Nessun turno in giorni adiacenti (ponti Ven–Sab, Sab–Dom, Dom–Lun)</li>
              <li>Max 2 turni/settimana ISO e cap {String(params.capHours).replace('.', ',')} h di compensazione</li>
              <li>Max 4 turni/mese solare</li>
              <li>Weekend/festivo in W ⇒ niente weekend/festivi in W+1</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}
