import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { fmtEur } from '../../lib/economics'
import { GUIDE_HASH, GUIDE_TONE, type GuideCtx, type GuideId } from '../../lib/guides'
import { callFeeText, fmtMinutes, recognizedHours } from '../../lib/overtime'
import { SHIFT_CAT_HOURS, SHIFT_CAT_LABEL, SHIFT_CATS } from '../../lib/hoursReport'
import { DEFAULT_PARAMS } from '../../lib/types'
import { InterventionChip } from '../InterventionChip'
import { Cards, DayChip, Faq, Field, Flow, List, LockGlyph, Mock, Note, P, PinGlyph, Steps, Table, Ui, UiBtn } from './kit'

interface Sec { key: string; title: string; body: ReactNode }

/**
 * Testo della guida di un profilo, con indice in alto che segue la lettura.
 * Le regole citate sono quelle dell'app (profili, permessi, stati); i valori degli esempi arrivano dai parametri.
 */
export function GuideDoc({ id, ctx, scrollRef }: { id: GuideId; ctx: GuideCtx; scrollRef: RefObject<HTMLDivElement | null> }) {
  const sections = build(id, ctx)
  const tone = GUIDE_TONE[id]
  const keys = sections.map((s) => s.key).join(',')
  const [active, setActive] = useState(sections[0].key)

  // Indice: evidenzia la sezione che si sta leggendo
  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    const list = keys.split(',')
    const on = () => {
      const top = box.getBoundingClientRect().top + 72
      let cur = list[0]
      for (const k of list) {
        const el = document.getElementById(`guida-${k}`)
        if (el && el.getBoundingClientRect().top <= top) cur = k
      }
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) cur = list[list.length - 1]
      setActive(cur)
    }
    on()
    box.addEventListener('scroll', on, { passive: true })
    return () => box.removeEventListener('scroll', on)
  }, [keys, scrollRef])

  const go = (key: string) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`guida-${key}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <>
      <nav aria-label="Indice della guida" className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur sm:px-8">
        <ol className="flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {sections.map((s, i) => (
            <li key={s.key} className="shrink-0">
              <button type="button" onClick={() => go(s.key)} aria-current={active === s.key ? 'location' : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${active === s.key ? tone.solid : 'text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'}`}>
                {i + 1} · {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((s, i) => (
        <section key={s.key} id={`guida-${s.key}`} aria-labelledby={`guida-${s.key}-t`} className={`scroll-mt-14 px-5 py-6 sm:px-8 ${i ? 'border-t border-slate-100' : ''}`}>
          <h3 id={`guida-${s.key}-t`} className="flex items-center gap-3 text-base font-semibold text-slate-900">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-semibold ${tone.solid}`}>{i + 1}</span>
            {s.title}
          </h3>
          <div className="mt-4 space-y-4">{s.body}</div>
        </section>
      ))}
      <p className="px-5 pb-8 pt-2 text-xs text-slate-400 sm:px-8">Riferimento: CCNL Metalmeccanici Industria (CNEL C011). Il dettaglio dei calcoli è nella pagina Approccio, per chi la vede.</p>
    </>
  )
}

function build(id: GuideId, c: GuideCtx): Sec[] {
  switch (id) {
    case 'turnista': return turnista(c)
    case 'director': return planner(c, false)
    case 'governance': return planner(c, true)
    case 'hr': return hr(c)
    case 'pm': return pm(c)
    case 'viewer': return viewer(c)
    case 'super_admin': return spaceAdmin(c)
  }
}

/* ---------- Elementi condivisi ---------- */

const ore = (h: number) => `${h} ${h === 1 ? 'ora' : 'ore'}`
const chip = (k: 'todo' | 'pending' | 'approved' | 'rejected' | 'nothing') => <InterventionChip info={{ chip: k, count: 1 }} />

/** Esempi di ore riconosciute calcolati con le regole in vigore. */
function hoursTable(c: GuideCtx) {
  const p = { ...DEFAULT_PARAMS, ...c.p }
  const ex = [25, 60 + p.otToleranceMin, 61 + p.otToleranceMin, 150]
  return <Table head={['Durata dell\'intervento', 'Ore riconosciute']} rows={ex.map((m) => [fmtMinutes(m), <strong key={m} className="text-slate-900">{ore(recognizedHours(m, p))}</strong>])} />
}

function bandsText(c: GuideCtx) {
  return c.exact
    ? `Le ore di notte (dalle ${c.p.otNightStart} alle ${c.p.otNightEnd}), di domenica e nei festivi hanno maggiorazioni più alte.`
    : 'Le ore di notte, di domenica e nei festivi hanno maggiorazioni più alte.'
}

/** Riga della pagina Interventi, riprodotta. */
function ReviewMock({ amounts }: { amounts?: boolean }) {
  const row = 'grid grid-cols-1 gap-1.5 px-3 py-2.5 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_9.5rem] sm:items-center sm:gap-3'
  return (
    <Mock caption={amounts ? 'Le ore per fascia e l\'importo li calcola l\'app; l\'importo lo vede solo chi vede la RAL della persona.' : 'Le ore riconosciute e le ore per fascia le calcola l\'app.'}>
      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-inset ring-slate-200">
        <div className="hidden bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_9.5rem] sm:gap-3"><span>Turno e turnista</span><span>Orario → ore riconosciute</span><span>Azioni</span></div>
        <div className={`${row} border-t border-slate-100`}>
          <span><span className="block font-medium text-slate-900">Gio 26 nov · Notte</span><span className="text-slate-500">Mario Rossi</span></span>
          <span className="text-slate-700">23:50 → 01:05 · 1 h 15' → <strong>2 h</strong><span className="block text-slate-500">notturno feriale</span></span>
          <span className="flex flex-wrap gap-1.5"><UiBtn variant="approve" small>Approva</UiBtn><UiBtn variant="danger" small>Rifiuta</UiBtn></span>
        </div>
        <div className={`${row} border-t border-slate-100`}>
          <span><span className="block font-medium text-slate-900">Sab 21 nov · Diurno</span><span className="text-slate-500">Sara Neri</span></span>
          <span className="text-slate-700">10:00 → 10:40 · 40' → <strong>1 h</strong><span className="block text-slate-500">festivo diurno</span></span>
          <span className="flex flex-col items-start gap-1">{chip('rejected')}<span className="text-[11px] text-slate-500">"Manca il ticket"</span></span>
        </div>
      </div>
    </Mock>
  )
}

/** Legenda di ciò che compare sotto ai turni e ai giorni del calendario. */
function legend(withInterventions = true) {
  const rows: ReactNode[][] = [
    ...(withInterventions ? [
      [chip('todo'), 'Turno finito: il turnista non ha ancora indicato interventi o "Nessun intervento".'],
      [chip('pending'), 'Interventi in attesa di approvazione.'],
      [chip('approved'), 'Interventi approvati: entrano nel consuntivo.'],
      [chip('rejected'), 'Rifiutato: il turnista deve correggerlo e rimandarlo.'],
      [chip('nothing'), 'Nessuna chiamata durante il turno.'],
    ] : []),
    [<DayChip key="e" state="erogato" />, 'Giorno confermato: turni e persone non si cambiano più.'],
    [<DayChip key="c" state="consuntivato" />, 'Giorno chiuso: anche gli interventi sono definitivi.'],
  ]
  return <Table head={['Nel calendario', 'Significa']} rows={rows} />
}

/** Con la vista completa attiva: dove spegnerla (prima di condividere lo schermo). */
const fullNote = (c: GuideCtx) => c.full && <Note>Calcoli e importi sono attivi: li spegni da <Ui>Impostazioni</Ui> nel menu in alto a destra, prima di condividere lo schermo.</Note>

function mineSection(): Sec {
  return {
    key: 'miei', title: 'Se sei anche di turno',
    body: <List items={[
      <>Se il tuo account è collegato a una scheda del piano compare la scheda <Ui>I miei interventi</Ui>.</>,
      <>A fine turno indichi <Ui>Nessun intervento</Ui> oppure <Ui>+ Intervento</Ui> con inizio, fine e una nota.</>,
      'Finché è in approvazione puoi modificarlo o eliminarlo; se viene rifiutato lo correggi e lo rimandi con un commento.',
      'Non puoi approvare i tuoi interventi: li approva qualcun altro tra capo del team, PM e Space admin.',
    ]} />,
  }
}

/* ---------- Turnista ---------- */

function turnista(c: GuideCtx): Sec[] {
  const p = { ...DEFAULT_PARAMS, ...c.p }
  const example = recognizedHours(75, p)
  return [
    {
      key: 'turni', title: 'I tuoi turni',
      body: <>
        <P>Nel <Ui>Calendario turni</Ui> i tuoi turni sono evidenziati in blu e li trovi anche nell'elenco <Ui>I miei turni</Ui>, in cima alla pagina. Il <strong>diurno</strong> (sabati, domeniche e festivi) va dalle 09:00 alle 18:00; la <strong>notte</strong> dalle 18:00 alle 09:00 del giorno dopo.</P>
        <Mock caption="Un tuo turno nel calendario.">
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-40 rounded-lg border border-blue-400 bg-blue-50 p-1.5 ring-1 ring-blue-300">
              <span className="text-sm font-semibold text-slate-800">26</span>
              <div className="mt-1 text-[10px] text-slate-500">Notte 18:00–09:00</div>
              <div className="rounded-md bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white">Sei di turno</div>
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-950 ring-1 ring-blue-200"><span className="font-semibold">gio 26 nov</span> · Notte 18:00–09:00</div>
          </div>
        </Mock>
        <Note>In reperibilità sei a disposizione: lavori solo se ti chiamano. Dopo una chiamata le 11 ore di riposo ripartono dalla fine dell'intervento.</Note>
      </>,
    },
    {
      key: 'compila', title: 'A fine turno, compila',
      body: <>
        <Steps items={[
          [<>Apri <Ui>I miei interventi</Ui></>, 'Il numero arancio sulla scheda dice quanti turni aspettano una tua risposta.'],
          [<>Nella scheda <Ui>Da compilare</Ui> trovi il turno appena finito</>, <>Se non ti hanno chiamato premi <UiBtn small>Nessun intervento</UiBtn>: il turno è a posto. Altrimenti premi <UiBtn variant="primary" small>+ Intervento</UiBtn>.</>],
          ['Scrivi inizio, fine e una nota', <>Per esempio il numero del ticket e cosa è successo, poi <UiBtn variant="primary" small>Segnala intervento</UiBtn>.</>],
        ]} />
        <Mock caption="Le ore riconosciute si aggiornano mentre scrivi gli orari.">
          <div className="rounded-xl border border-orange-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">{chip('todo')}<strong className="text-sm text-slate-900">gio 26 nov · Notte</strong><span className="ml-auto flex gap-2"><UiBtn small>Nessun intervento</UiBtn><UiBtn variant="primary" small>+ Intervento</UiBtn></span></div>
            <div className="mt-3 space-y-2.5 rounded-lg bg-slate-50 p-3">
              <div className="grid max-w-sm grid-cols-2 gap-3"><Field label="Inizio" value="23:50" /><Field label="Fine" value="01:05" /></div>
              <p className="text-xs text-slate-600">gio 26/11 23:50 → ven 27/11 01:05 · 1 h 15' → <strong>{ore(example)} riconosciute</strong></p>
              <Field label="Nota" value="Ticket 4521: server non raggiungibile" />
            </div>
          </div>
        </Mock>
        <List items={[
          'Più chiamate nello stesso turno: un intervento per ognuna (puoi aggiungerne altri anche dalla scheda In approvazione).',
          'Di notte, se passi la mezzanotte, scrivi gli orari come sono (23:50 → 01:05): al giorno giusto ci pensa l\'app.',
          'L\'intervento deve iniziare durante il turno e si segnala quando è finito.',
          '"Nessun intervento" scelto per sbaglio? Premi Annulla nella stessa scheda e il turno torna da compilare.',
        ]} />
      </>,
    },
    {
      key: 'approvazione', title: 'L\'approvazione',
      body: <>
        <P>Ogni intervento lo approva il capo del tuo team oppure un PM. Finché è in approvazione puoi cambiarlo con <Ui>Modifica</Ui> o toglierlo con <Ui>Elimina</Ui>.</P>
        <Flow steps={[
          { top: chip('todo'), label: 'Da compilare', sub: 'turno finito' },
          { top: chip('pending'), label: 'In approvazione', sub: 'puoi ancora modificarlo' },
          { top: chip('approved'), label: 'Approvato', sub: 'definitivo, va in busta paga' },
        ]} />
        <P>Se viene rifiutato:</P>
        <Flow steps={[
          { top: chip('rejected'), label: 'Rifiutato', sub: 'leggi il motivo nella scheda Rifiutati' },
          { label: 'Correggi e rimanda', sub: 'con un commento per chi approva' },
          { top: chip('pending'), label: 'In approvazione', sub: 'di nuovo' },
        ]} />
        <Note>"Nessun intervento" non va approvato. Quando il giorno è <DayChip state="consuntivato" /> non puoi più aggiungere né cambiare interventi: se hai dimenticato qualcosa, avvisa il capo del tuo team.</Note>
      </>,
    },
    {
      key: 'ore', title: 'Le ore riconosciute',
      body: <>
        <P>Ogni intervento vale almeno {ore(p.otMinHours)}; oltre l'ora contano solo i minuti sopra i {p.otToleranceMin}′.</P>
        {hoursTable(c)}
        <P>{bandsText(c)}</P>
      </>,
    },
    {
      key: 'pagato', title: 'Come vieni pagato',
      body: <>
        <Cards items={[
          ['Per ogni turno', 'Indennità di reperibilità del CCNL più un gettone integrativo, anche se non ti chiamano.'],
          ['Per ogni intervento approvato', 'Le ore riconosciute pagate come straordinario, con le maggiorazioni per fascia.'],
        ]} />
        <P>Tutto arriva in busta paga con il cedolino del mese.</P>
      </>,
    },
    {
      key: 'faq', title: 'Domande frequenti',
      body: <Faq items={[
        ['Ho dimenticato di compilare', 'Il turno resta in Da compilare: puoi farlo finché il giorno non è consuntivato.'],
        ['Ho sbagliato un orario', 'Modificalo finché è in approvazione. Se è già approvato, chiedi al capo del tuo team di riportarlo in approvazione.'],
        ['Non vedo i miei turni in blu', 'Il tuo account non è collegato alla tua scheda nel piano: scrivi allo Space admin.'],
        ['Non riesco a segnalare un intervento', 'Controlla che inizi durante il tuo turno e che sia già finito. Se il giorno è consuntivato, avvisa il capo del tuo team.'],
      ]} />,
    },
  ]
}

/* ---------- Director e Governance ---------- */

function planner(c: GuideCtx, gov: boolean): Sec[] {
  return [
    {
      key: 'ruolo', title: 'Il tuo ruolo',
      body: gov ? <>
        <P>Governi il piano di <strong>tutti i team</strong>: calendario, anagrafica e parametri.</P>
        <Cards items={c.full ? [
          ['Cosa vedi', 'Tutte le pagine: Approccio, Parametri, Team, Calendario, Interventi, Riepilogo, Consuntivo e Conto economico.'],
          ['RAL e importi', 'Di tutte le persone di tutti i team.'],
        ] : [
          ['Cosa vedi', 'Tutte le pagine: Approccio, Parametri, Team, Calendario, Interventi e Riepilogo.'],
          ['Cosa fai', 'Modifichi calendario, anagrafica (team delle persone compreso) e parametri; segni gli erogati.'],
        ]} />
        {fullNote(c)}
        <Note>Approvare gli interventi e sbloccare i giorni spetta al capo di ciascun team (e ai PM per gli interventi). Tu controlli che nessuno resti indietro.</Note>
      </> : <>
        <P>Sei il <strong>capo del tuo team</strong> (uno solo per team): costruisci il calendario, confermi i turni svolti e approvi gli interventi delle tue persone.</P>
        <Cards items={c.full ? [
          ['Cosa vedi', 'Tutte le pagine: Approccio, Parametri, Team, Calendario, Interventi, Riepilogo, Consuntivo e Conto economico.'],
          ['RAL e importi', 'Solo delle persone del tuo team. Degli altri team vedi turni e ore, non le cifre.'],
        ] : [
          ['Cosa vedi', 'Tutte le pagine: Approccio, Parametri, Team, Calendario, Interventi e Riepilogo.'],
          ['Cosa fai', 'Calendario e anagrafica; segni gli erogati, approvi gli interventi e sblocchi i giorni del tuo team.'],
        ]} />
        {fullNote(c)}
      </>,
    },
    {
      key: 'team', title: 'Prepara il team',
      body: <>
        <P>Nella pagina <Ui>Team</Ui>, per ogni persona:</P>
        <Table head={['Campo', 'Scelte', 'Effetto']} rows={[
          ['Stato', 'Primario · Riserva · KO', 'Le riserve ricevono un turno solo se nessun primario può coprirlo, nell\'ordine indicato. KO non riceve turni.'],
          ['Disponibilità', 'Volontario · Max 1, 2 o 3 turni/mese · Nessuna preferenza', 'L\'auto-compilazione assegna prima ai volontari, poi a chi ha un limite (mai superato), infine agli altri.'],
          ['Calendario personale', 'Non disponibile (ferie, assenze) · Disponibile', 'I giorni non disponibili non vengono mai assegnati; quelli disponibili hanno la precedenza.'],
        ]} />
        <P>{gov ? `Solo tu e lo Space admin potete spostare una persona in un altro team: cambia chi ne ${c.full ? 'vede la RAL e ne approva gli interventi' : 'approva gli interventi'}.` : 'Per spostare una persona in un altro team serve Governance o lo Space admin.'}</P>
      </>,
    },
    {
      key: 'calendario', title: 'Costruisci il calendario',
      body: <>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-3.5 ring-1 ring-inset ring-slate-200">
            <div className="mb-3 text-sm font-semibold text-slate-900">In automatico</div>
            <Steps items={[
              ['Scegli il periodo', 'Un mese, Tutto oppure Da – A.'],
              ['Fissa con la puntina i turni già decisi'],
              [<UiBtn key="a" variant="primary" small>Auto-compila (mantiene i bloccati)</UiBtn>, 'Riempie gli slot rispettando regole e disponibilità.'],
            ]} />
          </div>
          <div className="rounded-xl bg-white p-3.5 ring-1 ring-inset ring-slate-200">
            <div className="mb-3 text-sm font-semibold text-slate-900">A mano</div>
            <List items={[
              'Scegli la persona dal menu dello slot.',
              <>Con <strong>⛔</strong> non è selezionabile: violerebbe una regola.</>,
              <>Con <strong>⚠</strong> supera il massimo indicato dalla persona: si può, ma l'auto-compilazione non lo fa mai.</>,
              <>Passa sopra uno slot: il riquadro <Ui>Disponibilità slot</Ui> spiega chi è libero e perché gli altri no.</>,
            ]} />
          </div>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"><PinGlyph on /><span><strong className="text-slate-900">Puntina</strong>: blocca un turno assegnato. Non si modifica e l'auto-compilazione lo tiene fisso.</span></div>
          <div className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"><LockGlyph /><span><strong className="text-slate-900">Lucchetto</strong>: giorno non richiesto dal cliente. Esce da rotazione, ricavi ed export.</span></div>
        </div>
        <List items={[
          <><Ui>Svuota periodo</Ui> toglie le assegnazioni del periodo, ma lascia i turni con la puntina e quelli dei giorni erogati.</>,
          <><Ui>Blocca giorni del periodo</Ui> e <Ui>Sblocca giorni del periodo</Ui> applicano il lucchetto a tutto il periodo scelto.</>,
          'Regole sempre rispettate: un solo slot al giorno nel weekend e nei festivi, niente turni in giorni adiacenti, al massimo 2 turni a settimana e 4 al mese, dopo un weekend o festivo niente weekend o festivi la settimana successiva.',
          <>In alto a destra: <Ui>Esporta turni (Excel)</Ui> e <Ui>Esporta turni (PDF)</Ui>.</>,
        ]} />
      </>,
    },
    {
      key: 'erogato', title: 'Erogato e consuntivo',
      body: <>
        <P>Ogni giorno passa per tre stati. I pulsanti compaiono nel calendario, sotto ai turni del giorno.</P>
        <Flow steps={[
          { label: 'Aperto', sub: 'turni modificabili' },
          { top: <DayChip state="erogato" />, label: '✓ Segna erogato', sub: 'dalla fine del turno: 18:00 il diurno, 09:00 del giorno dopo la notte' },
          { top: <DayChip state="consuntivato" />, label: 'Consuntiva', sub: c.full ? 'anche tutto il mese, dalle pagine Riepilogo e Consuntivo' : 'anche tutto il mese, dalla pagina Riepilogo' },
        ]} />
        <List items={[
          <><strong>Erogato</strong>: il turno è stato coperto davvero. Da quel momento turni e persone del giorno non si cambiano più ed entrano nel consuntivo.</>,
          <><strong>Consuntivato</strong>: dopo aver deciso sugli interventi del giorno. Nessuno può più aggiungerne o cambiarli.</>,
          gov
            ? <><Ui>Sblocca</Ui> torna indietro di un passo alla volta: lo fanno il capo del team o lo Space admin, e il motivo resta nella traccia.</>
            : <><Ui>Sblocca</Ui> torna indietro di un passo alla volta: puoi farlo per i giorni con turni del tuo team (o lo Space admin). Il motivo resta nella traccia con nome e ora.</>,
        ]} />
      </>,
    },
    {
      key: 'interventi', title: gov ? 'Controllare gli interventi' : 'Approvare gli interventi',
      body: <>
        <P>Nella pagina <Ui>Interventi</Ui>: il numero giallo sulla scheda dice quanti aspettano. Filtri: In approvazione, Approvati, Rifiutati, Da compilare, Tutti.</P>
        <ReviewMock amounts={c.full} />
        <List items={gov ? [
          c.full ? 'Vedi gli interventi di tutti i team, con ore e importi.' : 'Vedi gli interventi di tutti i team, con le ore per fascia.',
          'Approvano il capo del team della persona, i PM e lo Space admin: tu controlli che nessun intervento resti in attesa.',
          <><Ui>Da compilare</Ui>: turni finiti senza risposta del turnista. Sollecitalo prima che il giorno venga consuntivato.</>,
        ] : [
          <><UiBtn variant="approve" small>Approva</UiBtn> se orari e nota sono in ordine.</>,
          <><UiBtn variant="danger" small>Rifiuta</UiBtn> chiede sempre un motivo: il turnista lo vede, corregge e rimanda.</>,
          <>Approvato per errore? Dal filtro Approvati: <Ui>Riporta in approvazione</Ui>.</>,
          <><Ui>Da compilare</Ui>: turni finiti senza risposta. Sollecita la persona prima di consuntivare.</>,
          'Approvano anche i PM e lo Space admin. I tuoi interventi li approvano un PM o lo Space admin.',
        ]} />
      </>,
    },
    {
      key: 'flusso', title: 'Il mese, dall\'inizio alla fine',
      body: <>
        <Flow steps={[
          { top: gov ? 'Director o Governance' : 'Tu', label: 'Team e calendario' },
          { top: 'Turnista', label: 'Fa il turno' },
          { top: gov ? 'Director o Governance' : 'Tu', label: 'Segna erogato' },
          { top: 'Turnista', label: 'Segnala gli interventi' },
          { top: 'Director o PM', label: 'Approva o rifiuta' },
          { top: 'Director o HR', label: 'Consuntiva il mese' },
          { top: 'HR', label: 'Esporta per le paghe' },
        ]} />
        <P>Per leggere i chip del calendario:</P>
        {legend()}
        {c.exact && <P>Ore riconosciute: minimo {ore(c.p.otMinHours)} per intervento, oltre l'ora contano i minuti sopra i {c.p.otToleranceMin}′; più l'{callFeeText(c.p.callFee)}.</P>}
      </>,
    },
    mineSection(),
  ]
}

/* ---------- HR ---------- */

function hr(c: GuideCtx): Sec[] {
  const money = <span className="text-slate-400">€ ···</span>
  const cols = 'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] items-center gap-3 px-3'
  return [
    {
      key: 'ruolo', title: 'Cosa vedi e cosa fai',
      body: <>
        <Cards cols={3} items={[
          c.full ? ['Vedi', 'Tutte le pagine, con RAL e importi di tutti i team.'] : ['Vedi', 'Tutte le pagine del piano: turni, interventi e il riepilogo per le paghe.'],
          c.full ? ['Fai', 'Consuntivi i giorni e i mesi; esporti per le paghe e per i report.'] : ['Fai', 'Consuntivi i giorni e i mesi; esporti il riepilogo per le paghe.'],
          ['Non fai', 'Non modifichi il calendario e non approvi gli interventi.'],
        ]} />
        {fullNote(c)}
      </>,
    },
    {
      key: 'monitorare', title: 'Monitorare: dove guardare',
      body: <>
        <Table head={['Pagina', 'Cosa controlli']} rows={[
          [<Ui key="c">Calendario</Ui>, 'Lo stato di ogni giorno (erogato, consuntivato) e, sotto ogni turno, lo stato dei suoi interventi.'],
          [<Ui key="i">Interventi</Ui>, `Il numero giallo sulla scheda: interventi da approvare. Il filtro Da compilare: chi non ha ancora risposto. Per ogni intervento: ore per fascia${c.full ? ' e importo' : ''}.`],
          [<Ui key="r">Riepilogo</Ui>, 'Per persona, nel mese o nella settimana: turni per categoria e ore di intervento per fascia. Gli avvisi in alto dicono cosa manca per chiudere il periodo.'],
          ...(c.full ? [
            [<Ui key="k">Consuntivo</Ui>, 'Per persona e mese: lordo erogato (turni erogati sul totale), previsto, netto di riferimento, costo aziendale e straordinario.'],
            [<Ui key="e">Conto economico</Ui>, 'Ricavo stimato, ricavo con copertura dei turni, costo aziendale e margine, per mese o settimana.'],
          ] : []),
        ]} />
        <P>Cosa significano i chip del calendario:</P>
        {legend()}
      </>,
    },
    riepilogoSection(c),
    ...(!c.full ? [] : [{
      key: 'consuntivo', title: 'Leggere il consuntivo',
      body: <>
        <Mock caption="Una scheda per persona. Si liquida solo ciò che è erogato; il resto è in grigio con l'importo previsto.">
          <div className="overflow-hidden rounded-lg bg-white text-xs ring-1 ring-inset ring-slate-200">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-50 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" aria-hidden /><strong className="text-sm text-slate-900">Mario Rossi</strong>
              <span className="text-slate-700">Straordinario <strong>2 h</strong></span>
              <span className="ml-auto text-slate-600">Lordo erogato {money} (2/3 turni) · Previsto · Netto di rif. · Costo aziendale</span>
            </div>
            <div className={`${cols} border-t border-slate-100 py-1.5 text-[11px] font-medium text-slate-500`}><span>Giorno e fascia</span><span>Stato</span><span>Totale lordo</span><span>Interventi</span><span>Straordinario</span></div>
            {([['gio 5 · Notte', 'consuntivato', '1', '2 h'], ['sab 14 · Diurno', 'erogato', '—', '—'], ['mer 25 · Notte', 'open', '—', '—']] as const).map(([d, s, n, h]) => (
              <div key={d} className={`${cols} border-t border-slate-100 py-1.5 ${s === 'open' ? 'text-slate-400' : 'text-slate-700'}`}>
                <span>{d}</span><span><DayChip state={s} /></span><span>{s === 'open' ? 'previsto' : money}</span><span>{n}</span><span>{h}</span>
              </div>
            ))}
          </div>
        </Mock>
        <Cards cols={3} items={[
          ['Indennità CCNL', 'Dovuta per contratto per ogni turno.'],
          ['Gettone integrativo', 'Voce dedicata in busta. Indennità + gettone = totale lordo, pari al netto di riferimento.'],
          ['Straordinario', 'Interventi approvati, in ore riconosciute per fascia con le maggiorazioni CCNL.'],
          ['Eventuale compenso per intervento', `Per ogni intervento approvato; ad oggi impostato in piattaforma a ${fmtEur(c.p.callFee)}.`],
          ['Costo aziendale', 'Lordo più contributi INPS, quota TFR e INAIL. Serve al conto economico, non alla busta.'],
          ['Settimane a cavallo', 'Ogni settimana va nel consuntivo del mese in cui cade il suo ultimo turno.'],
        ]} />
        <Note><strong>RAL Q/: importi stimati</strong> e <strong>RAL da inserire</strong>: indennità e gettone sono stimati e lo straordinario mostra solo le ore. Per l'importo esatto serve la RAL puntuale, che inserisce chi gestisce il Team.</Note>
      </>,
    }]),
    {
      key: 'mese', title: 'Chiudere il mese',
      body: <>
        <Steps items={[
          ['Tutti i giorni con turni sono erogati', 'Nel Riepilogo un avviso conta i turni in giorni non ancora erogati: se ne manca qualcuno avvisa il capo del team.'],
          ['In Interventi non resta nulla in sospeso', 'In approvazione e Da compilare a zero: sollecita chi approva e i turnisti.'],
          [<>Nel Riepilogo{c.full ? ' (o nel Consuntivo)' : ''}, con il mese scelto, premi <UiBtn key="m" small>Consuntiva il mese (18 giorni erogati)</UiBtn></>, 'Gli interventi del mese si chiudono: nessuno può più aggiungerli o cambiarli.'],
          ['Esporta per le paghe', 'Vedi la sezione successiva.'],
        ]} />
        <Note>Per riaprire un giorno serve il capo del team o lo Space admin.</Note>
      </>,
    },
    {
      key: 'esportare', title: 'Esportare',
      body: <>
        <Table head={['File', 'Dove', 'Cosa contiene']} rows={[
          [<UiBtn key="h" variant="primary" small>Esporta per paghe (Excel)</UiBtn>, 'Riepilogo', 'Per l\'ufficio paghe, per mese o settimana, senza importi. Tre fogli: Riepilogo per persona, Turni (con categoria e orari), Interventi (minuti per fascia e ore riconosciute). Solo turni erogati e interventi approvati.'],
          ...(c.full ? [
            [<UiBtn key="p" variant="primary" small>Esporta per paghe (Excel)</UiBtn>, 'Consuntivo', 'Con gli importi, per mese o settimana. Quattro fogli: Reperibilità CCNL, Gettoni integrativi, Straordinario per interventi, Riepilogo paghe (una riga per persona). Solo turni erogati e interventi approvati.'],
            [<UiBtn key="c" small>Esporta report (CSV)</UiBtn>, 'Consuntivo, Conto economico', 'Per analisi e report: consuntivo cedolino per persona e conto economico del periodo scelto.'],
          ] : []),
          [<UiBtn key="t" small>Esporta turni (Excel / PDF)</UiBtn>, 'Calendario', 'Chi è di turno e quando, per il periodo scelto.'],
        ]} />
        <Note warn>{c.full ? 'I file contengono dati personali e quelli con gli importi sono calcolati sulle RAL: salvali solo nelle cartelle HR e non inoltrarli.' : 'I file contengono nomi ed email: salvali solo nelle cartelle HR e non inoltrarli.'}</Note>
      </>,
    },
  ]
}

/** Pagina Riepilogo: turni per categoria e ore di intervento per fascia, senza importi. */
function riepilogoSection(c: GuideCtx): Sec {
  const cell = 'px-2 py-1.5 text-right'
  return {
    key: 'riepilogo', title: 'Leggere il riepilogo',
    body: <>
      <P>Nella pagina <Ui>Riepilogo</Ui> scegli mese o settimana e, se serve, il team. Una riga per persona:</P>
      <Mock caption="Solo turni dei giorni erogati e interventi approvati. Sotto la tabella, il dettaglio di ogni intervento.">
        <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-inset ring-slate-200">
          <table className="w-full min-w-[520px] text-xs">
            <thead><tr className="bg-slate-50 text-[11px] text-slate-500"><th className="px-2 py-1.5 text-left font-medium">Persona</th><th className={`${cell} font-medium`}>Fer. notte</th><th className={`${cell} font-medium`}>Sab. diurno</th><th className={`${cell} font-medium`}>Dom./fest. notte</th><th className={`${cell} font-medium`}>Turni</th><th className={`${cell} font-medium`}>Interventi</th><th className={`${cell} font-medium`}>Ore riconosciute</th></tr></thead>
            <tbody className="text-slate-700">
              <tr className="border-t border-slate-100"><td className="px-2 py-1.5 font-medium text-slate-900">Mario Rossi</td><td className={cell}>2</td><td className={cell}>1</td><td className={cell}>1</td><td className={`${cell} font-semibold text-slate-900`}>4</td><td className={cell}>1</td><td className={`${cell} font-semibold text-slate-900`}>2 h</td></tr>
              <tr className="border-t border-slate-100"><td className="px-2 py-1.5 font-medium text-slate-900">Sara Neri</td><td className={cell}>3</td><td className={cell}>–</td><td className={cell}>–</td><td className={`${cell} font-semibold text-slate-900`}>3</td><td className={cell}>–</td><td className={cell}>–</td></tr>
            </tbody>
          </table>
        </div>
      </Mock>
      <Table head={['Categoria del turno', 'Quando']} rows={SHIFT_CATS.map((k) => [SHIFT_CAT_LABEL[k], SHIFT_CAT_HOURS[k]])} />
      <Note>Il turno conta nel giorno in cui <strong>inizia</strong>: la notte di domenica, dalle 18:00 alle 09:00 di lunedì, è "domenica/festivo notturno". Un sabato festivo conta come festivo.</Note>
      <List items={[
        c.exact
          ? `Le ore di intervento si dividono per fascia secondo il giorno e l'ora di ogni minuto: notte dalle ${c.p.otNightStart} alle ${c.p.otNightEnd}, festivo la domenica e nei festivi. Dopo la mezzanotte di domenica è lunedì: notturno feriale.`
          : 'Le ore di intervento si dividono per fascia secondo il giorno e l\'ora di ogni minuto: dopo la mezzanotte di domenica è lunedì, notturno feriale.',
        'Per ogni intervento contano le ore riconosciute, con minimo e tolleranza:',
      ]} />
      {hoursTable(c)}
      <Note>Il riepilogo e il suo file non contengono importi: l'ufficio paghe li calcola con livello e RAL che già conosce. Le regole di calcolo sono nella pagina <Ui>Approccio</Ui>.</Note>
    </>,
  }
}

