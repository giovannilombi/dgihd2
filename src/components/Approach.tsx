import katex from 'katex'
import { useState, type ReactNode } from 'react'
import { HORIZON_LABEL } from '../lib/calendar'
import { baseHourly, fmtEur, kNetto, fmtNum, fmtPct, slotEconomics } from '../lib/economics'
import { GROUP_LABEL, LEVEL_GROUP, LEVEL_LABEL, LEVELS, type Level, type Params, type Person } from '../lib/types'
import { Collapsible } from './ui'

function Tex({ children, block }: { children: string; block?: boolean }) {
  const html = katex.renderToString(children, { displayMode: !!block, throwOnError: false })
  return block ? <div className="my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} /> : <span dangerouslySetInnerHTML={{ __html: html }} />
}

const H = ({ children }: { children: ReactNode }) => <h4 className="mt-5 mb-2 font-semibold text-slate-900 first:mt-0">{children}</h4>
const UL = ({ children }: { children: ReactNode }) => <ul className="ml-5 list-disc space-y-1.5 text-sm leading-relaxed text-slate-700">{children}</ul>
const P = ({ children }: { children: ReactNode }) => <p className="text-sm leading-relaxed text-slate-700">{children}</p>
const eur = (n: number) => fmtNum(n) + ' €'
const Pillar = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="rounded-lg bg-white p-4 ring-1 ring-blue-100">
    <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
    <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{children}</p>
  </div>
)

