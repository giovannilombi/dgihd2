import katex from 'katex'
import type { ReactNode } from 'react'
import { baseHourly, fmtEur, fmtNum, fmtPct, saturdayHours, slotEconomics, sundayHours } from '../lib/economics'
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

export function HrDoc({ params: p, people }: { params: Params; people: Person[] }) {
  // Incidenza del costo sul ricavo calcolata sul team attivo (riferimento dinamico per l'abstract).
  const active = people.filter((x) => x.active)
  const ref = active.length ? active : people
  const ferIncid = ref.map((x) => slotEconomics(x, { date: '2026-11-24', kind: 'FN' }, p).cost / p.revenueFeriale * 100)
  const festIncid = ref.map((x) => (slotEconomics(x, { date: '2026-11-29', kind: 'WD' }, p).cost + slotEconomics(x, { date: '2026-11-29', kind: 'WN' }, p).cost) / p.revenueFestivo * 100)
  const range = (a: number[]) => a.length ? (Math.min(...a).toFixed(1) === Math.max(...a).toFixed(1) ? fmtPct(Math.min(...a)) : `${fmtPct(Math.min(...a))}–${fmtPct(Math.max(...a))}`) : '–'

  const refRals = [26_000, 30_000, 34_000, 38_000]
  const b1 = (ral: number): Pick<Person, 'level' | 'ral'> => ({ level: 'B1', ral })

  return (
    <div className="space-y-3">
      {/* 1. Abstract – sempre visibile */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
        <h3 className="font-semibold text-blue-950">1. Abstract Esecutivo</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Per garantire la copertura del servizio di reperibilità nel periodo <strong>Novembre – Dicembre 2026</strong> (fascia notturna feriale <strong>18:00–09:00</strong> e copertura h24 nei giorni di <strong>sabato, domenica e festivi</strong> suddivisa su 2 slot: Diurno <code>09:00–18:00</code> e Notturno <code>18:00–09:00</code>), si propone un modello operativo ed economico basato su <strong>adesione volontaria, equità retributiva, tutela rigorosa dei riposi legali e sostenibilità finanziaria</strong>.
        </p>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
          <div>
            <strong className="text-slate-900">Obiettivo Retributivo (Gettone Netto Garantito).</strong> Riconoscere al personale aderente un beneficio netto certo per ogni turno di sola disponibilità passiva (esclusi eventuali interventi effettivi, retribuiti a parte secondo CCNL):
            <UL>
              <li><strong>{eur(p.netFN)} netti</strong> per ogni slot notturno feriale (<code>18:00–09:00</code>) e <strong>{eur(p.netWD)} netti</strong> per ogni slot diurno weekend/festivo (<code>09:00–18:00</code>).</li>
              <li><strong>{eur(p.netWN)} netti</strong> per ogni slot notturno weekend/festivo (<code>18:00–09:00</code>, maggiorazione equitativa di {eur(p.netWN - p.netWD)} netti per il maggiore disagio e la durata di 15 ore).</li>
            </UL>
          </div>
          <P>
            <strong className="text-slate-900">Meccanismo di Liquidazione (Ore di Compensazione a Consuntivo o Forfait HR).</strong> Poiché l'indennità tabellare del CCNL Metalmeccanici Industria copre solo pochi euro netti a turno, il delta necessario a raggiungere esattamente il netto target viene calcolato in base alla RAL e all'inquadramento del singolo lavoratore. La liquidazione avviene <strong>a consuntivo a fine mese</strong> tramite <strong>ore di compensazione</strong> imputate su <strong>un solo giorno del weekend</strong> (di default la <strong>Domenica</strong>, oppure il <strong>Sabato</strong> qualora il lavoratore abbia reperibilità il lunedì successivo), con un <strong>tetto massimo di {fmtNum(p.capHours)} ore giornaliere</strong> che giustifica oggettivamente il limite di 2 turni/settimana. Resta facoltà di HR optare, a parità di importo lordo e costo aziendale, per l'erogazione diretta come voce dedicata (<em>Gettone di disponibilità</em>).
          </P>
          <P>
            <strong className="text-slate-900">Tutela dei Riposi e Volontarietà.</strong> Adesione su base volontaria con rotazione equa; massimale di <strong>2 turni/settimana</strong> (mai consecutivi e mai adiacenti a turni di weekend); <strong>4 turni/mese</strong> massimi; blocco automatico del weekend/festivo successivo in caso di impegno nel weekend; ripartenza obbligatoria delle <strong>11 ore di riposo consecutivo</strong> in caso di chiamata effettiva.
          </P>
          <P>
            <strong className="text-slate-900">Sostenibilità Economica.</strong> A fronte di un ricavo cliente scontato di <strong>{fmtEur(p.revenueFeriale)}/slot feriale</strong> e <strong>{fmtEur(p.revenueFestivo)}/giornata festiva</strong>, il costo aziendale pieno della reperibilità passiva incide, sul team attuale, per il <strong>{range(ferIncid)}</strong> sulla notte feriale e per il <strong>{range(festIncid)}</strong> sulla giornata weekend/festiva (2 slot). Il margine complessivo del piano compilato è riportato nella Dashboard (Sezione D).
          </P>
        </div>
      </div>

      {/* 2. Modello matematico */}
      <Collapsible title="2. Modello Matematico e Fiscalità (CCNL Metalmeccanici Industria)">
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
          Ripartizione sui 2 slot weekend/festivi attualmente impostata: <strong>{p.indemnitySplit === 'intera' ? 'indennità giornaliera intera per ciascuno slot' : 'pro-quota orario (Diurno 9/24, Notturno 15/24)'}</strong> (modificabile nella Sezione A). La scelta non cambia netto né costo aziendale, ma solo la ripartizione tra indennità CCNL e integrazione.
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
          <strong>Giustificazione del limite di 2 turni/settimana (cap {fmtNum(p.capHours)} h/giorno).</strong> Le ore di compensazione della settimana sono imputate su <strong>un solo giorno del weekend</strong> e non possono superare una giornata lavorativa standard. Due slot richiedono indicativamente 6–9 ore a seconda di RAL e tipologia: una terza notte sforerebbe sempre il tetto, e per le RAL più basse anche alcune combinazioni di 2 slot vengono bloccate dal motore di validazione. Il costo aziendale <Tex>{String.raw`C_{az}`}</Tex> include contributi INPS a carico azienda (~23,8%–24,5%), quota TFR 6,91% e premio INAIL.
        </P>
      </Collapsible>

      {/* 3. Analisi giuridica */}
      <Collapsible title="3. Analisi Giuridica e Tenuta Sindacale (perché questo modello regge)">
        <P>Il modello risponde ai rilievi di natura giuslavoristica (D.Lgs. 66/2003, CCNL Metalmeccanici Industria, tutela INAIL) e sindacale (RSU).</P>
        <H>3.1 Conformità ai riposi giornalieri e settimanali (artt. 7 e 9 D.Lgs. 66/2003)</H>
        <UL>
          <li><strong>Riposo giornaliero (11 ore consecutive ogni 24).</strong> La reperibilità passiva non costituisce prestazione lavorativa effettiva e non interrompe il riposo. In caso di <strong>chiamata effettiva</strong> durante la notte, il conteggio delle 11 ore riparte integralmente dal termine dell'intervento: se l'orario del mattino successivo ricade entro tali 11 ore, il lavoratore posticipa l'ingresso o salta la frazione/giornata lavorativa senza penalizzazioni.</li>
          <li><strong>Riposo settimanale (35 ore consecutive ogni 7 giorni)</strong>, garantito su tre livelli:
            <ol className="mt-1 ml-5 list-decimal space-y-1">
              <li><strong>Divieto di continuità Venerdì–Sabato e Domenica–Lunedì:</strong> nessun turno in giorni di calendario adiacenti; chi copre la notte del venerdì non può coprire il sabato, chi copre la domenica non può coprire il lunedì, e mai sabato e domenica consecutivi.</li>
              <li><strong>Imputazione su un solo giorno del weekend (cap {fmtNum(p.capHours)} h):</strong> le ore di compensazione sono caricate su un solo giorno (Domenica, oppure Sabato se c'è reperibilità il lunedì o un turno di domenica), lasciando l'altro giorno libero (35 ore di stacco garantite).</li>
              <li><strong>Recupero settimana successiva:</strong> chi copre un turno weekend/festivo nella settimana <Tex>W</Tex> è bloccato su tutti i weekend/festivi della settimana <Tex>W+1</Tex>.</li>
            </ol>
          </li>
        </UL>
        <H>3.2 Consuntivazione a fine mese, tutela INAIL e opzione forfait HR</H>
        <UL>
          <li><strong>Liquidazione a consuntivo.</strong> Le ore di compensazione vengono caricate a sistema solo a fine mese, dopo la verifica dell'effettivo svolgimento del turno e in assenza di eventi impeditivi o infortuni, eliminando il rischio di incongruenze assicurative INAIL ex-ante.</li>
          <li><strong>Ore di compensazione (preferibile) o forfait.</strong> Le ore si integrano nei flussi standard di rilevazione presenze/straordinari senza voci retributive ad hoc; il simulatore espone comunque l'<strong>importo lordo equivalente</strong> qualora HR preferisca erogarlo come <em>Gettone di disponibilità</em>, a parità di netto e di costo aziendale.</li>
        </UL>
        <H>3.3 Volontarietà ed equità della rotazione</H>
        <P>L'adesione è <strong>volontaria</strong> e regolata da rotazione equa (max 2 turni/settimana non consecutivi, max 4 turni/mese). Chi non aderisce esce dalla rotazione senza ripercussioni e il sistema ricalcola la copertura sulle risorse attive.</P>
      </Collapsible>

      {/* 4. Tabella rapida – calcolata dal motore con i parametri correnti */}
      <Collapsible title="4. Tabella Riferimento Rapido per RAL (Livello B1 – CCNL Metalmeccanici)">
        <P>Valori calcolati in tempo reale con i parametri correnti per un dipendente <strong>Livello B1</strong> (indennità feriale {fmtEur(p.indemnity.g3.feriale)}, festiva {fmtEur(p.indemnity.g3.domenica)} lordi). Ore del sabato calcolate a scaglioni esatti.</P>
        <div className="mt-3 overflow-x-auto">
          <table className="num w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">RAL</th><th className="py-2 pr-3 text-right">Paga base</th>
                <th className="py-2 pr-3">Notte feriale ({eur(p.netFN)} netti)</th>
                <th className="py-2 pr-3">Festivo diurno ({eur(p.netWD)} netti)</th>
                <th className="py-2 pr-3">Festivo notte ({eur(p.netWN)} netti)</th>
                <th className="py-2 text-right">Costo az. feriale / fest. notte</th>
              </tr>
            </thead>
            <tbody>
              {refRals.map((ral) => {
                const cells = (['FN', 'WD', 'WN'] as const).map((kind) => {
                  const e = slotEconomics(b1(ral), { date: kind === 'FN' ? '2026-11-24' : '2026-11-29', kind }, p)
                  return { e, dom: sundayHours(e.lcomp, ral, p), sab: saturdayHours(e.lcomp, ral, p) }
                })
                return (
                  <tr key={ral} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-semibold">{fmtEur(ral).replace(',00', '')}</td>
                    <td className="py-2 pr-3 text-right">{fmtEur(baseHourly(ral))}</td>
                    {cells.map((c, i) => (
                      <td key={i} className="py-2 pr-3">{fmtEur(c.e.ltot)} lordi · <strong>{fmtNum(c.dom)} h</strong> Dom · {fmtNum(c.sab)} h Sab</td>
                    ))}
                    <td className="py-2 text-right">{fmtEur(cells[0].e.cost)} / {fmtEur(cells[2].e.cost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Collapsible>
    </div>
  )
}
