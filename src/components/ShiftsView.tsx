import { useCallback, useEffect, useState } from 'react'
import {
  HOLIDAYS, HORIZON_LABEL, HORIZON_MONTHS, SLOT_HOURS, SLOT_LABEL,
  addDays, daysInRange, fmtDay, isoWeekNumber, monthKey, monthLabel, slotsForDay, weekStart,
} from '../lib/calendar'
import type { Profile } from '../lib/roles'
import { mySlots, parseTurnistaCalendar, slotCell, type CellTone, type TurnistaCalendar } from '../lib/shiftsView'
import { supabase } from '../lib/supabase'
import { useHeightVar } from '../lib/useStickyBar'
import { Section } from './ui'
import { UserMenu } from './UserMenu'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const REFRESH_MS = 5 * 60_000

/** Data di oggi (fuso locale) in formato AAAA-MM-GG. */
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const CHIP: Record<CellTone, string> = {
  mine: 'rounded-md bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white',
  named: 'truncate rounded-md border-l-4 bg-white px-2 py-0.5 text-xs font-medium text-slate-800 ring-1 ring-slate-200',
  covered: 'rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600',
  empty: 'px-2 py-0.5 text-xs italic text-slate-400',
}

/**
 * Vista del Turnista: solo il calendario dei turni, con i propri evidenziati. I dati arrivano dalla
 * funzione del database `turnista_calendar()`, che include i nomi degli altri solo se il super admin
 * lo consente; si aggiornano ogni 5 minuti e quando si torna sulla scheda.
 */
