import { useMemo, useState } from 'react'
import {
  ALL_SLOTS, HOLIDAYS, HORIZON_END, HORIZON_START, RANGE_23NOV, SLOT_BY_ID, SLOT_HOURS, SLOT_LABEL,
  addDays, daysInRange, fmtDay, isWeekendOrHoliday, isoWeekNumber, monthKey, monthLabel, slotsForDay, toDate, weekStart,
} from '../lib/calendar'
import { regenerate, checkAssignment, existingViolations, personSlots, preferenceWarning, RULE_SHORT, type Violation } from '../lib/rules'
import { availabilityLabel, preferredMax, type Assignments, type Params, type Person } from '../lib/types'
import { Badge, Button } from './ui'

interface Props {
  people: Person[]
  assignments: Assignments
  params: Params
  excludedDays: string[]
  pinned: string[]
  onChange: (a: Assignments) => void
  onToggleDay: (day: string) => void
  onTogglePin: (slotId: string) => void
}

function PinIcon({ filled, className = 'h-3.5 w-3.5' }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M7 2.5h6l-.8 5 3 3v1.5H4.8V10.5l3-3L7 2.5Z" />
      <path d="M10 12v5.5" strokeLinecap="round" />
    </svg>
  )
}

function LockIcon({ open, className = 'h-4 w-4' }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="4" y="9" width="12" height="8.5" rx="1.8" />
      {open ? <path d="M7 9V6.5a3 3 0 0 1 5.8-1.1" /> : <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />}
    </svg>
  )
}

