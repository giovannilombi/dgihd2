import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ALL_SLOTS, HOLIDAYS, HORIZON_END, HORIZON_MONTHS, HORIZON_START, SLOT_BY_ID, SLOT_HOURS, SLOT_LABEL,
  HORIZON_LABEL, addDays, daysInRange, fmtDay, fmtDayYear, isWeekendOrHoliday, isoWeekNumber, monthKey, monthLabel, slotsForDay, toDate, weekStart,
} from '../lib/calendar'
import { checkAssignment, existingViolations, personSlots, preferenceWarning, RULE_SHORT, type Violation } from '../lib/rules'
import { mergeConflicts, mergeViolations, needsServerChecks, type ServerChecks, type ServerChecksState } from '../lib/serverChecks'
import { availabilityLabel, preferredMax, type Assignments, type Params, type Person } from '../lib/types'
import { Badge, Button } from './ui'
import { useHeightVar, useStickyBar, useStickyOverlay } from '../lib/useStickyBar'
import type { ShiftChipInfo } from '../lib/interventions'
import { InterventionChip } from './InterventionChip'
import { dayShiftEnd, dayState, lockedSlots, romeToday, shiftEnded, shortName, type DayPerms, type DayStatusMap } from '../lib/dayStatus'

interface Props {
  people: Person[]
  assignments: Assignments
  params: Params
  excludedDays: string[]
  pinned: string[]
  onChange: (a: Assignments) => void
  onToggleDay: (day: string) => void
  onTogglePin: (slotId: string) => void
  /** Blocca o sblocca in blocco i giorni indicati (giorni non richiesti dal cliente). */
  onSetDaysExcluded: (days: string[], excluded: boolean) => void
  /** Sola lettura (viewer e viewer esteso): nessuna modifica possibile. */
  readOnly?: boolean
  /** Vista essenziale (viewer): solo turni, senza pannello vincoli, ferie o disponibilità. */
  simple?: boolean
  /** Ricalcola il periodo mantenendo i turni bloccati (in pagina o sul server se ci sono RAL non visibili). */
  autofill: (from: string, to: string) => Promise<Assignments>
  /** Vincoli economici calcolati dal server per le persone con RAL non visibile. */
  serverChecks?: ServerChecks | null
  serverChecksState?: ServerChecksState
  /** Giorni erogati (turni definitivi) e consuntivati. */
  days?: DayStatusMap
  /** Permessi e azioni sui giorni (Segna erogato, Consuntiva, Sblocca); assenti = nessuna azione. */
  dayActions?: DayActions
  /** Stato degli interventi del turno (chip): solo per chi legge il consuntivo. */
  ivChip?: (slotId: string) => ShiftChipInfo | null
}

export interface DayActions {
  perms: (day: string) => DayPerms
  mark: (day: string) => Promise<void>
  close: (day: string) => Promise<void>
  unlock: (day: string, note?: string) => Promise<void>
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

/** 'all' = tutto il periodo, 'custom' = intervallo Da–A, altrimenti la chiave del mese (YYYY-MM). */
export type RangeMode = string
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

/** Fascia blu del mese: nel calendario e, quando si scorre, fissa sotto la barra del periodo. */
function MonthBanner({ label, st, heading }: { label: string; st: { covered: number; total: number; blocked: number; erogati: number; consuntivati: number }; heading?: boolean }) {
  const Title = heading ? 'h3' : 'span'
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-700 px-4 py-2.5 text-white">
      <Title className="text-lg font-semibold tracking-wide uppercase">{label}</Title>
      <span className="text-sm text-blue-100">{st.covered}/{st.total} slot coperti</span>
      {st.blocked > 0 && <span className="text-sm text-blue-100">· {st.blocked} {st.blocked === 1 ? 'giorno non richiesto' : 'giorni non richiesti'}</span>}
      {st.erogati > 0 && <span className="text-sm text-blue-100">· {st.erogati} {st.erogati === 1 ? 'giorno erogato' : 'giorni erogati'}{st.consuntivati > 0 ? ` (${st.consuntivati} consuntivat${st.consuntivati === 1 ? 'o' : 'i'})` : ''}</span>}
    </div>
  )
}

