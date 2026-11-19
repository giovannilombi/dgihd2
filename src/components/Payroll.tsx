import { Fragment } from 'react'
import { fmtDay } from '../lib/calendar'
import { fmtEur, fmtHours, fmtNum, slotEconomics } from '../lib/economics'
import { payroll, slotTag } from '../lib/reports'
import type { Assignments, Params, Person } from '../lib/types'
import { Badge } from './ui'

export function Payroll({ people, assignments, params }: { people: Person[]; assignments: Assignments; params: Params }) {
  const months = payroll(people, assignments, params)
  if (!months.length) return <p className="text-sm text-slate-500">Nessun turno assegnato: compila il calendario (Sezione C) per generare il consuntivo.</p>
  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-600">
        Per ogni turno: <em>Indennità CCNL</em> (dovuta per contratto) + <em>Gettone</em> (da erogare come <strong>Gettone di disponibilità</strong>, modalità preferibile) = <em>Totale lordo</em>, che al netto delle trattenute stimate garantisce il <em>Netto</em> della fascia. Ogni settimana confluisce nel consuntivo del mese in cui è stato svolto il suo ultimo turno. Le colonne <em>Alternativa</em> riportano, per la settimana e a parità di importo del gettone, il giorno (Domenica o Sabato della stessa settimana, anche nel mese adiacente) e le ore di straordinario da caricare se si sceglie la liquidazione in ore.
      </p>
      {months.map((m) => (
        <div key={m.key}>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">Consuntivo {m.label}</h3>
          <div className="space-y-4">
            {m.rows.map((r) => (
              <div key={r.person.id} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-50 px-4 py-2.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: r.person.color }} />
                  <span className="font-semibold text-slate-900">{r.person.name}</span>
                  {r.person.ralNd ? <Badge tone="slate">RAL Q/: importi stimati</Badge> : !(r.person.ral > 0) && <Badge tone="amber">RAL da inserire: importi stimati, ore non calcolabili</Badge>}
                  <span className="num ml-auto text-sm text-slate-700">Totale lordo <strong>{fmtEur(r.totals.ltot)}</strong> · Netto garantito <strong>{fmtEur(r.totals.net)}</strong> · Costo aziendale <strong>{fmtEur(r.totals.cost)}</strong></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="num w-full min-w-[1040px] table-fixed text-sm">
                    {/* larghezze fisse: le colonne restano allineate tra le schede delle diverse persone */}
                    <colgroup>
                      <col className="w-36" /><col className="w-52" />
                      <col className="w-32" /><col className="w-28" /><col className="w-32" /><col className="w-24" />
                      <col /><col className="w-44" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2 font-medium">Settimana</th>
                        <th className="py-2 pr-3 font-medium">Giorno e fascia</th>
                        <th className="py-2 pr-3 text-right font-medium" title="Indennità di reperibilità prevista dal CCNL (lordo)">Indennità CCNL</th>
                        <th className="py-2 pr-3 text-right font-semibold text-blue-800" title="Importo aggiuntivo da erogare come gettone di disponibilità (lordo)">Gettone</th>
                        <th className="py-2 pr-3 text-right font-medium" title="Indennità CCNL + gettone">Totale lordo</th>
                        <th className="py-2 pr-3 text-right font-medium" title="Netto garantito per la fascia">Netto</th>
                        <th className="border-l border-slate-200 py-2 pr-3 pl-3 font-medium text-slate-400">Alternativa · giorno</th>
                        <th className="py-2 pr-4 text-right font-medium text-slate-400">Alternativa · ore</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.weeks.map((w) => {
                        const over = w.dayTotal > params.capHours + 1e-9
                        const multi = w.slots.length > 1
                        const span = w.slots.length + (multi ? 1 : 0)
                        return (
                          <Fragment key={w.week}>
                            {w.slots.map((s, i) => {
                              const e = slotEconomics(r.person, s, params)
                              const last = !multi && i === w.slots.length - 1
                              return (
                                <tr key={s.id} className={`align-top ${last ? 'border-b border-slate-200' : ''}`}>
                                  {i === 0 && <td rowSpan={span} className="border-b border-slate-200 px-4 py-2 whitespace-nowrap text-slate-600">dal {fmtDay(w.week)}</td>}
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{slotTag(s.id)}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtEur(e.iccnl)}</td>
                                  <td className="py-1.5 pr-3 text-right font-semibold text-slate-900">{fmtEur(e.lcomp)}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtEur(e.ltot)}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtEur(e.net)}</td>
                                  {i === 0 && <>
                                    <td rowSpan={span} className="border-b border-l border-slate-200 py-2 pr-3 pl-3 text-slate-600">
                                      <div className="font-medium">{w.day === 'dom' ? 'Domenica' : 'Sabato'} {fmtDay(w.dayDate).split(' ').slice(1).join(' ')}</div>
                                      <div className="text-xs text-slate-500">{w.day === 'dom' ? `+${fmtNum(params.majDom * 100, 0)}%` : `+${fmtNum(params.majSab1 * 100, 0)}% prime 2h, +${fmtNum(params.majSab2 * 100, 0)}% oltre`}</div>
                                      {w.moveReason && <div className="mt-1"><Badge tone={w.relocated ? 'blue' : 'amber'}>{w.moveReason}</Badge></div>}
                                      {w.warning && <div className="mt-1"><Badge tone="red">{w.warning}</Badge></div>}
                                    </td>
                                    <td rowSpan={span} className="border-b border-slate-200 py-2 pr-4 text-right whitespace-nowrap text-slate-600">
                                      {fmtHours(w.hours)}
                                      {Number.isFinite(w.hours) && <div className="mt-0.5">{over ? <Badge tone="red">Oltre cap {fmtNum(params.capHours)} h</Badge> : <Badge tone="green">Entro cap</Badge>}
                                        {w.dayTotal > w.hours + 1e-9 && <div className="mt-0.5 text-[11px] text-slate-500">{fmtNum(w.dayTotal)} h totali quel giorno</div>}</div>}
                                    </td>
                                  </>}
                                </tr>
                              )
                            })}
                            {multi && (
                              <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-700">
                                <td className="py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-slate-500">Totale settimana</td>
                                <td className="py-1.5 pr-3 text-right font-medium">{fmtEur(w.iccnl)}</td>
                                <td className="py-1.5 pr-3 text-right font-semibold text-slate-900">{fmtEur(w.lcomp)}</td>
                                <td className="py-1.5 pr-3 text-right font-medium">{fmtEur(w.ltot)}</td>
                                <td className="py-1.5 pr-3 text-right font-medium">{fmtEur(w.net)}</td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                      <tr className="bg-slate-50 font-semibold">
                        <td className="px-4 py-2" colSpan={2}>Totale {m.label} · {r.totals.slots} {r.totals.slots === 1 ? 'turno' : 'turni'}</td>
                        <td className="py-2 pr-3 text-right">{fmtEur(r.totals.iccnl)}</td>
                        <td className="py-2 pr-3 text-right text-blue-800">{fmtEur(r.totals.lcomp)}</td>
                        <td className="py-2 pr-3 text-right">{fmtEur(r.totals.ltot)}</td>
                        <td className="py-2 pr-3 text-right">{fmtEur(r.totals.net)}</td>
                        <td className="border-l border-slate-200 py-2 pr-3" />
                        <td className="py-2 pr-4 text-right text-slate-600">{fmtHours(r.totals.hours)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
