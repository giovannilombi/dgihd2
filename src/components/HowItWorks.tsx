import { useState } from 'react'
import { baseHourly, fmtEur, fmtNum, kNetto, slotEconomics, sundayHours } from '../lib/economics'
import { LEVELS, type Level, type Params } from '../lib/types'
import { AccordionSummary } from './ui'

/** Esempio guidato, calcolato dal vivo: dal netto target al gettone, all'alternativa in ore e al costo aziendale. */
export function HowItWorks({ p }: { p: Params }) {
  const [ral, setRal] = useState(30_000)
  const [level, setLevel] = useState<Level>('B1')
  const ok = Number.isFinite(ral) && ral > 0
  const e = ok ? slotEconomics({ level, ral }, { date: '2026-11-24', kind: 'FN' }, p) : null
  const k = ok ? kNetto(ral, p) : 0
  const base = ok ? baseHourly(ral) : 0
  const hDom = e ? sundayHours(e.lcomp, ral, p) : 0
  const twoNights = e ? sundayHours(2 * e.lcomp, ral, p) : 0

  const steps = e ? [
    ['Netto garantito al dipendente', 'gettone netto target', fmtEur(e.net)],
    ['Lordo necessario', `${fmtNum(e.net)} € ÷ ${fmtNum(k)} (coeff. netto/lordo)`, fmtEur(e.ltot)],
    ['Già coperto dal CCNL', `indennità reperibilità liv. ${level}`, `− ${fmtEur(e.iccnl)}`],
    ['Gettone di disponibilità (preferibile)', 'voce dedicata in busta, a consuntivo', fmtEur(e.lcomp)],
    ['Alternativa: ore di straordinario', `${fmtNum(e.lcomp)} € ÷ (${fmtNum(base)} €/h × ${fmtNum(1 + p.majDom)})`, `${fmtNum(hDom)} h Domenica`],
    ['Costo per l\'azienda', `${fmtNum(e.ltot)} € × ${fmtNum(p.costMultiplier)}`, fmtEur(e.cost)],
  ] : []

  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50">
      <AccordionSummary compact>Come funziona: esempio guidato su una notte feriale</AccordionSummary>
      <div className="grid gap-6 border-t border-slate-200 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">RAL</span>
              <input type="number" min={0} step={500} value={Number.isFinite(ral) ? ral : ''} onChange={(ev) => setRal(ev.target.valueAsNumber)}
                className="num mt-1 block w-32 rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Livello</span>
              <select value={level} onChange={(ev) => setLevel(ev.target.value as Level)} className="mt-1 block rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
                {LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
          </div>
          {e ? (
            <table className="num mt-3 w-full text-sm">
              <tbody>
                {steps.map(([label, how, value], i) => (
                  <tr key={label} className={`border-b border-slate-200 last:border-0 ${i === 3 ? 'bg-blue-50' : ''}`}>
                    <td className="py-1.5 pr-2 pl-1 text-xs text-slate-400">{i + 1}</td>
                    <td className="py-1.5 pr-3">
                      <div className={i === 3 ? 'font-semibold text-blue-900' : i === 4 ? 'text-slate-500' : 'font-medium text-slate-800'}>{label}</div>
                      <div className="text-xs text-slate-500">{how}</div>
                    </td>
                    <td className={`py-1.5 pr-1 text-right whitespace-nowrap ${i === 3 ? 'font-semibold text-blue-900' : i === 4 ? 'text-slate-500' : 'font-medium'}`}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="mt-3 text-sm text-slate-500">Inserisci una RAL valida.</p>}
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-slate-700">
          <p><strong className="text-slate-900">Gettone di disponibilità (preferibile).</strong> Il CCNL paga pochi euro a turno: la differenza fino al netto garantito viene erogata a fine mese come voce dedicata in busta paga, calcolata sulla RAL di ciascuno.</p>
          <p><strong className="text-slate-900">Alternativa in ore.</strong> Lo stesso importo lordo può essere liquidato come straordinario su un solo giorno del weekend (Domenica +{fmtNum(p.majDom * 100, 0)}%, oppure Sabato se la persona è reperibile il lunedì dopo). Netto e costo non cambiano.</p>
          <p>
            <strong className="text-slate-900">Cap {fmtNum(p.capHours)} h/giorno.</strong> Nell'alternativa le ore della settimana non possono superare una giornata standard: il calendario blocca i turni che lo sforerebbero.
            {e && <> Con questa RAL due notti feriali nella stessa settimana richiedono <strong>{fmtNum(twoNights)} h</strong>{twoNights > p.capHours ? <span className="text-red-700"> (oltre il cap: la seconda notte viene bloccata)</span> : ' (entro il cap)'}.</>}
          </p>
          <p><strong className="text-slate-900">Moltiplicatore {fmtNum(p.costMultiplier)}×.</strong> Per ogni euro lordo l'azienda spende circa {fmtNum(p.costMultiplier)} €, includendo contributi INPS a carico azienda, TFR e INAIL. Da allineare con il dato reale del payroll.</p>
        </div>
      </div>
    </details>
  )
}
