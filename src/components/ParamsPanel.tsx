import { DEFAULT_PARAMS, GROUP_LABEL, type Params } from '../lib/types'
import { Button, NumberField } from './ui'

export function ParamsPanel({ params: p, onChange }: { params: Params; onChange: (p: Params) => void }) {
  const set = <K extends keyof Params>(k: K, v: Params[K]) => onChange({ ...p, [k]: v })
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Ricavo aziendale (listino cliente)</legend>
          <NumberField label="Notte feriale (18:01–08:59) – per slot" value={p.revenueFeriale} onChange={(v) => set('revenueFeriale', v)} min={0} suffix="€" hint="Listino 800 € scontato 15%" />
          <NumberField label="Weekend/festivo h24 (Diurno + Notturno) – per giorno" value={p.revenueFestivo} onChange={(v) => set('revenueFestivo', v)} min={0} suffix="€" hint="Listino 1.200 € scontato 10%. Fatturato solo se entrambi gli slot sono coperti." />
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Gettoni netti target per il team</legend>
          <NumberField label="Notte feriale (18:00–09:00)" value={p.netFN} onChange={(v) => set('netFN', v)} min={0} suffix="€ netti" />
          <NumberField label="Weekend/festivo diurno (09:00–18:00)" value={p.netWD} onChange={(v) => set('netWD', v)} min={0} suffix="€ netti" />
          <NumberField label="Weekend/festivo notturno (18:00–09:00)" value={p.netWN} onChange={(v) => set('netWN', v)} min={0} suffix="€ netti" />
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Vincoli e costo</legend>
          <NumberField label="Cap ore compensazione giornaliera" value={p.capHours} onChange={(v) => set('capHours', v)} min={1} max={12} step={0.25} suffix="h/giorno" hint="Oltre il cap l'assegnazione viene bloccata" />
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Moltiplicatore costo aziendale sul lordo</span>
            <div className="mt-2 flex items-center gap-3">
              <input type="range" min={1.3} max={1.45} step={0.01} value={p.costMultiplier} onChange={(e) => set('costMultiplier', Number(e.target.value))} className="w-full accent-blue-700" />
              <span className="num w-14 text-right text-sm font-semibold">{p.costMultiplier.toFixed(2).replace('.', ',')}×</span>
            </div>
            <span className="mt-1 block text-xs text-slate-500">INPS azienda, TFR 6,91%, INAIL (1,30× – 1,45×)</span>
          </label>
        </fieldset>
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50">
        <summary className="px-4 py-2.5 text-sm font-semibold text-slate-700">Parametri avanzati: coefficienti netto/lordo, maggiorazioni, indennità CCNL</summary>
        <div className="grid gap-6 border-t border-slate-200 p-4 lg:grid-cols-3">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Coefficiente netto/lordo (K)</legend>
            <NumberField label="RAL ≤ 28.000 €" value={p.kNetLow} onChange={(v) => set('kNetLow', v)} min={0.3} max={1} />
            <NumberField label="RAL 28.001 – 50.000 €" value={p.kNetMid} onChange={(v) => set('kNetMid', v)} min={0.3} max={1} />
            <NumberField label="RAL > 50.000 €" value={p.kNetHigh} onChange={(v) => set('kNetHigh', v)} min={0.3} max={1} />
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Maggiorazioni straordinario</legend>
            <NumberField label="Domenica / festivo" value={Math.round(p.majDom * 100)} onChange={(v) => set('majDom', v / 100)} step={1} min={0} suffix="%" />
            <NumberField label="Sabato – prime 2 ore" value={Math.round(p.majSab1 * 100)} onChange={(v) => set('majSab1', v / 100)} step={1} min={0} suffix="%" />
            <NumberField label="Sabato – dalla 3ª ora" value={Math.round(p.majSab2 * 100)} onChange={(v) => set('majSab2', v / 100)} step={1} min={0} suffix="%" />
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Indennità CCNL sui 2 slot weekend/festivi</span>
              <select value={p.indemnitySplit} onChange={(e) => set('indemnitySplit', e.target.value as Params['indemnitySplit'])} className="mt-1 w-full rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300">
                <option value="intera">Intera per ciascuno slot (come tabella HR)</option>
                <option value="proquota">Pro-quota orario (9/24 e 15/24)</option>
              </select>
            </label>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">Indennità tabellare lorda (€)</legend>
            <table className="num w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1 font-medium">Livelli</th><th className="pb-1 font-medium">Fer.</th><th className="pb-1 font-medium">Sab.</th><th className="pb-1 font-medium">Dom/Fest.</th></tr></thead>
              <tbody>
                {(['g1', 'g2', 'g3'] as const).map((g) => (
                  <tr key={g}>
                    <td className="py-1 pr-2 text-xs text-slate-600">{GROUP_LABEL[g]}</td>
                    {(['feriale', 'sabato', 'domenica'] as const).map((k) => (
                      <td key={k} className="py-1 pr-1">
                        <input type="number" step={0.01} min={0} value={p.indemnity[g][k]} aria-label={`${GROUP_LABEL[g]} ${k}`}
                          onChange={(e) => Number.isFinite(e.target.valueAsNumber) && set('indemnity', { ...p.indemnity, [g]: { ...p.indemnity[g], [k]: e.target.valueAsNumber } })}
                          className="w-full rounded-md bg-white px-1.5 py-1 text-sm ring-1 ring-inset ring-slate-300" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>
          <div className="lg:col-span-3">
            <Button variant="ghost" onClick={() => onChange(structuredClone(DEFAULT_PARAMS))}>Ripristina tutti i parametri di default</Button>
          </div>
        </div>
      </details>
    </div>
  )
}
