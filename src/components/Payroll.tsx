import { Fragment } from 'react'
import { fmtDay } from '../lib/calendar'
import { fmtEur } from '../lib/economics'
import { payroll, slotTag, type NdData } from '../lib/reports'
import type { Assignments, Params, Person } from '../lib/types'
import { Badge } from './ui'

export function Payroll({ people, assignments, params, nd }: { people: Person[]; assignments: Assignments; params: Params; nd?: NdData }) {
  const months = payroll(people, assignments, params, nd)
  const pendingNd = people.filter((x) => x.ralNd && !x.salaryHidden && !nd?.[x.id] && Object.values(assignments).includes(x.id)).length
  const pendingNote = pendingNd > 0 && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Calcolo in corso per {pendingNd === 1 ? '1 persona' : `${pendingNd} persone`} con RAL Q/: i loro importi vengono calcolati dal server.</p>
  if (!months.length) return pendingNote || <p className="text-sm text-slate-500">Nessun turno assegnato: compila il calendario (Sezione C) per generare il consuntivo.</p>
  return (
    <div className="space-y-8">
      {pendingNote}
      <p className="text-sm text-slate-600">
        Per ogni turno: <em>Indennità CCNL</em> (dovuta per contratto) + <em>Gettone integrativo</em> (voce dedicata in busta) = <em>Totale lordo</em>, che corrisponde al <em>Netto di riferimento</em> del turno (il netto effettivo dipende dalla situazione fiscale di ciascuno). Ogni settimana confluisce nel consuntivo del mese in cui è stato svolto il suo ultimo turno.
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
                  {r.person.ralNd ? <Badge tone="slate">RAL Q/: importi stimati</Badge> : !(r.person.ral > 0) && <Badge tone="amber">RAL da inserire: importi stimati</Badge>}
                  <span className="num ml-auto text-sm text-slate-700">Totale lordo <strong>{fmtEur(r.totals.ltot)}</strong> · Netto di riferimento <strong>{fmtEur(r.totals.net)}</strong> · Costo aziendale <strong>{fmtEur(r.totals.cost)}</strong></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="num w-full min-w-[800px] table-fixed text-sm">
                    {/* larghezze fisse: le colonne restano allineate tra le schede delle diverse persone */}
                    <colgroup>
                      <col className="w-36" /><col className="w-52" />
                      <col /><col /><col /><col />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2 font-medium">Settimana</th>
                        <th className="py-2 pr-3 font-medium">Giorno e fascia</th>
                        <th className="py-2 pr-3 text-right font-medium" title="Indennità di reperibilità prevista dal CCNL (lordo)">Indennità CCNL</th>
                        <th className="py-2 pr-3 text-right font-semibold text-blue-800" title="Importo aggiuntivo da erogare come gettone integrativo (lordo)">Gettone integrativo</th>
                        <th className="py-2 pr-3 text-right font-medium" title="Indennità CCNL + gettone">Totale lordo</th>
                        <th className="py-2 pr-4 text-right font-medium" title="Netto di riferimento del turno">Netto di rif.</th>
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
                                <tr key={s.id} className={`align-top ${last ? 'border-b border-slate-200' : ''}`}>
                                  {i === 0 && <td rowSpan={span} className="border-b border-slate-200 px-4 py-2 whitespace-nowrap text-slate-600">dal {fmtDay(w.week)}</td>}
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{slotTag(s.id)}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtEur(e.iccnl)}</td>
                                  <td className="py-1.5 pr-3 text-right font-semibold text-slate-900">{fmtEur(e.lcomp)}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtEur(e.ltot)}</td>
                                  <td className="py-1.5 pr-4 text-right">{fmtEur(e.net)}</td>
                                </tr>
                              )
                            })}
                            {multi && (
                              <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-700">
                                <td className="py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-slate-500">Totale settimana</td>
                                <td className="py-1.5 pr-3 text-right font-medium">{fmtEur(w.iccnl)}</td>
                                <td className="py-1.5 pr-3 text-right font-semibold text-slate-900">{fmtEur(w.lcomp)}</td>
                                <td className="py-1.5 pr-3 text-right font-medium">{fmtEur(w.ltot)}</td>
                                <td className="py-1.5 pr-4 text-right font-medium">{fmtEur(w.net)}</td>
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
                        <td className="py-2 pr-4 text-right">{fmtEur(r.totals.net)}</td>
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
