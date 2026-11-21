# Modello di reperibilità: regole, calcoli e decisioni

Documento di riferimento per riusare il modello in altri applicativi. Raccoglie le regole usate nel
Piano reperibilità, i calcoli economici, le scelte fatte e i riferimenti al CCNL. Non contiene dati
personali né valori riservati.

Stato al 20/11/2026. Decisioni confermate con HR; gli importi degli interventi restano stime finché la
retribuzione oraria esatta (art. 3 CCNL) non viene fornita dall'ufficio paghe.

---

## 1. Principi

- Chi dà la propria disponibilità deve sapere in anticipo quanto riceve, avere i riposi garantiti e
  partecipare a una rotazione equa.
- La reperibilità "passiva" (attesa della chiamata) non è orario di lavoro; lo sono gli interventi effettivi.
- Il trattamento economico **si aggiunge** a quanto previsto dal CCNL, non lo sostituisce.
- Gli importi si liquidano **a consuntivo**: solo per i turni effettivamente svolti (erogati) e per gli
  interventi approvati.

## 2. Turni e giornate

| Turno | Orario | Quando |
|---|---|---|
| Notte feriale | 18:00 – 09:00 del giorno dopo | lunedì–venerdì non festivi |
| Diurno weekend/festivo | 09:00 – 18:00 | sabato, domenica, festivi |
| Notte weekend/festivo | 18:00 – 09:00 del giorno dopo | sabato, domenica, festivi |

- Si coprono solo le giornate **richieste dal cliente**; le altre sono "non richieste" e restano fuori da
  rotazione, consuntivo e ricavi.