export type RangeMode = 'all' | 'from23'
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export function Planner({ people, assignments, params, excludedDays, pinned, onChange, onToggleDay, onTogglePin }: Props) {
  const pinnedSet = new Set(pinned)
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

  const excluded = new Set(excludedDays)
  const visibleSlots = ALL_SLOTS.filter((s) => s.date >= from && !excluded.has(s.date))
  const blockedInRange = excludedDays.filter((d) => d >= from).length
  const covered = visibleSlots.filter((s) => byId[assignments[s.id]]).length
  const active = people.filter((p) => p.active)

  // Il calendario è diviso per mese: ogni mese ha la sua intestazione e le sue settimane;
  // i giorni dell'altro mese nelle settimane a cavallo restano vuoti.
  const months = [...new Set(daysInRange(from, HORIZON_END).map(monthKey))]
  const weeksOf = (m: string) => {
    const days = daysInRange(from, HORIZON_END).filter((d) => monthKey(d) === m)
    const out: string[] = []
    for (let w = weekStart(days[0]); w <= days[days.length - 1]; w = addDays(w, 7)) out.push(w)
    return out
  }
  const monthStats = (m: string) => {
    const ss = visibleSlots.filter((x) => monthKey(x.date) === m)
    return { total: ss.length, covered: ss.filter((x) => byId[assignments[x.id]]).length, blocked: excludedDays.filter((d) => d >= from && monthKey(d) === m).length }
  }

  const assign = (slotId: string, personId: string) => {
    const a = { ...assignments }
    if (personId) a[slotId] = personId
    else delete a[slotId]
    onChange(a)
    setNotice(null)
  }

  // Turni del periodo visibile che l'auto-compilazione può ricalcolare (non bloccati)
  const inRange = (sid: string) => SLOT_BY_ID[sid]?.date >= from
  const keepOnly = () => Object.fromEntries(Object.entries(assignments).filter(([sid]) => !inRange(sid) || pinnedSet.has(sid)))
  const pinnedInRange = pinned.filter(inRange).length

  const runAutofill = () => {
    const recalculated = Object.keys(assignments).filter((sid) => inRange(sid) && !pinnedSet.has(sid)).length
    if (recalculated && !confirm(`L'auto-compilazione ricalcola ${recalculated} turni non bloccati del periodo${pinnedInRange ? ` e mantiene i ${pinnedInRange} turni bloccati` : ''}. Per conservare una scelta fatta a mano, bloccala con la puntina. Continuare?`)) return
    const res = regenerate(people, assignments, params, from, HORIZON_END, excludedDays, pinned)
    const assigned = Object.keys(res).filter(inRange).length - pinnedInRange
    const missing = visibleSlots.filter((s) => !res[s.id]).length
    onChange(res)
    setNotice(`Auto-compilazione: ${assigned} turni assegnati${pinnedInRange ? `, ${pinnedInRange} ${pinnedInRange === 1 ? 'bloccato mantenuto' : 'bloccati mantenuti'}` : ''}. ${missing ? `${missing} slot restano scoperti: nessuna risorsa attiva può coprirli senza violare i vincoli (aggiungi persone al team).` : 'Tutti gli slot del periodo sono coperti.'}`)
  }

  const clearRange = () => {
    if (!confirm(`Rimuovere le assegnazioni non bloccate ${range === 'all' ? 'di Nov–Dic 2026' : 'dal 23 Nov al 31 Dic'}?${pinnedInRange ? ` I ${pinnedInRange} turni bloccati restano (sbloccali per rimuoverli).` : ''}`)) return
    onChange(keepOnly())
    setNotice(null)
  }

  const focusSlot = focus ? SLOT_BY_ID[focus] : null
  const monthCount = (pid: string, date: string) => personSlots(assignments, pid).filter((x) => x.date.slice(0, 7) === date.slice(0, 7)).length

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist" aria-label="Periodo">
          {([['all', 'Tutto Nov–Dic 2026'], ['from23', 'Solo dal 23 Nov al 31 Dic']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)} className={`rounded-md px-3 py-1.5 font-medium ${range === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
          ))}
        </div>
        <Button variant="primary" onClick={runAutofill} disabled={!active.length}>Auto-compila (mantiene i bloccati)</Button>
        <Button variant="danger" onClick={clearRange}>Svuota periodo</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {pinnedInRange > 0 && <Badge tone="blue"><PinIcon filled className="h-3 w-3" /> {pinnedInRange} {pinnedInRange === 1 ? 'turno bloccato' : 'turni bloccati'}</Badge>}
          {blockedInRange > 0 && <Badge tone="slate"><LockIcon className="h-3 w-3" /> {blockedInRange} {blockedInRange === 1 ? 'giorno non richiesto' : 'giorni non richiesti'}</Badge>}
          <Badge tone={covered === visibleSlots.length ? 'green' : covered ? 'amber' : 'red'}>{covered}/{visibleSlots.length} slot coperti</Badge>
          {Object.keys(conflicts).length > 0 && <Badge tone="red">{Object.keys(conflicts).length} conflitti</Badge>}
        </div>
      </div>
      {notice && <p className="no-print mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            {months.map((m, mi) => {
              const st = monthStats(m)
              return (
            <section key={m} aria-label={monthLabel(m)} className={mi > 0 ? 'mt-8 border-t-2 border-slate-200 pt-6' : ''}>
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-blue-700 px-4 py-2.5 text-white">
              <h3 className="text-lg font-semibold tracking-wide uppercase">{monthLabel(m)}</h3>
              <span className="text-sm text-blue-100">{st.covered}/{st.total} slot coperti</span>
              {st.blocked > 0 && <span className="text-sm text-blue-100">· {st.blocked} {st.blocked === 1 ? 'giorno non richiesto' : 'giorni non richiesti'}</span>}
            </div>
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div />
              {WEEKDAYS.map((d) => <div key={d} className="px-1">{d}</div>)}
            </div>
            {weeksOf(m).map((w) => (
              <div key={w} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1 pb-1">
                <div className="pt-2 text-xs text-slate-400" title={`Settimana ISO ${isoWeekNumber(w)}`}>W{isoWeekNumber(w)}</div>
                {Array.from({ length: 7 }, (_, i) => addDays(w, i)).map((day) => {
                  if (day < from || day > HORIZON_END || monthKey(day) !== m) {
                    return <div key={day} className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50" aria-hidden />
                  }
                  const festive = isWeekendOrHoliday(day)
                  const d = toDate(day)
                  const dayNum = String(d.getUTCDate())
                  if (excluded.has(day)) {
                    return (
                      <div key={day} className="flex flex-col rounded-lg border border-dashed border-slate-300 bg-slate-100 p-1.5 text-slate-500" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, rgb(226 232 240) 6px 7px)' }}>
                        <div className="mb-1 flex items-baseline justify-between gap-1">
                          <span className="text-sm font-semibold text-slate-400 line-through">{dayNum}</span>
                          {HOLIDAYS[day] && <span className="truncate text-[10px] text-slate-400" title={HOLIDAYS[day]}>{HOLIDAYS[day]}</span>}
                        </div>
                        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-1">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-700 text-white shadow-sm"><LockIcon /></span>
                          <span className="text-[11px] font-semibold text-slate-600">Non richiesto</span>
                          <button type="button" onClick={() => onToggleDay(day)} className="no-print mt-0.5 inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-slate-300 hover:bg-blue-50" aria-label={`Sblocca ${fmtDay(day)}`}>
                            <LockIcon open className="h-3 w-3" /> Sblocca
                          </button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={day} className={`group rounded-lg border p-1.5 ${festive ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-white'}`}>
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="text-sm font-semibold text-slate-800">{dayNum}</span>
                        <span className="flex min-w-0 items-center gap-1">
                          {HOLIDAYS[day] && <span className="truncate text-[10px] font-medium text-indigo-700" title={HOLIDAYS[day]}>{HOLIDAYS[day]}</span>}
                          <button type="button" onClick={() => onToggleDay(day)} title="Blocca giorno: non richiesto dal cliente (escluso dalla rotazione)" aria-label={`Blocca ${fmtDay(day)}`}
                            className="no-print shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-700 focus-visible:text-slate-700 group-hover:text-slate-400">
                            <LockIcon open className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                      <div className="space-y-1">
                        {slotsForDay(day).map((s) => {
                          const pid = assignments[s.id]
                          const person = byId[pid]
                          const conflict = conflicts[s.id]
                          const overPref = !conflict && person ? preferenceWarning(person, s.id, assignments) : undefined
                          const isPinned = !!person && pinnedSet.has(s.id)
                          return (
                            <div key={s.id} onMouseEnter={() => setFocus(s.id)} className={`rounded-md ${conflict ? 'ring-2 ring-red-500' : overPref ? 'ring-2 ring-amber-400' : ''}`}>
                              <div className="flex items-center justify-between px-0.5 text-[10px] text-slate-500">
                                <span>{SLOT_LABEL[s.kind]} <span className="text-slate-400">{SLOT_HOURS[s.kind]}</span></span>
                                <span className="flex items-center gap-1">
                                  {conflict && <span className="font-semibold text-red-600" title={conflict.map((c) => c.message).join('\n')}>⚠</span>}
                                  {overPref && <span className="font-semibold text-amber-600" title={overPref}>⚠</span>}
                                  {person && (
                                    <button type="button" onClick={() => onTogglePin(s.id)} aria-pressed={isPinned}
                                      aria-label={`${isPinned ? 'Sblocca' : 'Blocca'} turno ${fmtDay(day)} ${SLOT_LABEL[s.kind]}`}
                                      title={isPinned ? 'Turno bloccato: l\'auto-compilazione non lo modifica. Clicca per sbloccare' : 'Blocca questo turno: l\'auto-compilazione lo manterrà'}
                                      className={`no-print rounded p-0.5 ${isPinned ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-700'}`}>
                                      <PinIcon filled={isPinned} className="h-3 w-3" />
                                    </button>
                                  )}
                                </span>
                              </div>
                              <div className={`flex items-center gap-1 rounded-md ${isPinned ? 'bg-blue-50' : 'bg-white'}`}
                                style={{ boxShadow: [person ? `inset 3px 0 0 ${person.color}` : '', isPinned ? '0 0 0 2px #1d4ed8' : 'inset 0 0 0 1px #e2e8f0'].filter(Boolean).join(', ') }}>
                                <select
                                  aria-label={`${fmtDay(day)} slot ${SLOT_LABEL[s.kind]}`}
                                  value={person ? pid : ''}
                                  onFocus={() => setFocus(s.id)}
                                  onChange={(e) => assign(s.id, e.target.value)}
                                  disabled={isPinned}
                                  title={isPinned ? 'Turno bloccato: sbloccalo con la puntina per modificarlo' : undefined}
                                  className={`w-full disabled:cursor-not-allowed min-w-0 truncate rounded-md bg-transparent py-1 pl-2 pr-1 text-xs outline-none ${person ? 'font-medium text-slate-900' : 'text-slate-400'}`}
                                >
                                  <option value="">— scoperto —</option>
                                  {people.filter((p) => p.active || p.id === pid).map((p) => {
                                    const v = matrix[s.id][p.id]
                                    const blocked = v.length > 0 && p.id !== pid
                                    const pref = !v.length && p.id !== pid ? preferenceWarning(p, s.id, assignments) : undefined
                                    return (
                                      <option key={p.id} value={p.id} disabled={blocked} title={[...v.map((x) => x.message), pref ?? ''].filter(Boolean).join('\n')}>
                                        {p.name}{v.length ? ` — ⛔ ${[...new Set(v.map((x) => RULE_SHORT[x.rule]))].join(', ')}` : pref ? ' — ⚠ oltre disponibilità' : ''}
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
            </section>
              )
            })}
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
                    const pref = !v.length ? preferenceWarning(p, focusSlot.id, assignments) : undefined
                    return (
                      <li key={p.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                          <span className="min-w-0 truncate font-medium text-slate-800">{p.name}</span>
                          <span className="ml-auto shrink-0">{isAssigned ? <Badge tone="blue">Assegnato</Badge> : v.length ? <Badge tone="red">Bloccato</Badge> : pref ? <Badge tone="amber">Oltre disponibilità</Badge> : <Badge tone="green">Disponibile</Badge>}</span>
                        </div>
                        <div className="pl-4.5 text-[11px] text-slate-500">{p.preferredDays?.includes(focusSlot.date) && <span className="font-semibold text-emerald-700">Ha dato disponibilità per questo giorno · </span>}{availabilityLabel(p)}{preferredMax(p) !== undefined ? ` · ${monthCount(p.id, focusSlot.date)} assegnati nel mese` : ''}</div>
                        {pref && !isAssigned && <div className="pl-4.5 text-amber-800">{pref}</div>}
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
              <li>Ogni settimana deve avere una domenica libera per le ore (anche la successiva o la precedente)</li>
            </ol>
            <p className="mt-2 border-t border-slate-200 pt-2"><span className="font-semibold text-amber-700">⚠ Oltre disponibilità</span>: assegnabile a mano, ma supera il massimo mensile indicato dalla persona. L'auto-compilazione non lo fa mai.</p>
            <p className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-2"><PinIcon filled className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" /> Con la puntina blocchi un turno assegnato: non è modificabile e l'auto-compilazione ricalcola tutti gli altri tenendolo fisso.</p>
            <p className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-2"><LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Con il lucchetto blocchi un giorno non richiesto dal cliente: resta fuori dalla rotazione, dall'auto-compilazione, dai ricavi e dall'export.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