export function TurnistaApp({ profile, onLogout, onChangePassword }: { profile: Profile; onLogout: () => void; onChangePassword: (pwd: string) => Promise<void> }) {
  const [cal, setCal] = useState<TurnistaCalendar | null>(null)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const headerRef = useHeightVar('--app-header-h')

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('turnista_calendar')
    if (err) { setError(`Calendario non disponibile: ${err.message}`); return }
    try {
      setCal(parseTurnistaCalendar(data))
      setError('')
      setUpdatedAt(new Date())
    } catch (e) {
      setError(`Calendario non disponibile: ${(e as Error).message}`)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [load])

  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <span className="font-semibold text-slate-900">Piano reperibilità <span className="text-blue-700">- ARM</span></span>
          <span className="rounded-md bg-blue-50 px-2.5 py-1.5 text-sm font-medium text-blue-800 ring-1 ring-blue-200">Calendario turni</span>
          <div className="ml-auto flex items-center gap-2">
            {updatedAt && <span className="hidden text-xs text-slate-400 md:inline">Aggiornato alle {updatedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>}
            <UserMenu profile={profile} onLogout={onLogout} onChangePassword={onChangePassword} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-6">
        {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {cal ? <ShiftsCalendar cal={cal} /> : !error && <p className="py-10 text-center text-sm text-slate-500">Caricamento del calendario…</p>}
      </main>
    </div>
  )
}

function ShiftsCalendar({ cal }: { cal: TurnistaCalendar }) {
  const today = todayIso()
  const excluded = new Set(cal.excluded)
  const mine = mySlots(cal)
  const upcoming = mine.filter((s) => s.date >= today).length
  return (
    <>
      {cal.me ? (
        <Section id="miei-turni" title="I miei turni"
          subtitle={mine.length ? `${mine.length} ${mine.length === 1 ? 'turno' : 'turni'} nel periodo${upcoming !== mine.length ? `, ${upcoming} da svolgere` : ''}.` : undefined}>
          {mine.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {mine.map((s) => {
                const past = s.date < today
                return (
                  <li key={s.id} className={`flex flex-wrap items-baseline gap-x-2 rounded-lg px-3 py-2 ring-1 ${past ? 'bg-slate-50 text-slate-400 ring-slate-200' : 'bg-blue-50 text-blue-950 ring-blue-200'}`}>
                    <span className="font-semibold capitalize">{fmtDay(s.date)}</span>
                    <span className="text-sm">{SLOT_LABEL[s.kind]} {SLOT_HOURS[s.kind]}</span>
                    {HOLIDAYS[s.date] && <span className="text-xs">{HOLIDAYS[s.date]}</span>}
                    {past && <span className="ml-auto text-xs">passato</span>}
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-slate-500">Nessun turno assegnato nel periodo.</p>}
        </Section>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Il tuo account non è ancora collegato alla tua scheda nel piano: chiedi al super admin di collegarlo per vedere evidenziati i tuoi turni.
        </p>
      )}

      <Section id="calendario-turni" title={`Calendario turni ${HORIZON_LABEL}`}
        subtitle={cal.mode === 'own' ? 'I tuoi turni sono evidenziati; gli altri turni assegnati compaiono come "Turno coperto".' : 'I tuoi turni sono evidenziati.'}>
        <div className="space-y-8">
          {HORIZON_MONTHS.map((m) => <MonthGrid key={m} m={m} cal={cal} excluded={excluded} today={today} />)}
        </div>
      </Section>
    </>
  )
}

function MonthGrid({ m, cal, excluded, today }: { m: string; cal: TurnistaCalendar; excluded: Set<string>; today: string }) {
  const days = daysInRange().filter((d) => monthKey(d) === m)
  if (!days.some((d) => !excluded.has(d))) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-100 px-4 py-2.5 text-slate-600">
        <h3 className="text-base font-semibold uppercase tracking-wide">{monthLabel(m)}</h3>
        <span className="text-sm">Nessuna reperibilità richiesta</span>
      </div>
    )
  }
  // Solo le settimane con almeno un giorno richiesto nel mese: le altre non dicono nulla al Turnista
  const weeks: string[] = []
  for (let w = weekStart(days[0]); w <= days[days.length - 1]; w = addDays(w, 7)) {
    if (Array.from({ length: 7 }, (_, i) => addDays(w, i)).some((d) => monthKey(d) === m && !excluded.has(d))) weeks.push(w)
  }
  const mineCount = Object.values(cal.slots).filter((s) => s.mine && monthKey(s.slot) === m).length
  return (
    <section aria-label={monthLabel(m)}>
      {/* Fascia del mese fissa sotto l'intestazione finché si scorre quel mese, come nel calendario principale */}
      <div className="sticky top-[var(--app-header-h,57px)] z-20 bg-white pb-3">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-700 px-4 py-2.5 text-white">
          <h3 className="text-lg font-semibold uppercase tracking-wide">{monthLabel(m)}</h3>
          {cal.me && <span className="text-sm text-blue-100">{mineCount ? `${mineCount} ${mineCount === 1 ? 'tuo turno' : 'tuoi turni'}` : 'Nessun tuo turno'}</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div />
            {WEEKDAYS.map((d) => <div key={d} className="px-1">{d}</div>)}
          </div>
          {weeks.map((w) => (
            <div key={w} className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-1 pb-1">
              <div className="pt-2 text-xs font-medium text-slate-400">W{isoWeekNumber(w)}</div>
              {Array.from({ length: 7 }, (_, i) => addDays(w, i)).map((day) =>
                monthKey(day) === m ? <DayCell key={day} day={day} cal={cal} off={excluded.has(day)} past={day < today} /> : <div key={day} />)}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DayCell({ day, cal, off, past }: { day: string; cal: TurnistaCalendar; off: boolean; past: boolean }) {
  const slots = slotsForDay(day)
  const festive = slots.length > 1
  const mineHere = !off && slots.some((s) => cal.slots[s.id]?.mine)
  const frame = off ? 'border-slate-200 bg-slate-50'
    : mineHere ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
    : festive ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-white'
  return (
    <div className={`min-h-[84px] rounded-lg border p-1.5 ${frame} ${past ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span className={`text-sm font-semibold ${off ? 'text-slate-400' : 'text-slate-800'}`}>{Number(day.slice(8))}</span>
        {HOLIDAYS[day] && <span className="truncate text-[10px] text-slate-500">{HOLIDAYS[day]}</span>}
      </div>
      {off ? <p className="mt-2 text-[11px] text-slate-400">Nessuna reperibilità</p> : slots.map((s) => {
        const c = slotCell(cal.slots[s.id])
        return (
          <div key={s.id} className="mt-1">
            <div className="text-[10px] text-slate-500">{SLOT_LABEL[s.kind]} {SLOT_HOURS[s.kind]}</div>
            <div className={CHIP[c.tone]} style={c.tone === 'named' && c.color ? { borderLeftColor: c.color } : undefined} title={c.text}>{c.text}</div>
          </div>
        )
      })}
    </div>
  )
}