/* ---------- PM ---------- */

function pm(c: GuideCtx): Sec[] {
  return [
    {
      key: 'ruolo', title: 'Cosa vedi e cosa fai',
      body: <Cards items={[
        ['Vedi', 'Approccio (con i parametri applicati), Calendario e Interventi con le ore.'],
        ['Non vedi', c.full ? 'RAL, livelli e importi; le pagine Parametri, Team, Consuntivo e Conto economico.' : 'Le pagine Parametri, Team e Riepilogo.'],
        ['Fai', 'Approvi e rifiuti gli interventi di tutti i team.'],
        ['Non fai', 'Non modifichi il calendario né il piano.'],
      ]} />,
    },
    {
      key: 'approvare', title: 'Approvare o rifiutare',
      body: <>
        <Steps items={[
          [<>Apri <Ui>Interventi</Ui></>, 'Il numero giallo sulla scheda dice quanti aspettano: parti dal filtro In approvazione.'],
          ['Controlla la riga', 'Turno, orario, ore riconosciute, ore per fascia e la nota del turnista.'],
          [<>Decidi</>, <><UiBtn variant="approve" small>Approva</UiBtn> se è tutto in ordine, oppure <UiBtn variant="danger" small>Rifiuta</UiBtn> scrivendo il motivo (obbligatorio): il turnista lo legge, corregge e rimanda.</>],
        ]} />
        <ReviewMock />
        <List items={[
          'Cosa guardare: l\'intervento inizia durante il turno e la nota spiega cosa è successo (per esempio il ticket).',
          <>Approvato per errore? Dal filtro Approvati: <Ui>Riporta in approvazione</Ui>.</>,
          'Non decidi sui tuoi interventi: li approvano un altro PM, il capo del tuo team o lo Space admin.',
        ]} />
      </>,
    },
    {
      key: 'compilare', title: 'Chi deve ancora rispondere',
      body: <>
        <P>Il filtro <Ui>Da compilare</Ui> elenca i turni finiti per cui il turnista non ha ancora indicato interventi o "Nessun intervento". Sollecitalo: il giorno va chiuso solo quando tutti hanno risposto.</P>
        <Flow steps={[
          { top: chip('todo'), label: 'Da compilare', sub: 'sollecita il turnista' },
          { top: chip('pending'), label: 'In approvazione', sub: 'tocca a te o al capo del team' },
          { top: chip('approved'), label: 'Approvato', sub: 'entra nel consuntivo' },
        ]} />
      </>,
    },
    { key: 'calendario', title: 'Leggere il calendario', body: <><P>Sotto ogni turno e ogni giorno del <Ui>Calendario</Ui>:</P>{legend()}</> },
    mineSection(),
  ]
}