- Festività considerate: nazionali più il patrono locale (es. Sant'Ambrogio a Milano).

## 3. Regole di rotazione (vincoli)

1. Adesione volontaria: volontario / massimo 1, 2 o 3 turni al mese / nessuna preferenza. Prima i
   volontari; i massimi dichiarati non si superano. Chi non aderisce (KO) è fuori rotazione.
2. Al massimo un turno al giorno per persona (riposo 11 ore).
3. Nessun turno in giorni adiacenti (venerdì notte + sabato, sabato + domenica, domenica + lunedì).
4. Al massimo 2 turni a settimana e 4 al mese per persona.
5. Chi copre un sabato, una domenica o un festivo nella settimana W non copre weekend/festivi in W+1.
6. Ferie e assenze: nessun turno nei giorni di assenza né la notte che precede il primo giorno di assenza.
7. Distribuzione equa: a parità di condizioni chi ha meno turni nel mese/periodo; riserve solo se nessun
   primario è disponibile, nell'ordine indicato.
8. Dopo un intervento notturno le 11 ore di riposo ripartono dal termine dell'intervento.

Regole che esistevano **solo** per l'alternativa "recupero come straordinario" (vedi § 5.2) e che con il
solo gettone non servono più: cap di 8 ore di compensazione su un giorno del weekend; obbligo di una
domenica libera per imputare le ore.

## 4. Modello economico del gettone integrativo (scelta adottata)

Per ogni turno svolto è definito un **netto di riferimento**, uguale per tutti:

| Turno | Netto di riferimento |
|---|---|
| Notte feriale | 50 € |
| Diurno weekend/festivo | 60 € |
| Notte weekend/festivo | 70 € |

Calcolo per persona e per turno:

1. **Lordo complessivo del turno** = netto di riferimento ÷ coefficiente netto/lordo della fascia di RAL
   (fasce allineate agli scaglioni IRPEF):

   | RAL | Coefficiente |
   |---|---|
   | fino a 28.000 € | 0,62 |
   | oltre 28.000 € e fino a 50.000 € | 0,54 |
   | oltre 50.000 € | 0,50 |

2. **Indennità di reperibilità CCNL** (già dovuta per contratto, vedi § 6.2) del livello e del tipo di giornata.
3. **Gettone integrativo** = lordo complessivo − indennità CCNL (mai negativo).
4. **Costo aziendale** = lordo complessivo × 1,35 (contributi a carico azienda; parametro).

Esempio: notte feriale, RAL fino a 28.000 € → 50 ÷ 0,62 = 80,65 € lordi.

Note importanti:
- Il netto è un **riferimento per il calcolo**, non un netto garantito in busta: al dipendente si comunica
  il lordo; il netto effettivo dipende dalla sua situazione fiscale (detrazioni, addizionali).
- Il gettone è una voce dedicata in busta paga, liquidata a fine mese per i soli turni erogati.
- Persone con RAL non comunicata ("Q/"): per gettone e costi si usa una RAL media di riferimento **solo nei
  calcoli lato server**; il valore non va mai mostrato né salvato nel browser o nel codice. Per gli
  interventi non si stimano importi: si mostrano solo le ore, finché non viene inserita la RAL puntuale.
- Sostenibilità: ricavo per notte feriale e per giornata weekend/festivo coperta h24 (parametri); il conto
  economico confronta ricavo e costo aziendale.

## 5. Gettone integrativo vs recupero come straordinario

### 5.1 Gettone integrativo (adottato dal 20/11/2026)

- Voce retributiva dedicata, pari all'integrazione lorda calcolata sopra.
- Remunera la sola disponibilità passiva; tracciabile turno per turno.
- Non richiede di registrare in presenze ore non lavorate.

### 5.2 Recupero come straordinario fittizio (alternativa scartata, archiviata)

- Stesso lordo, liquidato come ore di straordinario su un giorno del weekend.
- Ore = gettone lordo ÷ (paga oraria × (1 + maggiorazione)), con paga oraria = RAL ÷ 2.249.
  Domenica +55%; sabato a scaglioni (+25% le prime 2 ore, +30% le successive).
- Ore imputate alla domenica della settimana (al sabato se c'è un turno di domenica o il lunedì dopo);
  se sabato e domenica sono entrambi a contatto con turni, domenica successiva o precedente dello stesso
  mese. Cap di 8 ore per giorno → vincoli aggiuntivi sulla rotazione.
- Scartata perché registra ore non effettivamente lavorate (da validare col consulente) e complica la
  rotazione. Netto e costo restano identici al gettone.
- Il codice di questa versione è archiviato nel repository con l'etichetta git
  `archivio-gettone-e-alternativa-straordinario`.

## 6. Riferimenti CCNL Metalmeccanici Industria (codice CNEL C011)

Fonte principale: Testo Unico CCNL Metalmeccanica Industria (aggiornato all'11/06/2024), Sezione quarta,
Titolo III; rinnovo firmato il 22/11/2025 (vigenza fino al 30/06/2028).

### 6.1 Reperibilità (art. 6, Sezione quarta, Titolo III – sintesi)

- Articolazioni: oraria, giornaliera, settimanale; la settimanale non oltre 2 settimane continuative su 4
  e non più di 6 giorni continuativi.
- In caso di chiamata raggiungere il luogo di norma entro 30 minuti (salvo diversa pattuizione aziendale).
- Tempo di viaggio (dalla chiamata al raggiungimento e al rientro): 85% della retribuzione oraria, senza
  maggiorazioni. **Non implementato**: gli interventi sono tutti da remoto.
- Ore di intervento, anche da remoto: orario di lavoro, compensate con le maggiorazioni per straordinario,
  notturno e festivo; retribuite come straordinario se aggiuntive al normale orario.
- **Compenso per chiamata** seguita da intervento effettivo: **5,00 €** fissi per chiamata, anche da remoto;
  confermato per il 2026 (non soggetto a rivalutazione IPCA). **Escluso dalla base di calcolo del TFR.**
- Indennità di reperibilità: si riconosce sempre intera; lo straordinario degli interventi è sempre **in
  aggiunta** (nessuno storno della quota oraria durante l'intervento).
- Deroga al riposo di 11 ore ammessa in reperibilità, garantendo comunque almeno 8 ore consecutive.

### 6.2 Indennità di reperibilità (lorde)

| Livello | 16 ore (giorno lavorato) | 24 ore (giorno libero) | 24 ore festive |
|---|---|---|---|
| D1-D2-C1 | 5,87 | 8,83 | 9,55 |
| C2-C3 | 7,00 | 10,98 | 11,78 |
| B1 e superiori | 8,03 | 13,23 | 13,92 |

Tabella ufficiale dal 1/6/2026 (adeguamento del rinnovo 22/11/2025, accordo Federmeccanica-Assistal del
16/6/2026), confermata.
Mappatura usata: notte feriale → "16 ore"; sabato → "24 ore giorno libero"; domenica e festivi →
"24 ore festive". Con l'opzione "intera" l'indennità giornaliera vale per ciascuno dei due turni del
weekend; con "pro quota" si ripartisce 9/24 (diurno) e 15/24 (notte).

### 6.3 Maggiorazioni per lavoro straordinario, notturno, festivo (art. 7)

Percentuali da aggiungere alla normale retribuzione oraria (per **lavoro non a turni**, caso dei reperibili):

| Voce | Non a turni | A turni |
|---|---|---|
| Straordinario: prime 2 ore | 25% | 25% |
| Straordinario: ore successive | 30% | 30% |
| Notturno fino alle 22 | 20% | 15% |
| Notturno oltre le 22 | 30% | 15% |
| Festivo | 50% | 50% |
| Straordinario festivo | 55% | 55% |
| Straordinario notturno (prime 2 ore) | 50% | 40% |
| Straordinario notturno (ore successive) | 50% | 45% |
| Notturno festivo | 60% | 55% |
| Straordinario notturno festivo | 75% | 65% |

**Regole applicate agli interventi in reperibilità (decise il 20/11/2026):**

| Fascia | Maggiorazione applicata |
|---|---|
| Feriale diurno, lunedì–venerdì (06–22) | 25% prime 2 ore del giorno, 30% successive |
| Sabato diurno | 25% prime 2 ore, 30% successive (attività di manutenzione/riparazione) |
| Feriale notturno (22–06) | 50% tutte le ore |
| Festivo diurno (domeniche e festività) | 55% dalla prima ora (straordinario festivo) |
| Festivo notturno | 75% dalla prima ora (straordinario notturno festivo) |

Motivazione: per l'art. 6 gli interventi in reperibilità si pagano come straordinario quando sono aggiuntivi
al normale orario; di domenica o in un festivo non lavorato le ore sono aggiuntive, quindi si applicano le
voci di straordinario festivo (55%) e straordinario notturno festivo (75%), non quelle di lavoro festivo in
orario (50% / 60%). Tutte le percentuali restano parametri modificabili (Parametri → blocco B "Straordinari per
interventi": maggiorazioni, fascia notturna, minimo, tolleranza, divisore della paga oraria, compenso per chiamata).

Conteggio delle soglie: le "prime 2 ore" del feriale diurno si contano per giornata (data di calendario del
minuto lavorato), sommando in ordine di orario le ore diurne feriali di tutti gli interventi del giorno.
Esempio: sabato notte dopo mezzanotte è già domenica, quindi festivo notturno. Nota sul sabato: fuori da manutenzione/riparazione, oltre le 2 ore il CCNL
prevede il 50% (prolungamento concordato con la RSU): riportato come nota, non come regola attiva.
La maggiorazione aggiuntiva dell'8% del rinnovo 2025 **non si applica** (riguarda le ore oltre soglia di
orario plurisettimanale / quote esenti, non lo straordinario di reperibilità).

Altre regole dell'art. 7 rilevanti:
- Lavoro festivo: nei giorni dell'art. 9 (domeniche e festività). Il sabato, con orario su 5 giorni, è
  giorno libero non festivo: straordinario ordinario (25% / 30%).
- Notturno ai fini retributivi: dalle 12 ore successive all'inizio del turno del mattino; non è notturno il
  lavoro dalle 6 (entro un'ora) per la predisposizione impianti. Per i reperibili non turnisti si usa la
  fascia 22:00–06:00 come convenzione nei Parametri (da validare con l'ufficio paghe).
- Banca ore: il lavoratore può chiedere riposo compensativo invece del pagamento (maggiorazione al 50%).
- Base di calcolo: retribuzione oraria come definita dal CCNL (art. 3 "Mensilizzazione", Sezione quarta,
  Titolo IV) = (minimi tabellari + aumenti periodici di anzianità + aumenti di merito/superminimi + altri
  compensi fissati a mese) ÷ 173, più eventuali elementi orari (incentivi, indennità varie). Nel modello si
  approssima con RAL ÷ 2.249 (173 ore × 13 mensilità): coincide se la RAL è esattamente 13 volte la
  retribuzione mensile fissa; gli importi degli interventi sono quindi stime, il valore esatto lo calcola
  l'ufficio paghe.

## 7. Interventi in reperibilità (regole aziendali)

- Il Turnista dichiara per ogni turno svolto: **"Nessun intervento"** oppure uno o più interventi con
  ora di inizio e fine (anche dopo mezzanotte), più una nota facoltativa. Stati del turno: da compilare,
  nessun intervento, interventi in approvazione, approvati; per l'intervento: in approvazione, approvato,
  rifiutato (con motivo; il Turnista corregge e rimanda con un commento).
- Modificabili o eliminabili dal Turnista finché non sono approvati.
- Approvano il **director del team** della persona o il super admin; si può de-approvare (torna in
  approvazione).
- Durata riconosciuta (regola aziendale, più favorevole del CCNL): **minimo 1 ora** per intervento; oltre
  10 minuti dopo l'ora intera si passa all'ora successiva (1 h 10' → 1 h; 1 h 11' → 2 h).
- Ripartizione per fasce: i minuti effettivi si attribuiscono alla fascia in cui sono prestati (prima/dopo
  le 22, giorno feriale/festivo, cambio di data a mezzanotte) e ogni parte si paga con la propria
  maggiorazione, esposta separatamente; i minuti aggiunti dall'arrotondamento vanno **sempre alla fascia in
  cui l'intervento termina**.
- Ogni intervento dà diritto anche al compenso per chiamata di 5,00 € (§ 6.1).
- "Prime 2 ore / successive" dello straordinario diurno si contano per giornata.
- Calcolo: `P_base = RAL ÷ divisore` (2.249 = 173 × 13), `S = Σ h_fascia × P_base × (1 + m_fascia) + n_chiamate × 5 €`.
  Si liquidano solo gli interventi **approvati**. Per le persone con RAL Q/ (o RAL non inserita) si mostrano
  solo le ore, con l'indicazione di inserire la RAL puntuale.
- Esempi (RAL di esempio 30.000 €, paga oraria ≈ 13,34 €):
  - giovedì 22:40 → venerdì 00:15 (95' → 2 h): 2 h notturno feriale al 50% → 40,02 € + 5 €;
  - sabato 23:30 → domenica 00:40 (70' → 1 h): 30' notturno feriale al 50% + 30' notturno festivo al 75%
    → 21,68 € + 5 €;
  - lunedì 18:30 → 20:00 (90' → 2 h) e 20:30 → 21:15 (45' → 1 h): 2 h al 25% + 1 h al 30% → 50,69 € + 10 €.
- Regole applicate dal database (funzioni `add_intervention`, `update_intervention`, `delete_intervention`,
  `declare_no_intervention`, `decide_intervention`, `my_shifts`):
  - si dichiara solo sui propri turni (account collegato alla scheda o con la stessa email), con inizio
    durante il turno, mai per interventi non ancora conclusi, senza sovrapposizioni, al massimo 16 ore;
  - "Nessun intervento" solo a turno finito e se non ci sono interventi;
  - dopo il **consuntivato** il turnista non aggiunge, modifica o elimina più; si può ancora approvare o
    rifiutare;
  - il director non decide sui propri interventi (lo fa il super admin); il rifiuto richiede un motivo.
- Visibilità: interventi, ore e fasce a chi legge l'anagrafica completa e a ciascuno per i propri; importi
  solo ai team che vedono tutto (HR, Governance) e al director del team della persona.
- Dove: "I miei interventi" (turnisti e chiunque sia collegato a una scheda, da telefono e desktop),
  "Interventi" (approvazione, filtri per team, ordinamento per data, turnista, team), chip nel calendario,
  colonne Interventi e Straordinario nel Consuntivo, sezione 4 dell'Approccio con formula ed esempi.

## 8. Erogato, consuntivato, sblocco

- **Segna erogato** (director di un team con un turno quel giorno, Full edit, super admin), **dalla fine
  del turno** (ultimo turno assegnato del giorno, ora italiana: diurno 18:00, notte 09:00 del giorno dopo): il giorno diventa definitivo; turni e persone non si cambiano più (controllo nel database:
  turni, puntine e "giorno non richiesto" rifiutati); entra nel consuntivo come erogato. Auto-compilazione e
  "Svuota" lo trattano come bloccato.
- **Consuntiva** (per giorno dal calendario, o per mese dal Consuntivo): chiude l'inserimento di nuovi
  interventi; restano quelli già segnalati, che si possono ancora approvare o rifiutare. Oltre a chi segna
  l'erogato, può consuntivare chi legge tutto in un team che "vede tutto" (es. HR).
- **Sblocca**: solo il director del team o il super admin, un passo indietro alla volta (consuntivato →
  erogato → aperto), con motivo facoltativo. Ogni azione resta nella traccia (chi, quando, motivo).
- Consuntivo: si liquidano solo i turni dei giorni erogati; gli altri restano indicati con l'importo previsto.
- Implementazione: tabelle `day_status` e `day_status_log`, scritte solo dalle funzioni del database
  `mark_day_erogato`, `consuntiva_day`, `consuntiva_month`, `unlock_day`, che verificano i permessi.

## 9. Visibilità dei dati (privacy)

- RAL e livello: solo per le risorse del proprio team; HR e Governance (team che "vedono tutto") per tutti.
- Team gestiti dal super admin (tabella dei team): nome, "vede tutto" e director. Il director deve essere un
  account dello stesso team con accesso completo in lettura, quindi vede già le RAL del team: gli importi
  degli interventi non gli rivelano nulla di nuovo. Se cambia team o livello, il team resta senza director.
- Importi degli interventi: solo HR, Governance e director del team della persona (dagli importi si
  ricaverebbe la paga oraria, quindi la RAL). Ore e fasce visibili a chi legge il consuntivo.
- Persone con RAL "Q/": gli importi derivano da un valore medio riservato; non mostrare dati da cui
  ricavarlo. Per gli interventi si mostrano solo ore e fasce, con l'indicazione di inserire la RAL puntuale
  per calcolare gli importi.
- Turnista: vede solo il calendario; nomi degli altri secondo l'impostazione (tutti / solo i propri / per
  persona). I dati filtrati arrivano dal server, mai nascosti solo a schermo.
- Tutti i permessi sono applicati nel database (Row Level Security), non solo nell'interfaccia.

## 10. Export per l'ufficio paghe

Periodo selezionabile: **mese** o **settimana**. File Excel con 4 fogli:
1. Reperibilità CCNL – indennità per turno erogato;
2. Gettoni integrativi – gettone lordo per turno erogato;
3. Straordinario per interventi – interventi approvati: orari, durata, ore per fascia, maggiorazione, importo;
4. Riepilogo paghe – una riga per persona (e per settimana se scelta) con i tre importi e il totale.

Solo turni erogati e interventi approvati.

## 11. Quadro normativo (sintesi)

- D.Lgs. 66/2003: riposo giornaliero 11 ore (art. 7), riposo settimanale 24 ore + 11 (art. 9), durata
  massima media 48 ore settimanali (art. 4), definizione di lavoratore notturno (art. 1).
- Reperibilità passiva non è orario di lavoro se i vincoli non limitano in modo significativo il tempo
  libero (Corte di Giustizia UE, 9/3/2021, C-344/19 e C-580/19); gli interventi sono orario di lavoro.
- Liquidazione a consuntivo, dopo verifica dell'effettivo svolgimento (coerenza con la copertura INAIL).
