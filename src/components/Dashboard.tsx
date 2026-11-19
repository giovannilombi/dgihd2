import { useState } from 'react'
import { fmtEur, fmtPct } from '../lib/economics'
import { pnl, type PeriodPnl } from '../lib/reports'
import type { Assignments, Params, Person } from '../lib/types'
import { Kpi } from './ui'

export function Dashboard({ people, assignments, params, excludedDays }: { people: Person[]; assignments: Assignments; params: Params; excludedDays: string[] }) {
  const { months, weeks, total } = pnl(people, assignments, params, excludedDays)
  const assignedIds = new Set(Object.values(assignments))
  const missingRal = people.filter((x) => assignedIds.has(x.id) && !x.salaryHidden && !x.ralNd && !(x.ral > 0)).length
  const ndRal = people.filter((x) => assignedIds.has(x.id) && x.ralNd).length
  const [view, setView] = useState<'weeks' | 'months'>('weeks')
  const rows = view === 'weeks' ? weeks : months
  const uncovered = total.slotsTotal - total.slotsCovered
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ricavo stimato" value={fmtEur(total.revenue)}
          sub={`Tutte le giornate richieste: ${total.ferialiRichiesti} notti feriali × ${fmtEur(params.revenueFeriale)} + ${total.festiviRichiesti} sab/dom/festivi × ${fmtEur(params.revenueFestivo)}`} />
        <Kpi label="Ricavo con copertura turni" value={fmtEur(total.revenueCovered)}
          sub={total.revenue ? `${fmtPct(total.revenueCovered / total.revenue * 100)} dello stimato · ${total.ferialiCoperti} notti feriali + ${total.festiviCoperti} sab/dom/festivi coperti (h24)` : 'Nessuna giornata richiesta'} />
        <Kpi label={total.costHidden ? 'Costo aziendale (solo tuo team)' : 'Costo aziendale reperibilità'} value={fmtEur(total.cost)}
          sub={total.costHidden
            ? `Esclusi ${total.costHidden} turni di persone di altri team, il cui costo non è visibile al tuo profilo`
            : `Turni assegnati: lordo riconosciuto (indennità CCNL + gettone) × ${params.costMultiplier.toFixed(2).replace('.', ',')}`} />
        {total.complete
          ? <Kpi label="Margine lordo aziendale" value={fmtEur(total.margin)} tone={total.margin < 0 ? 'bad' : undefined} sub={`Marginalità ${fmtPct(total.marginPct)} (margine / ricavo)`} />
          : <Kpi label="Margine lordo aziendale" value="Non calcolabile" sub={uncovered > 0 ? `${uncovered} ${uncovered === 1 ? 'turno scoperto' : 'turni scoperti'}: il costo finale non è ancora noto` : total.costHidden ? 'Visibilità limitata al tuo team: i costi degli altri team non sono inclusi' : 'Nessuna giornata richiesta nel periodo'} />}
      </div>
      {missingRal > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {missingRal === 1 ? '1 persona con turni assegnati non ha' : `${missingRal} persone con turni assegnati non hanno`} la RAL inserita: costi e margine sono stimati con il coefficiente netto/lordo della fascia più bassa e diventano definitivi inserendo le RAL nella pagina Team.
        </p>
      )}
      {ndRal > 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          ℹ {ndRal === 1 ? '1 persona con turni assegnati ha' : `${ndRal} persone con turni assegnati hanno`} la RAL Q/: i loro costi sono stimati su una RAL media di riferimento.
        </p>
      )}
      {uncovered > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {uncovered === 1 ? '1 turno delle giornate richieste è ancora scoperto' : `${uncovered} turni delle giornate richieste sono ancora scoperti`}: margine e marginalità non sono calcolabili finché non vengono coperti tutti. I mesi e le settimane già completi mostrano il proprio margine.
        </p>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Ricavo e costo {view === 'weeks' ? 'per settimana' : 'per mese'}</h3>
          <div className="no-print inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist">
            {([['weeks', 'Settimanale'], ['months', 'Per mese']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1.5 font-medium ${view === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}>{l}</button>
            ))}
          </div>
        </div>
        <GroupedBars rows={rows} />
      </div>

      <div className="overflow-x-auto">
        <table className="num w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Periodo</th>
              <th className="py-2 pr-3 text-right font-medium">Notti feriali richieste</th>
              <th className="py-2 pr-3 text-right font-medium">Sab/dom/festivi richiesti</th>
              <th className="py-2 pr-3 text-right font-medium">Turni coperti</th>
              <th className="py-2 pr-3 text-right font-medium">Ricavo stimato</th>
              <th className="py-2 pr-3 text-right font-medium">Ricavo coperto</th>
              <th className="py-2 pr-3 text-right font-medium">Costo</th>
              <th className="py-2 pr-3 text-right font-medium">Margine</th>
              <th className="py-2 text-right font-medium">Marg. %</th>
            </tr>
          </thead>
          <tbody>
            {[...months, total].map((b) => (
              <tr key={b.key} className={`border-b border-slate-100 ${b.key === 'tot' ? 'bg-slate-50 font-semibold' : ''}`}>
                <td className="py-2 pr-3">{b.label}</td>
                <td className="py-2 pr-3 text-right">{b.ferialiRichiesti}</td>
                <td className="py-2 pr-3 text-right">{b.festiviRichiesti}</td>
                <td className={`py-2 pr-3 text-right ${b.slotsCovered < b.slotsTotal ? 'text-amber-700' : ''}`}>{b.slotsCovered}/{b.slotsTotal}</td>
                <td className="py-2 pr-3 text-right">{fmtEur(b.revenue)}</td>
                <td className="py-2 pr-3 text-right">{fmtEur(b.revenueCovered)}</td>
                <td className="py-2 pr-3 text-right">{fmtEur(b.cost)}</td>
                {b.complete ? (
                  <>
                    <td className={`py-2 pr-3 text-right ${b.margin < 0 ? 'text-red-700' : ''}`}>{fmtEur(b.margin)}</td>
                    <td className="py-2 text-right">{fmtPct(b.marginPct)}</td>
                  </>
                ) : (
                  <td colSpan={2} className="py-2 text-right text-xs font-normal text-slate-500" title="Con turni scoperti il costo finale non è ancora noto">
                    {!b.slotsTotal ? 'n.c. · nessuna giornata richiesta' : b.slotsCovered < b.slotsTotal ? 'n.c. · turni scoperti' : 'n.c. · costi di altri team'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Per periodo: a sinistra il ricavo stimato (contorno) con dentro il ricavo coperto (pieno),
 * a destra il costo aziendale. La marginalità compare solo sui periodi interamente coperti.
 */
function GroupedBars({ rows }: { rows: PeriodPnl[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 900, H = 270, padL = 64, padB = 36, padT = 24
  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenue, r.cost)))
  const nice = niceMax(max)
  const plotH = H - padB - padT
  const y = (v: number) => padT + plotH - (v / nice) * plotH
  const slot = (W - padL - 8) / Math.max(1, rows.length)
  const bw = Math.min(30, slot * 0.32)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * nice)
  const h = hover !== null ? rows[hover] : null

  return (
    <div className="relative rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border-2" style={{ borderColor: 'var(--series-revenue)' }} />Ricavo stimato</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-revenue)' }} />Ricavo con copertura</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-cost)' }} />Costo aziendale</span>
        <span className="text-slate-400">· sopra: marginalità % (solo periodi interamente coperti)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ricavo stimato, ricavo coperto e costo aziendale per periodo">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#64748b">{Math.round(t).toLocaleString('it-IT', { useGrouping: 'always' })} €</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = padL + slot * i + slot / 2
          const yr = y(r.revenue), yrc = y(r.revenueCovered), yc = y(r.cost)
          return (
            <g key={r.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + slot * i} y={padT - 18} width={slot} height={plotH + 18} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {r.revenue > 0 && <rect x={cx - bw - 1 + 1} y={yr + 1} width={bw - 2} height={Math.max(0, y(0) - yr - 1)} rx={3} fill="none" stroke="var(--series-revenue)" strokeWidth={2} />}
              {r.revenueCovered > 0 && <rect x={cx - bw - 1} y={yrc} width={bw} height={y(0) - yrc} rx={3} fill="var(--series-revenue)" />}
              {r.cost > 0 && <rect x={cx + 1} y={yc} width={bw} height={y(0) - yc} rx={3} fill="var(--series-cost)" />}
              {r.revenue > 0 && (
                <text x={cx} y={Math.min(yr, yc) - 6} textAnchor="middle" fontSize="11" fontWeight={r.complete ? 600 : 400}
                  fill={!r.complete ? '#94a3b8' : r.margin < 0 ? '#b91c1c' : '#334155'}>{r.complete ? fmtPct(r.marginPct) : 'n.c.'}</text>
              )}
              <text x={cx} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="#475569">{r.label.replace('Sett. ', '').replace(/ \d{4}$/, '')}</text>
            </g>
          )
        })}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-10 right-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
          <div className="mb-1 font-semibold text-slate-900">{h.label}</div>
          <div className="num grid grid-cols-[auto_auto] gap-x-4 text-slate-700">
            <span>Giornate richieste</span><span className="text-right">{h.ferialiRichiesti} feriali · {h.festiviRichiesti} fest.</span>
            <span>Turni coperti</span><span className="text-right">{h.slotsCovered}/{h.slotsTotal}</span>
            <span>Ricavo stimato</span><span className="text-right">{fmtEur(h.revenue)}</span>
            <span>Ricavo con copertura</span><span className="text-right">{fmtEur(h.revenueCovered)}</span>
            <span>Costo aziendale</span><span className="text-right">{fmtEur(h.cost)}</span>
            <span>Margine</span><span className="text-right font-semibold">{h.complete ? `${fmtEur(h.margin)} · ${fmtPct(h.marginPct)}` : 'Non calcolabile'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function niceMax(v: number) {
  const exp = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp
  return 10 * exp
}
