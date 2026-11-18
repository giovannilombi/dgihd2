import katex from 'katex'
import { useState, type ReactNode } from 'react'
import { baseHourly, fmtEur, kNetto, fmtNum, fmtPct, saturdayHours, slotEconomics, sundayHours } from '../lib/economics'
import { GROUP_LABEL, type Params, type Person } from '../lib/types'
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
  const active = people.filter((x) => x.active)
  const ref = active.length ? active : people
  const ferIncid = ref.map((x) => slotEconomics(x, { date: '2026-11-24', kind: 'FN' }, p).cost / p.revenueFeriale * 100)
  const festIncid = ref.map((x) => (slotEconomics(x, { date: '2026-11-29', kind: 'WD' }, p).cost + slotEconomics(x, { date: '2026-11-29', kind: 'WN' }, p).cost) / p.revenueFestivo * 100)
  const range = (a: number[]) => a.length ? (Math.min(...a).toFixed(1) === Math.max(...a).toFixed(1) ? fmtPct(Math.min(...a)) : `${fmtPct(Math.min(...a))}–${fmtPct(Math.max(...a))}`) : '–'


  return (
    <div className="space-y-3">
      {/* 1. Sintesi dell'approccio – sempre visibile */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
        <h3 className="font-semibold text-blue-950">1. In sintesi</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          La reperibilità di <strong>Novembre – Dicembre 2026</strong> copre le notti feriali (<strong>18:00–09:00</strong>) e l'intera giornata di <strong>sabati, domeniche e festivi</strong>, suddivisa in due turni: Diurno <code>09:00–18:00</code> e Notturno <code>18:00–09:00</code>.
          L'approccio parte da un principio semplice: <strong>chi dà la propria disponibilità deve sapere in anticipo quanto riceve, avere i riposi garantiti e partecipare a una rotazione equa</strong>, con un modello economicamente sostenibile.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Pillar title="Un importo netto chiaro per ogni turno">
            Per ogni turno di sola disponibilità è riconosciuto un <strong>importo netto garantito</strong>: <strong>{eur(p.netFN)}</strong> per la notte feriale, <strong>{eur(p.netWD)}</strong> per il diurno di weekend/festivo, <strong>{eur(p.netWN)}</strong> per la notte di weekend/festivo, che dura 15 ore e pesa di più. Gli eventuali interventi effettivi sono retribuiti a parte, come da CCNL.
          </Pillar>
          <Pillar title="Gettone di disponibilità, a consuntivo">
            L'indennità prevista dal CCNL copre pochi euro a turno: la differenza fino al netto garantito, calcolata sulla RAL e sul livello di ciascuno, viene erogata a fine mese come <strong>Gettone di disponibilità</strong>, solo per i turni effettivamente svolti. In alternativa, a parità di netto e di costo, la stessa cifra può essere liquidata come <strong>ore di straordinario</strong> su un giorno del weekend, entro {fmtNum(p.capHours)} ore.
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
      <Collapsible title="2. Come si calcola il gettone (CCNL Metalmeccanici Industria)">
        <H>2.1 Parametri contrattuali di riferimento</H>
        <UL>
          <li><strong>CCNL applicato:</strong> Metalmeccanici Industria (13 mensilità, divisore orario mensile <strong>173</strong>, divisore annuo <strong>2.249 ore</strong>).</li>
          <li><strong>Paga base oraria:</strong> <Tex>{String.raw`P_{base} = \dfrac{\text{RAL}}{13 \times 173} = \dfrac{\text{RAL}}{2.249}`}</Tex></li>
          <li><strong>Domenica / Festivo (default):</strong> +{fmtNum(p.majDom * 100, 0)}% sulla paga base — <Tex>{String.raw`P_{dom} = P_{base} \times ${fmtNum(1 + p.majDom).replace(',', '{,}')}`}</Tex></li>
          <li><strong>Sabato (fallback):</strong> +{fmtNum(p.majSab1 * 100, 0)}% per le prime 2 ore e +{fmtNum(p.majSab2 * 100, 0)}% dalla terza ora in poi (calcolo a scaglioni).</li>
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

        <H>2.3 Dal netto target al lordo e al costo aziendale</H>
        <P>Per garantire esattamente il netto target in busta paga il simulatore applica il cuneo fiscale marginale effettivo (contributi INPS dipendente 9,19%, IRPEF marginale + addizionali, décalage detrazioni):</P>
        <UL>
          <li>RAL ≤ 28.000 €: <Tex>{String.raw`K_{netto} = ${fmtNum(p.kNetLow).replace(',', '{,}')}`}</Tex></li>
          <li>RAL 28.001 € – 50.000 €: <Tex>{String.raw`K_{netto} = ${fmtNum(p.kNetMid).replace(',', '{,}')}`}</Tex></li>
          <li>RAL &gt; 50.000 €: <Tex>{String.raw`K_{netto} = ${fmtNum(p.kNetHigh).replace(',', '{,}')}`}</Tex></li>
        </UL>
        <Tex block>{String.raw`L_{tot} = \frac{N_{target}}{K_{netto}} \qquad L_{comp} = \max(0,\; L_{tot} - I_{ccnl}) \qquad H_{dom} = \frac{L_{comp}}{P_{base} \times ${fmtNum(1 + p.majDom).replace(',', '{,}')}}`}</Tex>
        <Tex block>{String.raw`H_{sab} = \begin{cases} \dfrac{L_{comp}}{P_{base}\times ${fmtNum(1 + p.majSab1).replace(',', '{,}')}} & L_{comp} \le 2\,P_{base}\times ${fmtNum(1 + p.majSab1).replace(',', '{,}')} \\[2ex] 2 + \dfrac{L_{comp} - 2\,P_{base}\times ${fmtNum(1 + p.majSab1).replace(',', '{,}')}}{P_{base}\times ${fmtNum(1 + p.majSab2).replace(',', '{,}')}} & \text{altrimenti}\end{cases} \qquad C_{az} = L_{tot} \times ${fmtNum(p.costMultiplier).replace(',', '{,}')}`}</Tex>
        <P>
          <strong>Liquidazione preferibile: Gettone di disponibilità.</strong> L'importo lordo da erogare come voce dedicata è <Tex>{String.raw`L_{comp}`}</Tex>: il dipendente riceve in busta l'indennità CCNL più il gettone, per un totale di <Tex>{String.raw`L_{tot}`}</Tex> lordi, pari al netto target.
        </P>
        <P>
          <strong>Alternativa: ore di straordinario e cap {fmtNum(p.capHours)} h/giorno.</strong> Se si sceglie la liquidazione in ore (<Tex>{String.raw`H_{dom}`}</Tex> o <Tex>{String.raw`H_{sab}`}</Tex>), le ore della settimana sono imputate su <strong>un solo giorno del weekend</strong> e non possono superare una giornata lavorativa standard. Due slot richiedono indicativamente 6–9 ore a seconda di RAL e tipologia: una terza notte sforerebbe sempre il tetto. Il simulatore applica comunque il cap a ogni assegnazione, così l'alternativa resta sempre praticabile qualunque modalità venga scelta. Il costo aziendale <Tex>{String.raw`C_{az}`}</Tex> include contributi INPS a carico azienda (~23,8%–24,5%), quota TFR 6,91% e premio INAIL.
        </P>
      </Collapsible>

      {/* 3. Tutele e conformità */}
      <Collapsible title="3. Tutele, riposi e riferimenti normativi">
        <P>L'approccio è costruito nel rispetto del D.Lgs. 66/2003 sull'orario di lavoro, del CCNL Metalmeccanici Industria e della tutela assicurativa INAIL, con un'attenzione particolare all'equilibrio tra disponibilità richiesta e tempo di recupero.</P>
        <H>3.1 Conformità ai riposi giornalieri e settimanali (artt. 7 e 9 D.Lgs. 66/2003)</H>
        <UL>
          <li><strong>Riposo giornaliero (11 ore consecutive ogni 24).</strong> La reperibilità passiva non costituisce prestazione lavorativa effettiva e non interrompe il riposo. In caso di <strong>chiamata effettiva</strong> durante la notte, il conteggio delle 11 ore riparte integralmente dal termine dell'intervento: se l'orario del mattino successivo ricade entro tali 11 ore, il lavoratore posticipa l'ingresso o salta la frazione/giornata lavorativa senza penalizzazioni.</li>
          <li><strong>Riposo settimanale (35 ore consecutive ogni 7 giorni)</strong>, garantito su tre livelli:
            <ol className="mt-1 ml-5 list-decimal space-y-1">
              <li><strong>Divieto di continuità Venerdì–Sabato e Domenica–Lunedì:</strong> nessun turno in giorni di calendario adiacenti; chi copre la notte del venerdì non può coprire il sabato, chi copre la domenica non può coprire il lunedì, e mai sabato e domenica consecutivi.</li>
              <li><strong>Un solo giorno del weekend impegnato:</strong> con il gettone non si registrano ore aggiuntive; nell'alternativa in ore, queste sono caricate su un solo giorno (Domenica, oppure Sabato se c'è reperibilità il lunedì o un turno di domenica) entro il cap di {fmtNum(p.capHours)} h, lasciando l'altro giorno libero (35 ore di stacco garantite). Se sabato e domenica sono entrambi a contatto con un turno (turno il sabato e il lunedì successivo), le ore passano alla Domenica successiva o, in alternativa, alla Domenica precedente dello stesso mese; se nessuna è libera il turno non è assegnabile.</li>
              <li><strong>Recupero settimana successiva:</strong> chi copre un turno weekend/festivo nella settimana <Tex>W</Tex> è bloccato su tutti i weekend/festivi della settimana <Tex>W+1</Tex>.</li>
            </ol>
          </li>
        </UL>
        <H>3.2 Liquidazione a consuntivo</H>
        <UL>
          <li><strong>Liquidazione a consuntivo.</strong> Gli importi vengono caricati solo a fine mese, dopo la verifica dell'effettivo svolgimento del turno e in assenza di eventi impeditivi o infortuni, eliminando il rischio di incongruenze assicurative INAIL ex-ante.</li>
          <li><strong>Gettone di disponibilità (preferibile).</strong> Voce retributiva dedicata, pari all'integrazione lorda calcolata dal simulatore: remunera la sola disponibilità passiva, è tracciabile turno per turno e non richiede di registrare in presenze ore non effettivamente lavorate.</li>
          <li><strong>Straordinario su Domenica (alternativa).</strong> Qualora si preferisca non introdurre una nuova voce, lo stesso importo lordo può essere liquidato come ore di straordinario domenicale (o del sabato, nei casi previsti), integrate nei flussi standard di rilevazione presenze. Netto al dipendente e costo aziendale restano identici; va validato con il consulente del lavoro, poiché le ore registrate non corrispondono a prestazione effettiva.</li>
        </UL>
        <H>3.3 Volontarietà ed equità della rotazione</H>
        <P>L'adesione è <strong>volontaria</strong> e regolata da una rotazione equa (max 2 turni/settimana non consecutivi, max 4 turni/mese). Ognuno può indicarsi come volontario, fissare un massimo di 1, 2 o 3 turni al mese oppure non esprimere preferenze: la pianificazione impiega prima i volontari e non supera mai i limiti indicati. Chi non aderisce esce dalla rotazione senza ripercussioni e la copertura viene ricalcolata sulle persone disponibili.</P>
      </Collapsible>

      {/* 4. Tabella rapida – calcolata dal motore con i parametri correnti */}
      <Collapsible title="4. Valori di riferimento per RAL (Livello B1 – CCNL Metalmeccanici)">
        <RefTable p={p} />
      </Collapsible>
    </div>
  )
}

