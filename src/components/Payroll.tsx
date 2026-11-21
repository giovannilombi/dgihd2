import { Fragment, useState } from 'react'
import { daysInRange, fmtDay, monthKey, SLOT_BY_ID } from '../lib/calendar'
import { dayState, type DayStatusMap } from '../lib/dayStatus'
import { fmtEur } from '../lib/economics'
import { payroll, slotTag, type NdData } from '../lib/reports'
import type { Assignments, Params, Person } from '../lib/types'
import { Badge, Button } from './ui'
import { payRal, type Intervention, type ShiftChipInfo } from '../lib/interventions'
import { personOvertime } from '../lib/overtime'
import { InterventionChip } from './InterventionChip'

interface Props {
  people: Person[]
  assignments: Assignments
  params: Params
  nd?: NdData
  /** Giorni erogati e consuntivati: negli importi erogati entrano solo i turni dei giorni erogati. */
  days?: DayStatusMap
  /** Può consuntivare un mese intero (Super admin, Governance, Director, HR). */
  canCloseMonth?: boolean
  onCloseMonth?: (month: string) => Promise<number>
  /** Interventi (si liquidano solo gli approvati) e stato degli interventi del turno */
  interventions?: Intervention[]
  ivChip?: (slotId: string) => ShiftChipInfo | null
  /** Importi degli interventi visibili per la persona (HR, Governance, director del team) */
  showAmounts?: (p: Person) => boolean
}

const STATE_BADGE = {
  aperto: <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">Da erogare</span>,
  erogato: <span className="inline-flex rounded-md bg-emerald-50 px-1.5 py-px text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">Erogato</span>,
  consuntivato: <span className="inline-flex rounded-md bg-indigo-50 px-1.5 py-px text-[11px] font-semibold text-indigo-800 ring-1 ring-inset ring-indigo-200">Consuntivato</span>,
}