/* ---------- Viewer ---------- */

function viewer(c: GuideCtx): Sec[] {
  return [
    {
      key: 'vedi', title: 'Cosa vedi',
      body: <P>Il calendario dei turni, con i nomi di chi copre ogni turno. Non vedi {c.full ? 'RAL, importi, ' : ''}anagrafica né interventi, e non modifichi nulla.</P>,
    },
    {
      key: 'leggere', title: 'Leggere il calendario',
      body: <>
        <List items={[
          'In alto scegli il periodo: un mese, Tutto oppure Da – A.',
          'Nei giorni feriali c\'è la Notte (18:00–09:00); il sabato, la domenica e i festivi anche il Diurno (09:00–18:00).',
          <>Il lucchetto <LockGlyph /> indica un giorno senza reperibilità richiesta; "— scoperto —" uno slot ancora da assegnare.</>,
        ]} />
        {legend(false)}
      </>,
    },
    {
      key: 'esportare', title: 'Esportare i turni',
      body: <P>In alto a destra del calendario: <Ui>Esporta turni (Excel)</Ui> o <Ui>Esporta turni (PDF)</Ui>, scegliendo il periodo.</P>,
    },
    mineSection(),
  ]
}

/* ---------- Space admin ---------- */

function spaceAdmin(c: GuideCtx): Sec[] {
  const base = `${location.origin}${location.pathname}`
  return [
    {
      key: 'ruolo', title: 'Il tuo ruolo',
      body: <>
        <P>Sei l'unico Space admin: vedi e modifichi tutto e sei il solo a gestire account, profili e team. Puoi essere a capo di un team: in quel caso ne approvi gli interventi e ne sblocchi i giorni come un Director.</P>
        <List items={[
          'Approvi gli interventi di chiunque, anche quelli dei Director e i tuoi.',
          'Sblocchi qualsiasi giorno erogato o consuntivato.',
          'Il profilo Space admin non si assegna ad altri e non si può cambiare.',
        ]} />
        {fullNote(c)}
      </>,
    },
    {
      key: 'account', title: 'Creare gli account',
      body: <>
        <Steps items={[
          [<>Pagina <Ui>Utenti</Ui>, scheda <Ui>Account</Ui></>, 'Email, nome e cognome, profilo e team; per i Turnisti anche la visibilità (Propri turni o Tutti i turni).'],
          ['Consegna la password provvisoria', 'L\'app la mostra una sola volta: copiala e mandala in modo sicuro. Al primo accesso la persona deve cambiarla.'],
          [<>Per i Turnisti c'è la scheda <Ui>Turnisti</Ui></>, 'Crei gli account in blocco dalle persone del Team ("Seleziona tutti quelli senza account").'],
        ]} />
        <Note>L'account si collega alla scheda del piano tramite l'email: deve essere identica a quella nella pagina Team, altrimenti la persona non vede i suoi turni.</Note>
      </>,
    },
    c.full ? {
      key: 'profili', title: 'Profili e RAL',
      body: <>
        <Table head={['Profilo', 'Pagine', 'RAL e importi', 'Può fare']} rows={[
          ['Space admin', 'Tutte, più Utenti', 'Tutti', 'Tutto: account, profili e team'],
          ['Governance', 'Tutte', 'Tutti', 'Modifica piano, anagrafica (anche il team delle persone) e parametri; segna erogato'],
          ['Director', 'Tutte', 'Solo il suo team', 'Modifica il piano; segna erogato; approva gli interventi e sblocca i giorni del suo team'],
          ['HR', 'Tutte, in lettura', 'Tutti', 'Consuntiva; esporta paghe e report'],
          ['PM', 'Approccio, Calendario, Interventi', 'Nessuno', 'Approva gli interventi di tutti i team'],
          ['Viewer', 'Calendario', 'Nessuno', 'Solo lettura'],
          ['Turnista', 'Calendario turni, I miei interventi', 'Nessuno', 'Segnala i propri interventi'],
        ]} />
        <P>Governance, Director e HR vedono RAL e importi solo se li abiliti nella colonna <Ui>Calcoli e importi</Ui> della pagina Utenti e se li attivano nelle loro Impostazioni.</P>
        <Note warn>Prima di ogni modifica che dà accesso alle RAL l'app mostra un avviso rosso con quello che la persona vedrà: leggilo prima di confermare. Ogni team ha un solo Director.</Note>
      </>,
    } : {
      key: 'profili', title: 'Profili',
      body: <>
        <Table head={['Profilo', 'Pagine', 'Può fare']} rows={[
          ['Space admin', 'Tutte, più Utenti', 'Tutto: account, profili e team'],
          ['Governance', 'Approccio, Parametri, Team, Calendario, Interventi, Riepilogo', 'Modifica piano, anagrafica (anche il team delle persone) e parametri; segna erogato'],
          ['Director', 'Le stesse di Governance', 'Modifica il piano; segna erogato; approva gli interventi e sblocca i giorni del suo team'],
          ['HR', 'Le stesse, in lettura', 'Consuntiva; esporta il riepilogo per le paghe'],
          ['PM', 'Approccio, Calendario, Interventi', 'Approva gli interventi di tutti i team'],
          ['Viewer', 'Calendario', 'Solo lettura'],
          ['Turnista', 'Calendario turni, I miei interventi', 'Segnala i propri interventi'],
        ]} />
        <Note>Ogni team ha un solo Director.</Note>
      </>,
    },
    {
      key: 'team', title: 'Team e capi team',
      body: <List items={[
        <>Pagina <Ui>Utenti</Ui>, scheda <Ui>Team</Ui>: <Ui>Nuovo team</Ui>, <Ui>Rinomina</Ui>, <Ui>Elimina</Ui>. Per ogni team vedi il capo, le risorse e gli account.</>,
        'Il capo di un team è l\'account con profilo Director e quel team (o tu, se sei assegnato a quel team).',
        `Spostare una persona in un altro team cambia chi ne ${c.full ? 'vede la RAL e ne approva gli interventi' : 'approva gli interventi'}: lo possono fare solo lo Space admin e Governance.`,
      ]} />,
    },
    {
      key: 'gestione', title: 'Gestione quotidiana',
      body: <Cards items={[
        ['Reimposta password', 'Nuova password provvisoria, da cambiare al primo accesso.'],
        ['Elimina', 'L\'account non può più accedere; la scheda nel piano resta.'],
        ['Visibilità dei Turnisti', 'Propri turni: degli altri vedono solo "Turno coperto". Tutti i turni: vedono anche i nomi.'],
        ...(c.full ? [['Dati ▾', 'Esporta o importa la configurazione JSON. L\'import sostituisce i dati per tutti; il file contiene anagrafica e RAL: non condividerlo.'] as [string, string]] : []),
      ]} />,
    },
    {
      key: 'guide', title: 'Le guide',
      body: <>
        <P>Ogni profilo ha il pulsante <Ui>Guida</Ui> accanto al nome e vede solo la guida del proprio profilo. Per mandarla a qualcuno usa questo link: si apre la guida del profilo di chi lo apre.</P>
        <code className="block select-all break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 ring-1 ring-inset ring-slate-200">{base}{GUIDE_HASH}</code>
      </>,
    },
  ]
}