// ---------- Tabella di riferimento rapido (B1) ----------
const REF_RALS = Array.from({ length: 9 }, (_, i) => 24_000 + i * 2_000) // 24k → 40k, passo 2k
const ROW_H = 52
const HEAD_H = 36
const KINDS = ['FN', 'WD', 'WN'] as const

function refRow(ral: number, p: Params) {
  const cells = KINDS.map((kind) => {
    const e = slotEconomics({ level: 'B1', ral }, { date: kind === 'FN' ? '2026-11-24' : '2026-11-29', kind }, p)
    return { kind, e, dom: sundayHours(e.lcomp, ral, p), sab: saturdayHours(e.lcomp, ral, p) }
  })
  return { ral, base: baseHourly(ral), k: kNetto(ral, p), cells }
}

function HoursOption({ hours, day }: { hours: number; day: string }) {
  return (
    <div className="flex-1 rounded-md bg-slate-50 px-2 py-1.5 text-center ring-1 ring-slate-200">
      <div className="num text-lg leading-tight font-semibold text-slate-900">{fmtNum(hours)} h</div>
      <div className="text-xs text-slate-500">{day}</div>
    </div>
  )
}

const KIND_LABEL = { FN: 'Notte feriale', WD: 'Festivo diurno', WN: 'Festivo notte' } as const

