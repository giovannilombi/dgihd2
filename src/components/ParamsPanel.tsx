import { DEFAULT_PARAMS, GROUP_LABEL, type Params } from '../lib/types'
import { HowItWorks } from './HowItWorks'
import { AccordionSummary, Button, NumberField } from './ui'

export function ParamsPanel({ params: p, onChange }: { params: Params; onChange: (p: Params) => void }) {
  const set = <K extends keyof Params>(k: K, v: Params[K]) => onChange({ ...p, [k]: v })
  /** Maggiorazioni salvate come frazione (0,25) e mostrate in percentuale (25%). */
  const pct = (k: OtPct, label: string, hint?: string) => (
    <NumberField label={label} value={Math.round(p[k] * 1000) / 10} onChange={(v) => set(k, Math.round(v * 10) / 1000)} step={1} min={0} max={200} suffix="%" hint={hint} />
  )
  return (
    <div className="space-y-8">
      <section aria-labelledby="params-a" className="space-y-6">
      <h3 id="params-a" className="text-base font-semibold text-slate-900"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-md bg-blue-700 text-xs text-white">A</span>Reperibilità: gettone integrativo e costi</h3>
      <div className="grid gap-6 lg:grid-cols-3">
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Ricavo aziendale (listino cliente)</legend>
          <NumberField label="Notte feriale (18:01–08:59) – per slot" value={p.revenueFeriale} onChange={(v) => set('revenueFeriale', v)} min={0} suffix="€" hint="Listino 800 € scontato 15%" />
          <NumberField label="Weekend/festivo h24 (Diurno + Notturno) – per giorno" value={p.revenueFestivo} onChange={(v) => set('revenueFestivo', v)} min={0} suffix="€" hint="Listino 1.200 € scontato 10%. Fatturato solo se entrambi gli slot sono coperti." />
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Netto di riferimento per turno (uguale per tutti)</legend>
          <NumberField label="Notte feriale (18:00–09:00)" value={p.netFN} onChange={(v) => set('netFN', v)} min={0} suffix="€ netti" />
          <NumberField label="Weekend/festivo diurno (09:00–18:00)" value={p.netWD} onChange={(v) => set('netWD', v)} min={0} suffix="€ netti" />
          <NumberField label="Weekend/festivo notturno (18:00–09:00)" value={p.netWN} onChange={(v) => set('netWN', v)} min={0} suffix="€ netti" />
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Costo aziendale</legend>
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

      <div className="space-y-3">
      <HowItWorks p={p} />
      <details className="group rounded-xl border border-slate-200 bg-slate-50">
        <AccordionSummary compact>Parametri avanzati: coefficienti netto/lordo, indennità CCNL</AccordionSummary>
        <div className="grid gap-6 border-t border-slate-200 p-4 lg:grid-cols-3">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Coefficiente netto/lordo (K)</legend>
            <NumberField label="RAL ≤ 28.000 €" value={p.kNetLow} onChange={(v) => set('kNetLow', v)} min={0.3} max={1} />
            <NumberField label="RAL 28.001 – 50.000 €" value={p.kNetMid} onChange={(v) => set('kNetMid', v)} min={0.3} max={1} />
            <NumberField label="RAL > 50.000 €" value={p.kNetHigh} onChange={(v) => set('kNetHigh', v)} min={0.3} max={1} />
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Indennità CCNL nel weekend</legend>
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
        </div>
      </details>
      </div>
      </section>

      <section aria-labelledby="params-b" className="space-y-4 border-t border-slate-200 pt-6">
        <div>
          <h3 id="params-b" className="text-base font-semibold text-slate-900"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-md bg-blue-700 text-xs text-white">B</span>Straordinari per interventi</h3>
          <p className="mt-1 text-sm text-slate-600">
            Gli interventi effettivi durante la reperibilità si pagano come lavoro straordinario (CCNL Metalmeccanici Industria, art. 6 e 7, lavoratori non turnisti),
            sempre <strong>in aggiunta</strong> a indennità CCNL e gettone. Valgono per gli interventi approvati.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Maggiorazioni sulla paga oraria</legend>
            {pct('otDayFirst', `Feriale diurno (lun–sab), prime ${fmtNum(p.otDayFirstHours)} ore del giorno`)}
            <NumberField label="Ore del giorno con la prima maggiorazione" value={p.otDayFirstHours} onChange={(v) => set('otDayFirstHours', v)} step={1} min={0} max={24} suffix="ore" />
            {pct('otDayNext', 'Feriale diurno, ore successive')}
            {pct('otNight', `Notturno feriale (${fmtHour(p.otNightStart)}–${fmtHour(p.otNightEnd)})`)}
            {pct('otHoliday', 'Festivo diurno (domeniche e festività)', 'Straordinario festivo, dalla prima ora')}
            {pct('otHolidayNight', 'Festivo notturno', 'Straordinario notturno festivo, dalla prima ora')}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Fasce e arrotondamenti</legend>
            <NumberField label="Inizio fascia notturna" value={p.otNightStart} onChange={(v) => set('otNightStart', v)} step={1} min={0} max={23} suffix=":00" />
            <NumberField label="Fine fascia notturna" value={p.otNightEnd} onChange={(v) => set('otNightEnd', v)} step={1} min={0} max={23} suffix=":00" />
            <NumberField label="Minimo riconosciuto per intervento" value={p.otMinHours} onChange={(v) => set('otMinHours', v)} step={0.5} min={0} max={8} suffix="ore" />
            <NumberField label="Tolleranza oltre l'ora" value={p.otToleranceMin} onChange={(v) => set('otToleranceMin', v)} step={1} min={0} max={59} suffix="min"
              hint={`Con ${fmtNum(p.otToleranceMin)} min: 1h${String(p.otToleranceMin).padStart(2, '0')} → 1 ora, 1h${String(Math.min(59, p.otToleranceMin + 1)).padStart(2, '0')} → 2 ore`} />
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Paga oraria e chiamata</legend>
            <NumberField label="Divisore della paga oraria (RAL ÷)" value={p.hourlyDivisor} onChange={(v) => set('hourlyDivisor', v)} step={1} min={1}
              hint="173 ore × 13 mensilità = 2.249. Il CCNL (art. 3) calcola la paga oraria dagli elementi fissi mensili ÷ 173: il valore esatto lo fornisce l'ufficio paghe." />
            <NumberField label="Compenso per chiamata" value={p.callFee} onChange={(v) => set('callFee', v)} min={0} suffix="€"
              hint="Art. 6: per ogni chiamata seguita da intervento effettivo, anche da remoto; escluso dalla base del TFR." />
          </fieldset>
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Sabato è feriale; domeniche e festività sono festive. Le ore si contano per giorno di calendario del minuto lavorato (sabato dopo mezzanotte è già domenica);
          ogni intervento vale almeno {fmtNum(p.otMinHours)} {p.otMinHours === 1 ? 'ora' : 'ore'} e i minuti di arrotondamento vanno nella fascia in cui l'intervento finisce.
          Nessun tempo di viaggio (interventi da remoto). Per le persone con RAL Q/ si mostrano solo le ore finché non viene inserita la RAL puntuale.
        </p>
      </section>

      <div>
        <Button variant="ghost" onClick={() => onChange(structuredClone(DEFAULT_PARAMS))}>Ripristina tutti i parametri di default</Button>
      </div>
    </div>
  )
}

type OtPct = 'otDayFirst' | 'otDayNext' | 'otNight' | 'otHoliday' | 'otHolidayNight'
const fmtNum = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
const fmtHour = (h: number) => `${String(Math.trunc(h)).padStart(2, '0')}:00`
