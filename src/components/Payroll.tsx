import { fmtDay } from '../lib/calendar'
import { fmtEur, fmtHours, fmtNum } from '../lib/economics'
import { payroll, slotTag } from '../lib/reports'
import type { Assignments, Params, Person } from '../lib/types'
import { Badge } from './ui'

export function Payroll({ people, assignments, params }: { people: Person[]; assignments: Assignments; params: Params }) {
  const months = payroll(people, assignments, params)
  if (!months.length) return <p className="text-sm text-slate-500">Nessun turno assegnato: compila il calendario (Sezione C) per generare il consuntivo.</p>
  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-600">
        Ogni settimana confluisce nel consuntivo del mese in cui è stato svolto il suo ultimo turno; la colonna <em>Gettone lordo</em> è l'importo da erogare come <strong>Gettone di disponibilità</strong> (modalità preferibile). Le colonne <em>Alternativa</em> riportano, a parità di importo, il giorno (Domenica o Sabato della stessa settimana, anche nel mese adiacente) e le ore di straordinario da caricare se si sceglie la liquidazione in ore.
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
                  <span className="text-xs text-slate-500">Liv. {r.person.level} · RAL {fmtEur(r.person.ral)}</span>
                  <span className="num ml-auto text-sm text-slate-700">Netto garantito <strong>{fmtEur(r.totals.net)}</strong> · Costo aziendale <strong>{fmtEur(r.totals.cost)}</strong></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="num w-full min-w-[960px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2 font-medium">Settimana</th>
                        <th className="py-2 pr-3 font-medium">Date e fasce</th>
                        <th className="py-2 pr-3 text-right font-medium">Indennità CCNL</th>
                        <th className="py-2 pr-3 text-right font-semibold text-blue-800">Gettone lordo</th>
                        <th className="py-2 pr-3 text-right font-medium">Netto</th>
                        <th className="border-l border-slate-200 py-2 pr-3 pl-3 font-medium text-slate-400">Alternativa · giorno</th>
                        <th className="py-2 pr-4 text-right font-medium text-slate-400">Alternativa · ore</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.weeks.map((w) => {
                        const over = w.hours > params.capHours + 1e-9
                        return (
                            <tr key={w.week} className="border-b border-slate-100 align-top">
                              <td className="px-4 py-2 whitespace-nowrap text-slate-600">dal {fmtDay(w.week)}</td>
                              <td className="py-2 pr-3">{w.slots.map((s) => <div key={s.id}>{slotTag(s.id)}</div>)}</td>
                              <td className="py-2 pr-3 text-right">{fmtEur(w.iccnl)}</td>
                              <td className="py-2 pr-3 text-right font-semibold text-slate-900">{fmtEur(w.lcomp)}</td>
                              <td className="py-2 pr-3 text-right">{fmtEur(w.net)}</td>
                              <td className="border-l border-slate-100 py-2 pr-3 pl-3 text-slate-600">
                                <div className="font-medium">{w.day === 'dom' ? 'Domenica' : 'Sabato'} {fmtDay(w.dayDate).split(' ').slice(1).join(' ')}</div>
                                <div className="text-xs text-slate-500">{w.day === 'dom' ? `+${fmtNum(params.majDom * 100, 0)}%` : `+${fmtNum(params.majSab1 * 100, 0)}% prime 2h, +${fmtNum(params.majSab2 * 100, 0)}% oltre`}</div>
                                {w.moveReason && <div className="mt-1"><Badge tone="amber">{w.moveReason}</Badge></div>}
                                {w.warning && <div className="mt-1"><Badge tone="red">{w.warning}</Badge></div>}
                              </td>
                              <td className="py-2 pr-4 text-right whitespace-nowrap text-slate-600">
                                {fmtHours(w.hours)}
                                <div className="mt-0.5">{over ? <Badge tone="red">Oltre cap {fmtNum(params.capHours)} h</Badge> : <Badge tone="green">Entro cap</Badge>}</div>
                              </td>
                            </tr>
                          
                        )
                      })}
                      <tr className="bg-slate-50 font-semibold">
                        <td className="px-4 py-2" colSpan={2}>Totale {m.label} · {r.totals.slots} turni</td>
                        <td className="py-2 pr-3 text-right">{fmtEur(r.totals.iccnl)}</td>
                        <td className="py-2 pr-3 text-right text-blue-800">{fmtEur(r.totals.lcomp)}</td>
                        <td className="py-2 pr-3 text-right">{fmtEur(r.totals.net)}</td>
                        <td className="border-l border-slate-200 py-2 pr-3" />
                        <td className="py-2 pr-4 text-right text-slate-600">{fmtNum(r.totals.hours)} h</td>
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