export function Approach({ params: p, people }: { params: Params; people: Person[] }) {
  // Incidenza del costo sul ricavo calcolata sul team attivo (riferimento dinamico per la sintesi).
  // escluse le persone di altri team e quelle con RAL Q/ (la RAL media di riferimento resta sul server)
  const visible = people.filter((x) => !x.salaryHidden && !x.ralNd)
  const active = visible.filter((x) => x.active)
  const ref = active.length ? active : visible
  const ferIncid = ref.map((x) => slotEconomics(x, { date: '2026-11-24', kind: 'FN' }, p).cost / p.revenueFeriale * 100)
  const festIncid = ref.map((x) => (slotEconomics(x, { date: '2026-11-29', kind: 'WD' }, p).cost + slotEconomics(x, { date: '2026-11-29', kind: 'WN' }, p).cost) / p.revenueFestivo * 100)
  const range = (a: number[]) => a.length ? (Math.min(...a).toFixed(1) === Math.max(...a).toFixed(1) ? fmtPct(Math.min(...a)) : `${fmtPct(Math.min(...a))}–${fmtPct(Math.max(...a))}`) : '–'


  return (
    <div className="space-y-3">
      {/* 1. Sintesi dell'approccio – sempre visibile */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
        <h3 className="font-semibold text-blue-950">1. In sintesi</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          La reperibilità del periodo <strong>{HORIZON_LABEL}</strong> (solo nelle giornate richieste dal cliente) copre le notti feriali (<strong>18:00–09:00</strong>) e l'intera giornata di <strong>sabati, domeniche e festivi</strong>, suddivisa in due turni: Diurno <code>09:00–18:00</code> e Notturno <code>18:00–09:00</code>.
          L'approccio parte da un principio semplice: <strong>chi dà la propria disponibilità deve sapere in anticipo quanto riceve, avere i riposi garantiti e partecipare a una rotazione equa</strong>, con un modello economicamente sostenibile.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Pillar title="Un importo chiaro per ogni turno">
            Per ogni turno di sola disponibilità è definito un <strong>netto di riferimento</strong>, uguale per tutti: <strong>{eur(p.netFN)}</strong> per la notte feriale, <strong>{eur(p.netWD)}</strong> per il diurno di weekend/festivo, <strong>{eur(p.netWN)}</strong> per la notte di weekend/festivo ({eur(p.netWN - p.netFN)} in più della notte feriale, stessa durata, per il servizio in sabato, domenica e festivi). Al dipendente si comunica il lordo, calcolato su misura in base a RAL e livello.
          </Pillar>
          <Pillar title="Indennità CCNL + gettone integrativo, a consuntivo">
            L'indennità di reperibilità prevista dal CCNL resta dovuta e copre pochi euro a turno. In aggiunta viene riconosciuto un <strong>gettone integrativo</strong>, calcolato sulla RAL e sul livello di ciascuno, che porta il lordo del turno al valore corrispondente al netto di riferimento. È erogato a fine mese, solo per i turni effettivamente svolti. Gli <strong>interventi</strong> effettivi sono retribuiti a parte, come lavoro straordinario con le maggiorazioni del CCNL.
          </Pillar>
          <Pillar title="Riposi tutelati per costruzione">
            Al massimo <strong>2 turni a settimana</strong> e <strong>4 al mese</strong>, mai in giorni consecutivi; chi copre un weekend o un festivo ha libero quello successivo. In caso di chiamata effettiva le <strong>11 ore di riposo</strong> ripartono da capo. Il calendario applica queste regole automaticamente e spiega ogni blocco.
          </Pillar>
          <Pillar title="Adesione volontaria e rotazione equa">
            Ognuno indica la propria disponibilità: <strong>volontario</strong>, <strong>disponibile fino a 1–3 turni al mese</strong>, oppure nessuna preferenza. Chi non aderisce resta fuori dalla rotazione senza alcuna conseguenza. I turni vengono distribuiti in modo equilibrato rispettando le preferenze espresse.
          </Pillar>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-700">
          <strong className="text-slate-900">Sostenibilità.</strong> Con un ricavo di <strong>{fmtEur(p.revenueFeriale)}</strong> per notte feriale e <strong>{fmtEur(p.revenueFestivo)}</strong> per giornata di weekend/festivo, il costo pieno della reperibilità incide per il <strong>{range(ferIncid)}</strong> sulla notte feriale e per il <strong>{range(festIncid)}</strong> sulla giornata di weekend/festivo. Il margine del piano compilato è nella pagina Conto economico.
        </p>
      </div>

      {/* 2. Modello matematico */}
      <Collapsible title="2. Come si calcola il gettone integrativo (CCNL Metalmeccanici Industria)">
        <H>2.1 Parametri contrattuali di riferimento</H>
        <UL>
          <li><strong>CCNL applicato:</strong> Metalmeccanici Industria, codice CNEL C011 (13 mensilità, divisore orario mensile <strong>173</strong>, divisore annuo <strong>2.249 ore</strong>).</li>
          <li><strong>Paga base oraria</strong> (base per il calcolo dello straordinario degli interventi): <Tex>{String.raw`P_{base} = \dfrac{\text{RAL}}{13 \times 173} = \dfrac{\text{RAL}}{2.249}`}</Tex></li>
        </UL>

        <H>2.2 Indennità tabellare minima di reperibilità (lorda)</H>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[480px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3">Livelli</th><th className="py-2 pr-3 text-right">Feriale notturno</th><th className="py-2 pr-3 text-right">Sabato / giorno libero</th><th className="py-2 text-right">Domenica / festivo</th></tr></thead>
            <tbody>
              {(['g1', 'g2', 'g3'] as const).map((g) => (
                <tr key={g} className="border-b border-slate-100"><td className="py-2 pr-3 font-medium">{GROUP_LABEL[g]}</td><td className="py-2 pr-3 text-right">{fmtEur(p.indemnity[g].feriale)}</td><td className="py-2 pr-3 text-right">{fmtEur(p.indemnity[g].sabato)}</td><td className="py-2 text-right">{fmtEur(p.indemnity[g].domenica)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Ripartizione sui 2 slot weekend/festivi attualmente impostata: <strong>{p.indemnitySplit === 'intera' ? 'indennità giornaliera intera per ciascuno slot' : 'pro-quota orario (Diurno 9/24, Notturno 15/24)'}</strong> (modificabile nella pagina Parametri). La scelta non cambia netto né costo aziendale, ma solo la ripartizione tra indennità CCNL e integrazione.
        </p>

        <H>2.3 Dal netto di riferimento al lordo e al costo aziendale</H>
        <P>Per arrivare al netto di riferimento il simulatore applica il cuneo fiscale marginale stimato per fascia di RAL (contributi INPS dipendente 9,19%, IRPEF marginale + addizionali, décalage detrazioni):</P>
        <UL>
          <li>RAL ≤ 28.000 €: <Tex>{String.raw`K_{netto} = ${fmtNum(p.kNetLow).replace(',', '{,}')}`}</Tex></li>
          <li>RAL 28.001 € – 50.000 €: <Tex>{String.raw`K_{netto} = ${fmtNum(p.kNetMid).replace(',', '{,}')}`}</Tex></li>
          <li>RAL &gt; 50.000 €: <Tex>{String.raw`K_{netto} = ${fmtNum(p.kNetHigh).replace(',', '{,}')}`}</Tex></li>
        </UL>
        <Tex block>{String.raw`L_{tot} = \frac{N_{rif}}{K_{netto}} \qquad G_{int} = \max(0,\; L_{tot} - I_{ccnl}) \qquad C_{az} = L_{tot} \times ${fmtNum(p.costMultiplier).replace(',', '{,}')}`}</Tex>
        <P>
          <strong>Gettone integrativo.</strong> L'importo lordo da erogare come voce dedicata è <Tex>{String.raw`G_{int}`}</Tex>: il dipendente riceve in busta l'indennità CCNL più il gettone, per un totale di <Tex>{String.raw`L_{tot}`}</Tex> lordi, che corrisponde al netto di riferimento (il netto effettivo dipende dalla situazione fiscale di ciascuno). Il costo aziendale <Tex>{String.raw`C_{az}`}</Tex> include contributi INPS a carico azienda (~23,8%–24,5%), quota TFR 6,91% e premio INAIL.
        </P>
      </Collapsible>

      {/* 3. Tutele e conformità */}
      <Collapsible title="3. Tutele, riposi e riferimenti normativi">
        <P>L'approccio è costruito nel rispetto del D.Lgs. 66/2003 sull'orario di lavoro, del CCNL Metalmeccanici Industria e della tutela assicurativa INAIL, con un'attenzione particolare all'equilibrio tra disponibilità richiesta e tempo di recupero.</P>
        <H>3.1 Conformità ai riposi giornalieri e settimanali (artt. 7 e 9 D.Lgs. 66/2003)</H>
        <UL>
          <li><strong>Riposo giornaliero (11 ore consecutive ogni 24).</strong> La reperibilità passiva non costituisce prestazione lavorativa effettiva e non interrompe il riposo. In caso di <strong>chiamata effettiva</strong> durante la notte, il conteggio delle 11 ore riparte integralmente dal termine dell'intervento: se l'orario del mattino successivo ricade entro tali 11 ore, il lavoratore posticipa l'ingresso o salta la frazione/giornata lavorativa senza penalizzazioni.</li>
          <li><strong>Riposo settimanale (35 ore consecutive ogni 7 giorni)</strong>, garantito su due livelli:
            <ol className="mt-1 ml-5 list-decimal space-y-1">
              <li><strong>Divieto di continuità Venerdì–Sabato e Domenica–Lunedì:</strong> nessun turno in giorni di calendario adiacenti; chi copre la notte del venerdì non può coprire il sabato, chi copre la domenica non può coprire il lunedì, e mai sabato e domenica consecutivi.</li>
              <li><strong>Recupero settimana successiva:</strong> chi copre un turno weekend/festivo nella settimana <Tex>W</Tex> è bloccato su tutti i weekend/festivi della settimana <Tex>W+1</Tex>.</li>
            </ol>
          </li>
        </UL>
        <H>3.2 Liquidazione a consuntivo</H>
        <UL>
          <li><strong>Liquidazione a consuntivo.</strong> Gli importi vengono caricati solo a fine mese, dopo la verifica dell'effettivo svolgimento del turno e in assenza di eventi impeditivi o infortuni, eliminando il rischio di incongruenze assicurative INAIL ex-ante.</li>
          <li><strong>Gettone integrativo.</strong> Voce retributiva dedicata, pari all'integrazione lorda calcolata dal simulatore: remunera la sola disponibilità passiva, è tracciabile turno per turno e non richiede di registrare in presenze ore non effettivamente lavorate.</li>
          <li><strong>Interventi effettivi.</strong> Le ore di intervento, anche da remoto, sono orario di lavoro e vengono retribuite come lavoro straordinario con le maggiorazioni del CCNL per fascia (straordinario diurno, notturno, festivo), oltre all'indennità di reperibilità e al gettone.</li>
        </UL>
        <H>3.3 Volontarietà ed equità della rotazione</H>
        <P>L'adesione è <strong>volontaria</strong> e regolata da una rotazione equa (max 2 turni/settimana non consecutivi, max 4 turni/mese). Ognuno può indicarsi come volontario, fissare un massimo di 1, 2 o 3 turni al mese oppure non esprimere preferenze: la pianificazione impiega prima i volontari e non supera mai i limiti indicati. Chi non aderisce esce dalla rotazione senza ripercussioni e la copertura viene ricalcolata sulle persone disponibili.</P>
      </Collapsible>

      {/* 4. Tabella rapida – calcolata dal motore con i parametri correnti */}
      <Collapsible title="4. Valori di riferimento per RAL e livello (CCNL Metalmeccanici)">
        <RefTable p={p} />
      </Collapsible>
    </div>
  )
}

// ---------- Tabella di riferimento rapido (qualsiasi livello) ----------
const REF_RALS = Array.from({ length: 24 }, (_, i) => 24_000 + i * 2_000) // 24k → 70k, passo 2k (copre anche i quadri)
const ROW_H = 52
const HEAD_H = 36
const KINDS = ['FN', 'WD', 'WN'] as const

function refRow(ral: number, level: Level, p: Params) {
  const cells = KINDS.map((kind) => ({ kind, e: slotEconomics({ level, ral }, { date: kind === 'FN' ? '2026-11-24' : '2026-11-29', kind }, p) }))
  return { ral, base: baseHourly(ral), k: kNetto(ral, p), cells }
}

const KIND_LABEL = { FN: 'Notte feriale', WD: 'Festivo diurno', WN: 'Festivo notte' } as const

function RefTable({ p }: { p: Params }) {
  const [custom, setCustom] = useState(32_000)
  const [level, setLevel] = useState<Level>('B1')
  const valid = Number.isFinite(custom) && custom > 0
  const live = valid ? refRow(custom, level, p) : null
  const ind = p.indemnity[LEVEL_GROUP[level]]
  const net = { FN: p.netFN, WD: p.netWD, WN: p.netWN }

  return (
    <div>
      <P>Valori calcolati in tempo reale con i parametri correnti per il livello selezionato, ora <strong>{LEVEL_LABEL[level]}</strong> (indennità CCNL feriale {fmtEur(ind.feriale)}, sabato {fmtEur(ind.sabato)}, domenica/festivo {fmtEur(ind.domenica)} lordi).
        Il livello cambia solo l'indennità CCNL già prevista, e quindi la quota del gettone integrativo; lordo complessivo e costo aziendale dipendono dalla fascia di RAL. Domenica e festivi usano l'indennità festiva, il sabato quella del giorno libero.</P>

      {/* Calcolo al volo per una RAL qualsiasi */}
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 lg:flex-row lg:items-start">
        <div className="grid shrink-0 gap-3 lg:w-56">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Livello CCNL</span>
          <select value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Livello CCNL"
            className="mt-1 block w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-slate-300">
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Calcola per una RAL</span>
          <div className="mt-1 flex items-center rounded-lg bg-white ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-blue-600">
            <input type="number" min={0} step={500} value={Number.isFinite(custom) ? custom : ''} onChange={(e) => setCustom(e.target.valueAsNumber)}
              className="num w-full min-w-0 rounded-lg bg-transparent px-3 py-2 text-base font-semibold outline-none" aria-label="RAL da calcolare" />
            <span className="pr-3 text-sm text-slate-500">€</span>
          </div>
          {live && <span className="mt-1 block text-xs text-slate-500">Paga base {fmtEur(live.base)}/h · K netto {fmtNum(live.k)}</span>}
        </label>
        </div>
        {live ? (
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            {live.cells.map((c) => (
              <div key={c.kind} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <div className="text-xs font-medium text-slate-500">{KIND_LABEL[c.kind]} · {eur(net[c.kind])} netti di riferimento</div>
                <div className="num mt-2 text-2xl leading-tight font-semibold text-blue-900">{fmtEur(c.e.lcomp)}</div>
                <div className="text-xs text-slate-500">gettone integrativo</div>
                <div className="num mt-2 border-t border-slate-100 pt-2 text-sm text-slate-700">
                  {fmtEur(c.e.iccnl)} indennità CCNL + gettone = <span className="font-semibold text-slate-900">{fmtEur(c.e.ltot)}</span> lordi
                </div>
                <div className="num text-xs text-slate-500">Costo aziendale {fmtEur(c.e.cost)}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">Inserisci una RAL valida.</p>}
      </div>

      {/* Tabella 24k–70k: 5 righe visibili, scorrimento verticale */}
      <div className="mt-4 overflow-auto rounded-lg border border-slate-200 print:max-h-none print:overflow-visible" style={{ maxHeight: HEAD_H + ROW_H * 5 + 2 }}>
        <table className="num w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500" style={{ height: HEAD_H }}>
              <th className="px-3 whitespace-nowrap">RAL</th><th className="pr-3 text-right whitespace-nowrap">Coeff. K</th>
              {KINDS.map((k) => <th key={k} className="pr-3 whitespace-nowrap">{KIND_LABEL[k]} ({eur(net[k])} netti)</th>)}
              <th className="pr-3 text-right whitespace-nowrap">Costo az. feriale / fest. notte</th>
            </tr>
          </thead>
          <tbody>
            {REF_RALS.map((ral) => {
              const r = refRow(ral, level, p)
              return (
                <tr key={ral} className="border-t border-slate-100" style={{ height: ROW_H }}>
                  <td className="px-3 font-semibold whitespace-nowrap">{fmtEur(ral).replace(',00', '')}</td>
                  <td className="pr-3 text-right whitespace-nowrap">{fmtNum(r.k)}</td>
                  {r.cells.map((c) => (
                    <td key={c.kind} className="pr-3 whitespace-nowrap"><div>Gettone <strong>{fmtEur(c.e.lcomp)}</strong></div><div className="text-xs text-slate-500">{fmtEur(c.e.ltot)} lordi complessivi</div></td>
                  ))}
                  <td className="pr-3 text-right whitespace-nowrap">{fmtEur(r.cells[0].e.cost)} / {fmtEur(r.cells[2].e.cost)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">Livello {LEVEL_LABEL[level]} · RAL da 24.000 € a 70.000 € con passo di 2.000 € · scorri la tabella per vedere tutte le righe. Gli importi sono lordi.</p>
    </div>
  )
}
