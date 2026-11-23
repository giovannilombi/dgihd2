import { useMemo, useState } from 'react'
import { daysInRange, fmtDay, monthKey } from '../lib/calendar'
import { dayState, romeNow, romeToday, type DayStatusMap } from '../lib/dayStatus'
import { buildHoursReport, buildHoursXlsx, hoursFileName, SHIFT_CAT_LABEL, SHIFT_CATS } from '../lib/hoursReport'
import type { Intervention } from '../lib/interventions'
import { BAND_LABEL, BANDS, fmtMinutes } from '../lib/overtime'
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
  /** Può consuntivare un mese intero (Space admin, Governance, Director, HR) */
  canCloseMonth?: boolean
  onCloseMonth?: (month: string) => Promise<number>
}

const dur = (m: number) => (m > 0 ? fmtMinutes(m) : '–')
const th = 'py-2 pr-3 font-medium'

/**
 * Riepilogo per le paghe, senza importi: per persona i turni per categoria (giorno di riferimento =
 * giorno di inizio) e gli interventi approvati in ore, per fascia. Da qui si consuntiva il mese e si
 * esporta il file per l'ufficio paghe.
 */
export function HoursSummary({ people, assignments, params, days, interventions, noInt, defaultTeam = null, canCloseMonth = false, onCloseMonth }: Props) {
  const teams = useTeams()
  const { months, weeks } = useMemo(() => payPeriods(), [])
  const today = romeToday()
  const [kind, setKind] = useState<'month' | 'week'>('month')
  const [monthSel, setMonthSel] = useState(() => (months.find((m) => m.from <= today && today <= m.to) ?? months[0]).key)
  const [weekSel, setWeekSel] = useState(() => (weeks.find((w) => w.from <= today && today <= w.to) ?? weeks[0]).key)
  const [team, setTeam] = useState<TeamId | null>(defaultTeam)
  const [busy, setBusy] = useState<'export' | 'close' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const period: PayPeriod = kind === 'month' ? months.find((m) => m.key === monthSel)! : weeks.find((w) => w.key === weekSel)!
  const report = useMemo(
    () => buildHoursReport({ people, assignments, params, days, interventions, noInt, now: romeNow() }, period, team),
    [people, assignments, params, days, interventions, noInt, period, team],
  )
  const rows = report.people
  const empty = !report.shifts.length && !report.interventions.length

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
  const exportXlsx = async () => {
    setBusy('export')
    setNotice(null)
    try {
      download(hoursFileName(period), await buildHoursXlsx(report, teams, params), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (e) {
      setNotice({ tone: 'error', text: `Export non riuscito: ${(e as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0)
  const select = 'rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Periodo">
          {([['month', 'Mese'], ['week', 'Settimana']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1.5 font-medium ${kind === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
          ))}
        </div>
        <label className="text-xs font-medium text-slate-600">
          <span className="sr-only">{kind === 'month' ? 'Mese' : 'Settimana'}</span>
          {kind === 'month' ? (
            <select value={monthSel} onChange={(e) => setMonthSel(e.target.value)} className={select}>
              {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          ) : (
            <select value={weekSel} onChange={(e) => setWeekSel(e.target.value)} className={select}>
              {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          )}
        </label>
        <label className="text-xs font-medium text-slate-600">
          <span className="sr-only">Team</span>
          <select value={team ?? ''} onChange={(e) => setTeam(e.target.value || null)} className={select}>
            <option value="">Tutti i team</option>
            {teams.list.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          {canCloseMonth && toClose > 0 && (
            <Button disabled={busy !== null} onClick={() => void closeMonth()} title="Chiude l'inserimento degli interventi su tutti i giorni erogati del mese">
              {busy === 'close' ? 'Consuntivazione…' : `Consuntiva il mese (${toClose} ${toClose === 1 ? 'giorno erogato' : 'giorni erogati'})`}
            </Button>
          )}
          <Button variant="primary" disabled={busy !== null || empty} onClick={() => void exportXlsx()}>{busy === 'export' ? 'Preparazione…' : 'Esporta per paghe (Excel)'}</Button>
        </div>
      </div>

      {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${notice.tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{notice.text}</p>}
      {report.notes.map((n) => <p key={n} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{n}</p>)}
      <p className="text-sm text-slate-600">
        Solo turni dei giorni <strong>erogati</strong> e interventi <strong>approvati</strong>. Il turno conta nel giorno in cui <strong>inizia</strong>: la notte di domenica, dalle 18:00 alle 09:00 di lunedì, è "domenica/festivo notturno".
        Le ore di intervento sono divise per fascia secondo il giorno e l'ora di ogni minuto. Il file Excel ha anche il dettaglio di turni e interventi.
      </p>

      {empty ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Nel periodo non ci sono ancora turni erogati né interventi approvati{team ? ` per il team ${teamLabel(teams, team)}` : ''}.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="num w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className={`${th} pl-4`} rowSpan={2}>Persona</th>
                <th className="pt-2 pr-3 text-center font-semibold text-slate-700" colSpan={SHIFT_CATS.length + 1}>Turni</th>
                <th className="pt-2 pr-3 text-center font-semibold text-slate-700" colSpan={BANDS.length + 2}>Interventi approvati</th>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                {SHIFT_CATS.map((c) => <th key={c} className={`${th} text-right`}>{SHIFT_CAT_LABEL[c]}</th>)}
                <th className={`${th} text-right`}>Totale</th>
                <th className={`${th} text-right`}>N.</th>
                {BANDS.map((b) => <th key={b} className={`${th} text-right`} title="Durata effettiva nella fascia">{BAND_LABEL[b]}</th>)}
                <th className={`${th} text-right`} title="Minimo, tolleranza e arrotondamento applicati">Ore riconosciute</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.person.id} className="border-b border-slate-100">
                  <td className="py-2 pl-4 pr-3"><div className="font-medium text-slate-900">{r.person.name}</div><div className="text-xs text-slate-500">{teamLabel(teams, r.person.team)}</div></td>
                  {SHIFT_CATS.map((c) => <td key={c} className={`py-2 pr-3 text-right ${r.shifts[c] ? 'text-slate-900' : 'text-slate-300'}`}>{r.shifts[c] || '–'}</td>)}
                  <td className="py-2 pr-3 text-right font-semibold text-slate-900">{r.totalShifts}</td>
                  <td className={`py-2 pr-3 text-right ${r.interventions ? 'text-slate-900' : 'text-slate-300'}`}>{r.interventions || '–'}</td>
                  {BANDS.map((b) => <td key={b} className={`py-2 pr-3 text-right ${r.effective[b] ? 'text-slate-700' : 'text-slate-300'}`}>{dur(r.effective[b])}</td>)}
                  <td className={`py-2 pr-3 text-right ${r.hours ? 'font-semibold text-slate-900' : 'text-slate-300'}`}>{r.hours ? `${r.hours} h` : '–'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-900">
                <td className="py-2 pl-4 pr-3">Totale</td>
                {SHIFT_CATS.map((c) => <td key={c} className="py-2 pr-3 text-right">{sum((r) => r.shifts[c])}</td>)}
                <td className="py-2 pr-3 text-right">{report.shifts.length}</td>
                <td className="py-2 pr-3 text-right">{report.interventions.length}</td>
                {BANDS.map((b) => <td key={b} className="py-2 pr-3 text-right">{dur(sum((r) => r.effective[b]))}</td>)}
                <td className="py-2 pr-3 text-right">{sum((r) => r.hours)} h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {report.interventions.length > 0 && (
        <Collapsible title={<span className="font-medium">Dettaglio degli interventi approvati ({report.interventions.length})</span>}>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className={th}>Persona</th><th className={th}>Turno</th><th className={th}>Orario</th><th className={`${th} text-right`}>Durata</th>
                  {BANDS.map((b) => <th key={b} className={`${th} text-right`}>{BAND_LABEL[b]}</th>)}
                  <th className={`${th} text-right`}>Ore riconosciute</th>
                </tr>
              </thead>
              <tbody>
                {report.interventions.map((o) => (
                  <tr key={o.iv.id} className="border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-3 font-medium text-slate-900">{o.person.name}</td>
                    <td className="py-1.5 pr-3 text-slate-700">{fmtDay(o.date)} · {SHIFT_CAT_LABEL[o.cat]}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-slate-700">{fmtDay(o.iv.start.slice(0, 10))} {o.iv.start.slice(11, 16)} → {o.iv.end.slice(0, 10) === o.iv.start.slice(0, 10) ? '' : `${fmtDay(o.iv.end.slice(0, 10))} `}{o.iv.end.slice(11, 16)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtMinutes(o.minutes)}</td>
                    {BANDS.map((b) => <td key={b} className={`py-1.5 pr-3 text-right ${o.effective[b] ? 'text-slate-700' : 'text-slate-300'}`}>{dur(o.effective[b])}</td>)}
                    <td className="py-1.5 pr-3 text-right font-semibold">{o.hours} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}
    </div>
  )
}
