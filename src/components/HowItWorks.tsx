import { useState } from 'react'
import { fmtEur, fmtNum, kNetto, slotEconomics } from '../lib/economics'
import { LEVEL_LABEL, LEVELS, type Level, type Params } from '../lib/types'
import { AccordionSummary } from './ui'

/** Esempio guidato, calcolato dal vivo: dal netto di riferimento al lordo, al gettone integrativo e al costo aziendale. */
export function HowItWorks({ p }: { p: Params }) {
  const [ral, setRal] = useState(30_000)
  const [level, setLevel] = useState<Level>('B1')
  const ok = Number.isFinite(ral) && ral > 0
  const e = ok ? slotEconomics({ level, ral }, { date: '2026-11-24', kind: 'FN' }, p) : null
  const k = ok ? kNetto(ral, p) : 0

  const steps = e ? [
    ['Netto di riferimento', 'uguale per tutti, per tipo di turno', fmtEur(e.net)],
    ['Lordo complessivo del turno', `${fmtNum(e.net)} € ÷ ${fmtNum(k)} (coeff. netto/lordo della fascia di RAL)`, fmtEur(e.ltot)],
    ['Indennità di reperibilità CCNL', `già dovuta per contratto, liv. ${level}`, `− ${fmtEur(e.iccnl)}`],
    ['Gettone integrativo', 'voce dedicata in busta, a consuntivo', fmtEur(e.lcomp)],
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
                {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
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
                      <div className={i === 3 ? 'font-semibold text-blue-900' : 'font-medium text-slate-800'}>{label}</div>
                      <div className="text-xs text-slate-500">{how}</div>
                    </td>
                    <td className={`py-1.5 pr-1 text-right whitespace-nowrap ${i === 3 ? 'font-semibold text-blue-900' : 'font-medium'}`}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="mt-3 text-sm text-slate-500">Inserisci una RAL valida.</p>}
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-slate-700">
          <p><strong className="text-slate-900">Gettone integrativo.</strong> L'indennità CCNL resta dovuta e copre pochi euro a turno: il gettone porta il lordo del turno al valore che corrisponde al netto di riferimento. È una voce dedicata in busta paga, erogata a fine mese solo per i turni effettivamente svolti.</p>
          <p><strong className="text-slate-900">Netto di riferimento, non garantito.</strong> Al dipendente si comunica il lordo, calcolato su misura: RAL e situazione fiscale (detrazioni, addizionali) cambiano da persona a persona, quindi il netto effettivo può scostarsi leggermente.</p>
          <p><strong className="text-slate-900">Interventi.</strong> Le chiamate che richiedono di lavorare sono retribuite a parte, come lavoro straordinario con le maggiorazioni del CCNL.</p>
          <p><strong className="text-slate-900">Moltiplicatore {fmtNum(p.costMultiplier)}×.</strong> Per ogni euro lordo l'azienda spende circa {fmtNum(p.costMultiplier)} €, includendo contributi INPS a carico azienda, TFR e INAIL. Da allineare con il dato reale del payroll.</p>
        </div>
      </div>
    </details>
  )
}