function RefTable({ p }: { p: Params }) {
  const [custom, setCustom] = useState(32_000)
  const valid = Number.isFinite(custom) && custom > 0
  const live = valid ? refRow(custom, p) : null
  const net = { FN: p.netFN, WD: p.netWD, WN: p.netWN }

  return (
    <div>
      <P>Valori calcolati in tempo reale con i parametri correnti per un dipendente <strong>Livello B1</strong> (indennità feriale {fmtEur(p.indemnity.g3.feriale)}, festiva {fmtEur(p.indemnity.g3.domenica)} lordi). Il lordo corrisponde al <strong>Gettone di disponibilità</strong> (modalità preferibile). Le ore servono solo per l'alternativa in straordinario e vanno imputate <strong>o</strong> sulla Domenica <strong>oppure</strong> sul Sabato (mai su entrambi): il lordo liquidato è lo stesso, cambiano solo le ore perché cambia la maggiorazione. Ore del sabato calcolate a scaglioni esatti.</P>

      {/* Calcolo al volo per una RAL qualsiasi */}
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 lg:flex-row lg:items-start">
        <label className="block shrink-0 lg:w-56">
          <span className="text-xs font-semibold text-slate-700">Calcola per una RAL</span>
          <div className="mt-1 flex items-center rounded-lg bg-white ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-blue-600">
            <input type="number" min={0} step={500} value={Number.isFinite(custom) ? custom : ''} onChange={(e) => setCustom(e.target.valueAsNumber)}
              className="num w-full min-w-0 rounded-lg bg-transparent px-3 py-2 text-base font-semibold outline-none" aria-label="RAL da calcolare" />
            <span className="pr-3 text-sm text-slate-500">€</span>
          </div>
          {live && <span className="mt-1 block text-xs text-slate-500">Paga base {fmtEur(live.base)}/h · K netto {fmtNum(live.k)}</span>}
        </label>
        {live ? (
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            {live.cells.map((c) => (
              <div key={c.kind} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <div className="text-xs font-medium text-slate-500">{KIND_LABEL[c.kind]} · {eur(net[c.kind])} netti</div>
                <div className="mt-2 flex items-center gap-2">
                  <HoursOption hours={c.dom} day="Domenica" />
                  <span className="text-xs font-medium text-slate-500 italic">oppure</span>
                  <HoursOption hours={c.sab} day="Sabato" />
                </div>
                <div className="num mt-2 border-t border-slate-100 pt-2 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">{fmtEur(c.e.ltot)}</span> lordi <span className="text-xs text-slate-500">(stesso importo in entrambi i casi)</span>
                </div>
                <div className="num text-xs text-slate-500">Costo aziendale {fmtEur(c.e.cost)}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">Inserisci una RAL valida.</p>}
      </div>

      {/* Tabella 24k–40k: 5 righe visibili, scorrimento verticale */}
      <div className="mt-4 overflow-auto rounded-lg border border-slate-200 print:max-h-none print:overflow-visible" style={{ maxHeight: HEAD_H + ROW_H * 5 + 2 }}>
        <table className="num w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500" style={{ height: HEAD_H }}>
              <th className="px-3 whitespace-nowrap">RAL</th><th className="pr-3 text-right whitespace-nowrap">Paga base</th>
              {KINDS.map((k) => <th key={k} className="pr-3 whitespace-nowrap">{KIND_LABEL[k]} ({eur(net[k])} netti)</th>)}
              <th className="pr-3 text-right whitespace-nowrap">Costo az. feriale / fest. notte</th>
            </tr>
          </thead>
          <tbody>
            {REF_RALS.map((ral) => {
              const r = refRow(ral, p)
              return (
                <tr key={ral} className="border-t border-slate-100" style={{ height: ROW_H }}>
                  <td className="px-3 font-semibold whitespace-nowrap">{fmtEur(ral).replace(',00', '')}</td>
                  <td className="pr-3 text-right whitespace-nowrap">{fmtEur(r.base)}</td>
                  {r.cells.map((c) => (
                    <td key={c.kind} className="pr-3 whitespace-nowrap"><div>{fmtNum(c.dom)} h Dom <span className="text-xs text-slate-400 italic">oppure</span> {fmtNum(c.sab)} h Sab</div><div className="text-xs text-slate-500">{fmtEur(c.e.ltot)} lordi</div></td>
                  ))}
                  <td className="pr-3 text-right whitespace-nowrap">{fmtEur(r.cells[0].e.cost)} / {fmtEur(r.cells[2].e.cost)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">RAL da 24.000 € a 40.000 € con passo di 2.000 € · scorri la tabella per vedere tutte le righe. Gli importi sono lordi.</p>
    </div>
  )
}