export function Payroll({ people, assignments, params, nd, days = {}, canCloseMonth = false, onCloseMonth, interventions = [], ivChip, showAmounts = () => false }: Props) {
  const months = payroll(people, assignments, params, nd)
  const [closing, setClosing] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  /** Giorni erogati del mese (di calendario) ancora da consuntivare. */
  const toClose = (m: string) => daysInRange().filter((d) => monthKey(d) === m && dayState(days, d) === 'erogato').length
  const closeMonth = async (m: string, label: string) => {
    if (!onCloseMonth) return
    if (!confirm(`Consuntivare ${label}? Su tutti i giorni erogati del mese si chiude l'inserimento di nuovi interventi; quelli già segnalati si possono ancora approvare o rifiutare.`)) return
    setClosing(m)
    setNotice(null)
    try {
      const n = await onCloseMonth(m)
      setNotice({ tone: 'ok', text: n ? `${label}: ${n} ${n === 1 ? 'giorno consuntivato' : 'giorni consuntivati'}.` : `${label}: nessun giorno da consuntivare tra quelli su cui hai il permesso.` })
    } catch (e) {
      setNotice({ tone: 'error', text: `Consuntivazione non riuscita: ${(e as Error).message}` })
    } finally {
      setClosing(null)
    }
  }
  const erogato = (sid: string) => !!days[SLOT_BY_ID[sid]?.date ?? '']
  // Straordinario degli interventi approvati, per persona (prime ore feriali diurne contate per giorno)
  const otBySlot = new Map<string, { minutes: number; hours: number; amount: number | null; calls: number }>()
  for (const p of people) {
    const approved = interventions.filter((x) => x.personId === p.id && x.status === 'approved')
    if (!approved.length) continue
    const ot = personOvertime(approved, payRal(p), params)
    for (const item of ot.items) {
      const slot = approved.find((x) => x.id === item.id)!.slot
      const cur = otBySlot.get(slot) ?? { minutes: 0, hours: 0, amount: 0, calls: 0 }
      otBySlot.set(slot, { minutes: cur.minutes + item.minutes, hours: cur.hours + item.hours, amount: cur.amount === null || item.amount === null ? null : cur.amount + item.amount + params.callFee, calls: cur.calls + 1 })
    }
  }
  const hasIv = interventions.length > 0 || !!ivChip
  const pendingNd = people.filter((x) => x.ralNd && !x.salaryHidden && !nd?.[x.id] && Object.values(assignments).includes(x.id)).length
  const pendingNote = pendingNd > 0 && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Calcolo in corso per {pendingNd === 1 ? '1 persona' : `${pendingNd} persone`} con RAL Q/: i loro importi vengono calcolati dal server.</p>
  if (!months.length) return pendingNote || <p className="text-sm text-slate-500">Nessun turno assegnato: compila il calendario (Sezione C) per generare il consuntivo.</p>
  return (
    <div className="space-y-8">
      {pendingNote}
      <p className="text-sm text-slate-600">
        Per ogni turno: <em>Indennità CCNL</em> (dovuta per contratto) + <em>Gettone integrativo</em> (voce dedicata in busta) = <em>Totale lordo</em>, che corrisponde al <em>Netto di riferimento</em> del turno (il netto effettivo dipende dalla situazione fiscale di ciascuno). Ogni settimana confluisce nel consuntivo del mese in cui è stato svolto il suo ultimo turno.
        Si liquidano solo i turni dei giorni <strong>erogati</strong>: gli altri restano indicati in grigio, con l'importo previsto.
      </p>
      {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${notice.tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{notice.text}</p>}
      {months.map((m) => (
        <div key={m.key}>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-base font-semibold text-slate-900">Consuntivo {m.label}</h3>
            {canCloseMonth && toClose(m.key) > 0 && (
              <Button disabled={closing !== null} onClick={() => void closeMonth(m.key, m.label)} title="Chiude l'inserimento degli interventi su tutti i giorni erogati del mese">
                {closing === m.key ? 'Consuntivazione…' : `Consuntiva il mese (${toClose(m.key)} ${toClose(m.key) === 1 ? 'giorno erogato' : 'giorni erogati'})`}
              </Button>
            )}
          </div>
          <div className="space-y-4">
            {m.rows.map((r) => {
              const slots = r.weeks.flatMap((w) => w.slots.map((s, i) => ({ s, e: w.days[i] })))
              const done = slots.filter((x) => erogato(x.s.id))
              const erogatoLtot = done.reduce((t, x) => t + x.e.ltot, 0)
              const ot = slots.map((x) => otBySlot.get(x.s.id)).filter((x): x is NonNullable<typeof x> => !!x)
              const otHours = ot.reduce((t, x) => t + x.hours, 0)
              const otAmount = ot.some((x) => x.amount === null) ? null : ot.reduce((t, x) => t + (x.amount ?? 0), 0)
              const seeAmounts = showAmounts(r.person)
              return (
              <div key={r.person.id} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-50 px-4 py-2.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: r.person.color }} />
                  <span className="font-semibold text-slate-900">{r.person.name}</span>
                  {r.person.ralNd ? <Badge tone="slate">RAL Q/: importi stimati</Badge> : !(r.person.ral > 0) && <Badge tone="amber">RAL da inserire: importi stimati</Badge>}
                  {otHours > 0 && (
                    <span className="num text-sm text-slate-700" title="Interventi approvati, pagati come straordinario CCNL + compenso per chiamata">
                      Straordinario <strong>{otHours} h</strong>{seeAmounts && <> · <strong>{otAmount === null ? (r.person.ralNd ? 'RAL Q/: inserire la RAL puntuale' : 'RAL da inserire') : fmtEur(otAmount)}</strong></>}
                    </span>
                  )}
                  <span className="num ml-auto text-sm text-slate-700">Lordo erogato <strong>{fmtEur(erogatoLtot)}</strong> ({done.length}/{slots.length} turni) · Previsto <strong>{fmtEur(r.totals.ltot)}</strong> · Netto di rif. <strong>{fmtEur(r.totals.net)}</strong> · Costo aziendale <strong>{fmtEur(r.totals.cost)}</strong></span>
                </div>
                <div className="overflow-x-auto">
                  <table className={`num w-full ${hasIv ? "min-w-[1180px]" : "min-w-[800px]"} table-fixed text-sm`}>
                    {/* larghezze fisse: le colonne restano allineate tra le schede delle diverse persone */}
                    <colgroup>
                      <col className="w-36" /><col className="w-52" /><col className="w-32" />
                      <col /><col /><col /><col />
                      {hasIv && <><col className="w-40" /><col className="w-32" /></>}
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2 font-medium">Settimana</th>
                        <th className="py-2 pr-3 font-medium">Giorno e fascia</th>
                        <th className="py-2 pr-3 font-medium" title="Si liquidano solo i turni dei giorni erogati">Stato</th>
                        <th className="py-2 pr-3 text-right font-medium" title="Indennità di reperibilità prevista dal CCNL (lordo)">Indennità CCNL</th>
                        <th className="py-2 pr-3 text-right font-semibold text-blue-800" title="Importo aggiuntivo da erogare come gettone integrativo (lordo)">Gettone integrativo</th>
                        <th className="py-2 pr-3 text-right font-medium" title="Indennità CCNL + gettone">Totale lordo</th>
                        <th className="py-2 pr-4 text-right font-medium" title="Netto di riferimento del turno">Netto di rif.</th>
                        {hasIv && <th className="py-2 pr-3 font-medium" title="Interventi del turno: ore riconosciute degli approvati">Interventi</th>}
                        {hasIv && <th className="py-2 pr-4 text-right font-medium" title="Straordinario degli interventi approvati + compenso per chiamata (lordo). Visibile a HR, Governance e director del team">Straordinario</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {r.weeks.map((w) => {
                        const multi = w.slots.length > 1
                        const span = w.slots.length + (multi ? 1 : 0)
                        return (
                          <Fragment key={w.week}>
                            {w.slots.map((s, i) => {
                              const e = w.days[i]
                              const last = !multi && i === w.slots.length - 1
                              return (
                                <tr key={s.id} className={`align-top ${last ? 'border-b border-slate-200' : ''} ${erogato(s.id) ? '' : 'text-slate-400'}`}>
                                  {i === 0 && <td rowSpan={span} className="border-b border-slate-200 px-4 py-2 whitespace-nowrap text-slate-600">dal {fmtDay(w.week)}</td>}
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{slotTag(s.id)}</td>
                                  <td className="py-1.5 pr-3">{STATE_BADGE[dayState(days, s.date)]}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtEur(e.iccnl)}</td>
                                  <td className={`py-1.5 pr-3 text-right font-semibold ${erogato(s.id) ? 'text-slate-900' : ''}`}>{fmtEur(e.lcomp)}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtEur(e.ltot)}</td>
                                  <td className="py-1.5 pr-4 text-right">{fmtEur(e.net)}</td>
                                  {hasIv && (() => {
                                    const info = ivChip?.(s.id)
                                    const o = otBySlot.get(s.id)
                                    return (
                                      <>
                                        <td className="py-1.5 pr-3"><span className="flex flex-wrap items-center gap-1">{info && <InterventionChip info={info} />}{o && <span className="text-xs text-slate-700">{o.hours} h</span>}</span></td>
                                        <td className="py-1.5 pr-4 text-right">{o ? (seeAmounts ? (o.amount === null ? <span className="text-xs text-amber-800">solo ore</span> : fmtEur(o.amount)) : <span className="text-slate-300">—</span>) : ''}</td>
                                      </>
                                    )
                                  })()}
                                </tr>
                              )
                            })}
                            {multi && (
                              <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-700">
                                <td className="py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-slate-500" colSpan={2}>Totale settimana (previsto)</td>
                                <td className="py-1.5 pr-3 text-right font-medium">{fmtEur(w.iccnl)}</td>
                                <td className="py-1.5 pr-3 text-right font-semibold text-slate-900">{fmtEur(w.lcomp)}</td>
                                <td className="py-1.5 pr-3 text-right font-medium">{fmtEur(w.ltot)}</td>
                                <td className="py-1.5 pr-4 text-right font-medium">{fmtEur(w.net)}</td>
                                {hasIv && <><td /><td /></>}
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                      <tr className="bg-slate-50 font-semibold">
                        <td className="px-4 py-2" colSpan={3}>Totale previsto {m.label} · {r.totals.slots} {r.totals.slots === 1 ? 'turno' : 'turni'}</td>
                        <td className="py-2 pr-3 text-right">{fmtEur(r.totals.iccnl)}</td>
                        <td className="py-2 pr-3 text-right text-blue-800">{fmtEur(r.totals.lcomp)}</td>
                        <td className="py-2 pr-3 text-right">{fmtEur(r.totals.ltot)}</td>
                        <td className="py-2 pr-4 text-right">{fmtEur(r.totals.net)}</td>
                        {hasIv && <td className="py-2 pr-3">{otHours > 0 ? `${otHours} h` : ''}</td>}
                        {hasIv && <td className="py-2 pr-4 text-right">{otHours > 0 && seeAmounts ? (otAmount === null ? <span className="text-xs font-normal text-amber-800">solo ore</span> : fmtEur(otAmount)) : ''}</td>}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
