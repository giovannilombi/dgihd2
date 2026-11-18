import { useState } from 'react'
import { fmtEur, fmtPct } from '../lib/economics'
import { pnl, type PeriodPnl } from '../lib/reports'
import type { Assignments, Params, Person } from '../lib/types'
import { Kpi } from './ui'

export function Dashboard({ people, assignments, params }: { people: Person[]; assignments: Assignments; params: Params }) {
  const { months, weeks, total } = pnl(people, assignments, params)
  const [view, setView] = useState<'weeks' | 'months'>('weeks')
  const rows = view === 'weeks' ? weeks : months
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ricavo totale cliente" value={fmtEur(total.revenue)} sub={`${total.ferialiCoperti} notti feriali × ${fmtEur(params.revenueFeriale)} + ${total.festiviCoperti} giornate fest. × ${fmtEur(params.revenueFestivo)}`} />
        <Kpi label="Costo aziendale reperibilità" value={fmtEur(total.cost)} sub={`Lordo totale × ${params.costMultiplier.toFixed(2).replace('.', ',')}`} />
        <Kpi label="Margine lordo aziendale" value={fmtEur(total.margin)} tone={total.margin < 0 ? 'bad' : undefined} sub="Ricavo − costo aziendale" />
        <Kpi label="Marginalità %" value={total.revenue ? fmtPct(total.marginPct) : '–'} tone={total.margin < 0 ? 'bad' : undefined} sub="Margine / ricavo (non markup)" />
      </div>
      {total.festiviParziali > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {total.festiviParziali === 1 ? '1 giornata weekend/festiva ha' : `${total.festiviParziali} giornate weekend/festive hanno`} un solo slot coperto: il costo è conteggiato ma il ricavo giornaliero non viene fatturato finché la copertura h24 non è completa.
        </p>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Ricavo = costo del personale + margine</h3>
          <div className="no-print inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist">
            {([['weeks', 'Settimanale'], ['months', 'Novembre vs Dicembre']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1.5 font-medium ${view === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}>{l}</button>
            ))}
          </div>
        </div>
        <StackedBars rows={rows} />
      </div>

      <div className="overflow-x-auto">
        <table className="num w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Periodo</th>
              <th className="py-2 pr-3 text-right font-medium">Slot coperti</th>
              <th className="py-2 pr-3 text-right font-medium">Notti feriali</th>
              <th className="py-2 pr-3 text-right font-medium">Giornate fest.</th>
              <th className="py-2 pr-3 text-right font-medium">Ricavo</th>
              <th className="py-2 pr-3 text-right font-medium">Costo</th>
              <th className="py-2 pr-3 text-right font-medium">Margine</th>
              <th className="py-2 text-right font-medium">Marg. %</th>
            </tr>
          </thead>
          <tbody>
            {[...months, total].map((b) => (
              <tr key={b.key} className={`border-b border-slate-100 ${b.key === 'tot' ? 'bg-slate-50 font-semibold' : ''}`}>
                <td className="py-2 pr-3">{b.label}</td>
                <td className="py-2 pr-3 text-right">{b.slotsCovered}/{b.slotsTotal}</td>
                <td className="py-2 pr-3 text-right">{b.ferialiCoperti}</td>
                <td className="py-2 pr-3 text-right">{b.festiviCoperti}{b.festiviParziali ? <span className="text-amber-700"> (+{b.festiviParziali} parz.)</span> : ''}</td>
                <td className="py-2 pr-3 text-right">{fmtEur(b.revenue)}</td>
                <td className="py-2 pr-3 text-right">{fmtEur(b.cost)}</td>
                <td className={`py-2 pr-3 text-right ${b.margin < 0 ? 'text-red-700' : ''}`}>{fmtEur(b.margin)}</td>
                <td className="py-2 text-right">{b.revenue ? fmtPct(b.marginPct) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Barre impilate: costo (arancio) + margine (blu) = ricavo. Hover con tooltip per barra. */
function StackedBars({ rows }: { rows: PeriodPnl[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 900, H = 260, padL = 64, padB = 36, padT = 16
  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenue, r.cost)))
  const nice = niceMax(max)
  const plotH = H - padB - padT
  const y = (v: number) => padT + plotH - (v / nice) * plotH
  const slot = (W - padL - 8) / rows.length
  const bw = Math.min(56, slot * 0.6)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * nice)
  const h = hover !== null ? rows[hover] : null

  return (
    <div className="relative rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-cost)' }} />Costo del personale</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-margin)' }} />Margine aziendale</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ricavi, costi e margine per periodo">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#64748b">{Math.round(t).toLocaleString('it-IT', { useGrouping: 'always' })} €</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = padL + slot * i + slot / 2
          const x = cx - bw / 2
          const cost = Math.min(r.cost, r.revenue)
          const margin = Math.max(0, r.revenue - r.cost)
          const overrun = Math.max(0, r.cost - r.revenue)
          const yc = y(cost), ym = y(cost + margin)
          return (
            <g key={r.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {cost > 0 && <rect x={x} y={yc} width={bw} height={y(0) - yc} fill="var(--series-cost)" />}
              {margin > 0 && <rect x={x} y={ym} width={bw} height={Math.max(0, yc - ym - 2)} rx={3} fill="var(--series-margin)" />}
              {overrun > 0 && <rect x={x} y={y(r.cost)} width={bw} height={y(r.revenue) - y(r.cost)} fill="none" stroke="#dc2626" strokeDasharray="3 2" />}
              <text x={cx} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="#475569">{r.label.replace('Sett. ', '').replace(' 2026', '')}</text>
            </g>
          )
        })}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-10 right-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
          <div className="mb-1 font-semibold text-slate-900">{h.label}</div>
          <div className="num grid grid-cols-[auto_auto] gap-x-4 text-slate-700">
            <span>Ricavo</span><span className="text-right">{fmtEur(h.revenue)}</span>
            <span>Costo</span><span className="text-right">{fmtEur(h.cost)}</span>
            <span>Margine</span><span className="text-right font-semibold">{fmtEur(h.margin)}</span>
            <span>Marginalità</span><span className="text-right">{h.revenue ? fmtPct(h.marginPct) : '–'}</span>
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