export function Planner({ people, assignments, params, excludedDays, pinned, onChange, onToggleDay, onTogglePin, onSetDaysExcluded, readOnly = false, simple = false, autofill, serverChecks = null, serverChecksState = 'off', days = {}, dayActions, ivChip }: Props) {
  const pinnedSet = new Set(pinned)
  // Turni che auto-compilazione e "Svuota" non toccano: bloccati con la puntina o di giorni erogati
  const fixedSet = new Set([...pinned, ...lockedSlots(days, assignments)])
  const [dialog, setDialog] = useState<{ kind: 'mark' | 'close' | 'unlock'; day: string } | null>(null)
  // Orologio al minuto: "Segna erogato" compare alla fine del turno senza ricaricare la pagina
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t) }, [])
  const today = romeToday(now)
  const [range, setRange] = useState<RangeMode>('all')
  const [customFrom, setCustomFrom] = useState(HORIZON_START)
  const [customTo, setCustomTo] = useState(HORIZON_END)
  const [focus, setFocus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Periodo mostrato e su cui agiscono auto-compilazione e "Svuota": tutto, un mese o un intervallo Da–A
  const customOk = customFrom && customTo && customFrom <= customTo
  const [from, to] =
    range === 'all' ? [HORIZON_START, HORIZON_END]
    : range === 'custom' ? (customOk ? [customFrom < HORIZON_START ? HORIZON_START : customFrom, customTo > HORIZON_END ? HORIZON_END : customTo] : [HORIZON_START, HORIZON_END])
    : (() => { const ds = daysInRange().filter((d) => monthKey(d) === range); return [ds[0], ds[ds.length - 1]] })()
  const periodLabel = range === 'all' ? `di tutto il periodo (${HORIZON_LABEL})` : `dal ${fmtDayYear(from)} al ${fmtDayYear(to)}`
  const byId = useMemo(() => Object.fromEntries(people.map((x) => [x.id, x])), [people])

  // Esito della validazione per ogni slot × persona attiva (motore vincoli in tempo reale).
  // Per le persone con RAL non visibile i vincoli economici arrivano dal server.
  const matrix = useMemo(() => {
    const out: Record<string, Record<string, Violation[]>> = {}
    for (const s of ALL_SLOTS) {
      out[s.id] = {}
      for (const p of people) {
        const local = checkAssignment(p, s.id, assignments, params)
        out[s.id][p.id] = needsServerChecks(p) ? mergeViolations(local, serverChecks?.blocked[p.id]?.[s.id]) : local
      }
    }
    return out
  }, [people, assignments, params, serverChecks])
  const conflicts = useMemo(() => mergeConflicts(existingViolations(people, assignments, params), serverChecks), [people, assignments, params, serverChecks])

  const excluded = new Set(excludedDays)
  const visibleSlots = ALL_SLOTS.filter((s) => s.date >= from && s.date <= to && !excluded.has(s.date))
  const blockedInRange = excludedDays.filter((d) => d >= from && d <= to).length
  const covered = visibleSlots.filter((s) => byId[assignments[s.id]]).length
  const active = people.filter((p) => p.active)

  // Il calendario è diviso per mese: ogni mese ha la sua intestazione e le sue settimane;
  // i giorni dell'altro mese nelle settimane a cavallo restano vuoti.
  const months = [...new Set(daysInRange(from, to).map(monthKey))]
  const weeksOf = (m: string) => {
    const days = daysInRange(from, to).filter((d) => monthKey(d) === m)
    const out: string[] = []
    for (let w = weekStart(days[0]); w <= days[days.length - 1]; w = addDays(w, 7)) out.push(w)
    return out
  }
  const monthStats = (m: string) => {
    const ss = visibleSlots.filter((x) => monthKey(x.date) === m)
    const ds = daysInRange(from, to).filter((d) => monthKey(d) === m)
    return {
      total: ss.length, covered: ss.filter((x) => byId[assignments[x.id]]).length, blocked: excludedDays.filter((d) => d >= from && monthKey(d) === m).length,
      erogati: ds.filter((d) => days[d]).length, consuntivati: ds.filter((d) => days[d]?.consuntivatoAt).length,
    }
  }

  const assign = (slotId: string, personId: string) => {
    const a = { ...assignments }
    if (personId) a[slotId] = personId
    else delete a[slotId]
    onChange(a)
    setNotice(null)
  }

  // Turni del periodo visibile che l'auto-compilazione può ricalcolare (non bloccati)
  const inRange = (sid: string) => { const d = SLOT_BY_ID[sid]?.date; return !!d && d >= from && d <= to }
  const keepOnly = () => Object.fromEntries(Object.entries(assignments).filter(([sid]) => !inRange(sid) || fixedSet.has(sid)))
  const pinnedInRange = [...fixedSet].filter(inRange).length

  const runAutofill = async () => {
    const recalculated = Object.keys(assignments).filter((sid) => inRange(sid) && !fixedSet.has(sid)).length
    if (recalculated && !confirm(`L'auto-compilazione ricalcola ${recalculated} turni non bloccati del periodo${pinnedInRange ? ` e mantiene i ${pinnedInRange} turni bloccati o erogati` : ''}. Per conservare una scelta fatta a mano, bloccala con la puntina. Continuare?`)) return
    setBusy(true)
    setNotice(null)
    let res: Assignments
    try {
      res = await autofill(from, to)
    } catch (e) {
      setNotice(`Auto-compilazione non riuscita: ${(e as Error).message}`)
      return
    } finally {
      setBusy(false)
    }
    const assigned = Object.keys(res).filter(inRange).length - pinnedInRange
    const missing = visibleSlots.filter((s) => !res[s.id]).length
    onChange(res)
    setNotice(`Auto-compilazione: ${assigned} turni assegnati${pinnedInRange ? `, ${pinnedInRange} ${pinnedInRange === 1 ? 'bloccato mantenuto' : 'bloccati mantenuti'}` : ''}. ${missing ? `${missing} slot restano scoperti: nessuna risorsa attiva può coprirli senza violare i vincoli (aggiungi persone al team).` : 'Tutti gli slot del periodo sono coperti.'}`)
  }

  const clearRange = () => {
    if (!confirm(`Rimuovere le assegnazioni non bloccate ${periodLabel}?${pinnedInRange ? ` I ${pinnedInRange} turni bloccati o erogati restano.` : ''}`)) return
    onChange(keepOnly())
    setNotice(null)
  }

  const { ref: barRef, stuck: barStuck } = useStickyBar('--planner-bar-h')
  // Fascia del mese corrente fissa sotto la barra (copia di quella del calendario, che sta in un contenitore a scorrimento orizzontale).
  const barEl = useRef<HTMLDivElement | null>(null)
  const calEl = useRef<HTMLDivElement | null>(null)
  const setBar = useCallback((el: HTMLDivElement | null) => { barEl.current = el; barRef(el) }, [barRef])
  const bandEl = useRef<HTMLDivElement | null>(null)
  const bandHeight = useHeightVar('--planner-band-h')
  const setBand = useCallback((el: HTMLDivElement | null) => { bandEl.current = el; bandHeight(el) }, [bandHeight])
  const monthBand = useStickyOverlay(barEl, calEl, bandEl, months.join(','))
  const focusSlot = focus ? SLOT_BY_ID[focus] : null
  const monthCount = (pid: string, date: string) => personSlots(assignments, pid).filter((x) => x.date.slice(0, 7) === date.slice(0, 7)).length

  return (
    <div>
      {/* Barra del periodo: resta fissa sotto l'intestazione mentre si scorre il calendario (da schermi medi in su). */}
      <div ref={setBar} className={`no-print -mx-5 -mt-3 flex flex-wrap items-center gap-3 bg-white px-5 py-3 lg:sticky lg:top-[var(--app-header-h,57px)] lg:z-30 ${barStuck ? 'border-b border-slate-200 shadow-sm' : ''}`}>
        <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist" aria-label="Periodo">
          {([['all', 'Tutto'], ...HORIZON_MONTHS.map((m) => [m, monthLabel(m)]), ['custom', 'Da – A']] as [string, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)} className={`rounded-md px-3 py-1.5 font-medium ${range === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-slate-600">Da
              <input type="date" value={customFrom} min={HORIZON_START} max={HORIZON_END} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg bg-white px-2 py-1 ring-1 ring-inset ring-slate-300" />
            </label>
            <label className="flex items-center gap-1.5 text-slate-600">A
              <input type="date" value={customTo} min={customFrom || HORIZON_START} max={HORIZON_END} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg bg-white px-2 py-1 ring-1 ring-inset ring-slate-300" />
            </label>
            {!customOk && <span className="text-xs text-red-700">La data di fine è precedente a quella di inizio: mostro tutto il periodo.</span>}
          </div>
        )}
        {!readOnly && <Button variant="primary" onClick={runAutofill} disabled={!active.length || busy}>{busy ? 'Auto-compilazione in corso…' : 'Auto-compila (mantiene i bloccati)'}</Button>}
        {!readOnly && <Button variant="danger" onClick={clearRange}>Svuota periodo</Button>}
        {!readOnly && blockedInRange > 0 && <Button onClick={() => onSetDaysExcluded(daysInRange(from, to), false)} title="Rende richiesti tutti i giorni del periodo selezionato">Sblocca giorni del periodo</Button>}
        {!readOnly && blockedInRange < daysInRange(from, to).length && <Button onClick={() => onSetDaysExcluded(daysInRange(from, to), true)} title="Segna come non richiesti tutti i giorni del periodo selezionato">Blocca giorni del periodo</Button>}
        {readOnly && <Badge tone="slate">Sola lettura</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {pinnedInRange > 0 && <Badge tone="blue"><PinIcon filled className="h-3 w-3" /> {pinnedInRange} {pinnedInRange === 1 ? 'turno bloccato' : 'turni bloccati'}{pinned.filter(inRange).length < pinnedInRange ? ' o erogati' : ''}</Badge>}
          {blockedInRange > 0 && <Badge tone="slate"><LockIcon className="h-3 w-3" /> {blockedInRange} {blockedInRange === 1 ? 'giorno non richiesto' : 'giorni non richiesti'}</Badge>}
          {visibleSlots.length === 0
            ? <Badge tone="slate">Nessun turno richiesto</Badge>
            : <Badge tone={covered === visibleSlots.length ? 'green' : covered ? 'amber' : 'red'}>{covered}/{visibleSlots.length} slot coperti</Badge>}
          {Object.keys(conflicts).length > 0 && <Badge tone="red">{Object.keys(conflicts).length} conflitti</Badge>}
          {!simple && serverChecksState === 'error' && <Badge tone="amber" title="Gli importi calcolati sul server (persone con RAL Q/) non sono al momento disponibili: verranno ricalcolati alla prossima modifica">Calcolo sul server non riuscito</Badge>}
        </div>
        {monthBand && (
          <div ref={setBand} aria-hidden="true" className="absolute top-[calc(100%+1px)] bg-white pb-2" style={{ left: monthBand.left, width: monthBand.width }}>
            <MonthBanner label={monthLabel(monthBand.id)} st={monthStats(monthBand.id)} />
          </div>
        )}
      </div>
      {notice && <p className="no-print mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p>}

      <div className={`mt-4 grid gap-4 ${simple ? '' : 'xl:grid-cols-[minmax(0,1fr)_300px]'}`}>
        <div ref={calEl} className="overflow-x-auto">
          <div className="min-w-[980px]">
            {months.map((m, mi) => {
              const st = monthStats(m)
              return (
            <section key={m} aria-label={monthLabel(m)} className={mi > 0 ? 'mt-8 border-t-2 border-slate-200 pt-6' : ''}>
            <div data-sticky-id={m} className="mb-3"><MonthBanner heading label={monthLabel(m)} st={st} /></div>
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div />
              {WEEKDAYS.map((d) => <div key={d} className="px-1">{d}</div>)}
            </div>
            {weeksOf(m).map((w) => (
              <div key={w} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1 pb-1">
                <div className="pt-2 text-xs text-slate-400" title={`Settimana ISO ${isoWeekNumber(w)}`}>W{isoWeekNumber(w)}</div>
                {Array.from({ length: 7 }, (_, i) => addDays(w, i)).map((day) => {
                  if (day < from || day > to || monthKey(day) !== m) {
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
                          {!readOnly && <button type="button" onClick={() => onToggleDay(day)} className="no-print mt-0.5 inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-slate-300 hover:bg-blue-50" aria-label={`Sblocca ${fmtDay(day)}`}>
                            <LockIcon open className="h-3 w-3" /> Sblocca
                          </button>}
                        </div>
                      </div>
                    )
                  }
                  const status = days[day]
                  const state = dayState(days, day)
                  const locked = state !== 'aperto'
                  const perms = dayActions?.perms(day)
                  const hasShift = slotsForDay(day).some((s) => byId[assignments[s.id]])
                  return (
                    <div key={day} className={`group flex flex-col rounded-lg border p-1.5 ${locked ? 'border-emerald-300 bg-emerald-50/50' : festive ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-white'}`}>
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="text-sm font-semibold text-slate-800">{dayNum}</span>
                        <span className="flex min-w-0 items-center gap-1">
                          {HOLIDAYS[day] && <span className="truncate text-[10px] font-medium text-indigo-700" title={HOLIDAYS[day]}>{HOLIDAYS[day]}</span>}
                          {!readOnly && !locked && <button type="button" onClick={() => onToggleDay(day)} title="Blocca giorno: non richiesto dal cliente (escluso dalla rotazione)" aria-label={`Blocca ${fmtDay(day)}`}
                            className="no-print shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-700 focus-visible:text-slate-700 group-hover:text-slate-400">
                            <LockIcon open className="h-3.5 w-3.5" />
                          </button>}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {slotsForDay(day).map((s) => {
                          const pid = assignments[s.id]
                          const person = byId[pid]
                          const conflict = simple ? undefined : conflicts[s.id]
                          const overPref = !conflict && person ? preferenceWarning(person, s.id, assignments) : undefined
                          const isPinned = !!person && pinnedSet.has(s.id)
                          return (
                            <div key={s.id} onMouseEnter={() => setFocus(s.id)} className={`rounded-md ${conflict ? 'ring-2 ring-red-500' : overPref ? 'ring-2 ring-amber-400' : ''}`}>
                              <div className="flex items-center justify-between px-0.5 text-[10px] text-slate-500">
                                <span>{SLOT_LABEL[s.kind]} <span className="text-slate-400">{SLOT_HOURS[s.kind]}</span></span>
                                <span className="flex items-center gap-1">
                                  {conflict && <span className="font-semibold text-red-600" title={conflict.map((c) => c.message).join('\n')}>⚠</span>}
                                  {overPref && <span className="font-semibold text-amber-600" title={overPref}>⚠</span>}
                                  {person && !readOnly && !locked && (
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
                                  disabled={isPinned || readOnly || locked}
                                  title={locked ? 'Giorno erogato: turno definitivo' : isPinned ? 'Turno bloccato: sbloccalo con la puntina per modificarlo' : undefined}
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
                              {person && ivChip && (() => { const info = ivChip(s.id); return info ? <InterventionChip info={info} className="mt-1" /> : null })()}
                            </div>
                          )
                        })}
                      </div>
                      {status && (
                        <div className="mt-1.5 flex flex-col gap-1 border-t border-emerald-200 pt-1.5">
                          {state === 'consuntivato'
                            ? <span className="inline-flex self-start rounded-md bg-indigo-50 px-1.5 py-px text-[10px] font-semibold text-indigo-800 ring-1 ring-inset ring-indigo-200" title={`Consuntivato da ${status.consuntivatoByName ?? ''} il ${fmtStamp(status.consuntivatoAt)}: interventi chiusi`}>Consuntivato</span>
                            : <span className="inline-flex self-start rounded-md bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200" title={`Erogato da ${status.erogatoByName} il ${fmtStamp(status.erogatoAt)}: turni definitivi`}>Erogato · {shortName(status.erogatoByName)} {fmtShort(status.erogatoAt)}</span>}
                          {(perms?.close && state === 'erogato') || perms?.unlock ? (
                            <span className="no-print flex flex-wrap gap-1">
                              {perms?.close && state === 'erogato' && <button type="button" onClick={() => setDialog({ kind: 'close', day })} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 ring-1 ring-inset ring-indigo-300 hover:bg-indigo-50">Consuntiva</button>}
                              {perms?.unlock && <button type="button" onClick={() => setDialog({ kind: 'unlock', day })} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-white">Sblocca</button>}
                            </span>
                          ) : null}
                        </div>
                      )}
                      {!status && perms?.mark && hasShift && (shiftEnded(day, assignments, now) ? (
                        <button type="button" onClick={() => setDialog({ kind: 'mark', day })}
                          className="no-print mt-1.5 rounded-md bg-white px-1.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-300 hover:bg-emerald-50">✓ Segna erogato</button>
                      ) : day <= today && (
                        <span className="no-print mt-1.5 text-[10px] text-slate-500">Erogabile a fine turno: {fmtEnd(dayShiftEnd(day, assignments))}</span>
                      ))}
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
        {!simple && <aside className="no-print xl:sticky xl:top-[calc(var(--app-header-h,57px)_+_var(--planner-bar-h,0px)_+_var(--planner-band-h,0px)_+_0.75rem)] xl:max-h-[calc(100vh_-_var(--app-header-h,57px)_-_var(--planner-bar-h,0px)_-_var(--planner-band-h,0px)_-_1.5rem)] xl:self-start xl:overflow-y-auto">
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
                        <div className="pl-4.5 text-[11px] text-slate-500">{p.reserve && <span className="font-semibold text-violet-700">Riserva n. {p.reserveOrder} · </span>}{p.preferredDays?.includes(focusSlot.date) && <span className="font-semibold text-emerald-700">Ha dato disponibilità per questo giorno · </span>}{availabilityLabel(p)}{preferredMax(p) !== undefined ? ` · ${monthCount(p.id, focusSlot.date)} assegnati nel mese` : ''}</div>
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
              <li>Max 2 turni/settimana ISO</li>
              <li>Max 4 turni/mese solare</li>
              <li>Weekend/festivo in W ⇒ niente weekend/festivi in W+1</li>
            </ol>
            <p className="mt-2 border-t border-slate-200 pt-2"><span className="font-semibold text-amber-700">⚠ Oltre disponibilità</span>: assegnabile a mano, ma supera il massimo mensile indicato dalla persona. L'auto-compilazione non lo fa mai.</p>
            <p className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-2"><PinIcon filled className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" /> Con la puntina blocchi un turno assegnato: non è modificabile e l'auto-compilazione ricalcola tutti gli altri tenendolo fisso.</p>
            <p className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-2"><LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Con il lucchetto blocchi un giorno non richiesto dal cliente: resta fuori dalla rotazione, dall'auto-compilazione, dai ricavi e dall'export.</p>
            <p className="mt-2 border-t border-slate-200 pt-2"><span className="font-semibold text-emerald-800">Segna erogato</span> (Full edit, super admin, director del team, dalla fine del turno: 18:00 per il diurno, 09:00 del giorno dopo per la notte): il giorno diventa definitivo, turni e persone non si cambiano più ed entra nel consuntivo. <span className="font-semibold text-indigo-800">Consuntiva</span>: chiude l'inserimento degli interventi del giorno (anche per tutto il mese, dal Consuntivo). <span className="font-semibold">Sblocca</span>: solo director del team o super admin, un passo indietro alla volta; resta traccia di chi e quando.</p>
          </div>
        </aside>}
      </div>
      {dialog && dayActions && <DayDialog kind={dialog.kind} day={dialog.day} state={dayState(days, dialog.day)} people={people} assignments={assignments} actions={dayActions} onClose={() => setDialog(null)} />}
    </div>
  )
}

/** '2026-11-21T09:00' → 'ore 09:00 del 21/11' */
const fmtEnd = (end: string | null) => (end ? `ore ${end.slice(11, 16)} del ${end.slice(8, 10)}/${end.slice(5, 7)}` : '')
const fmtShort = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' }) : '')
const fmtStamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '')

/** Conferma di Segna erogato, Consuntiva e Sblocca, con l'effetto spiegato. */
function DayDialog({ kind, day, state, people, assignments, actions, onClose }: { kind: 'mark' | 'close' | 'unlock'; day: string; state: ReturnType<typeof dayState>; people: Person[]; assignments: Assignments; actions: DayActions; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const byId = new Map(people.map((p) => [p.id, p]))
  const shifts = slotsForDay(day).map((s) => ({ s, p: byId.get(assignments[s.id]) }))
  const title = kind === 'mark' ? `Confermi che ${fmtDayYear(day)} è stato erogato?`
    : kind === 'close' ? `Consuntivare ${fmtDayYear(day)}?`
    : `Sbloccare ${fmtDayYear(day)}?`
  const run = async () => {
    setBusy(true)
    setError('')
    try {
      if (kind === 'mark') await actions.mark(day)
      else if (kind === 'close') await actions.close(day)
      else await actions.unlock(day, note)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="day-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="day-title" className="text-lg font-semibold text-slate-900">{title}</h3>
        <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
          {shifts.map(({ s, p }) => <li key={s.id}>{SLOT_LABEL[s.kind]} {SLOT_HOURS[s.kind]} · {p ? <strong>{p.name}</strong> : <span className="text-amber-800">scoperto</span>}</li>)}
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          {kind === 'mark' && <>Dopo la conferma il giorno è <strong>definitivo</strong>: turni e persone non si cambiano più ed entra nel consuntivo come erogato. Il Turnista può ancora segnalare o correggere interventi finché il giorno non viene <strong>consuntivato</strong>.</>}
          {kind === 'close' && <>Si chiude l'inserimento di <strong>nuovi interventi</strong> su questo giorno. Quelli già segnalati restano e si possono ancora approvare o rifiutare.</>}
          {kind === 'unlock' && (state === 'consuntivato'
            ? <>Il giorno torna <strong>erogato</strong>: si riapre l'inserimento degli interventi. Resta traccia di chi e quando.</>
            : <>Il giorno torna <strong>modificabile</strong>: turni e persone si possono di nuovo cambiare ed esce dagli importi erogati. Resta traccia di chi e quando.</>)}
        </p>
        {kind === 'unlock' && (
          <label className="mt-3 block text-sm">
            <span className="text-xs font-medium text-slate-600">Motivo (facoltativo, resta nella traccia)</span>
            <textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300" />
          </label>
        )}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button variant="primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Attendi…' : kind === 'mark' ? 'Conferma erogato' : kind === 'close' ? 'Consuntiva' : 'Sblocca'}
          </Button>
        </div>
      </div>
    </div>
  )
}
