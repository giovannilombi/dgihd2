# Piano reperibilità - ARM

Periodo pianificato: Novembre 2026 – Febbraio 2027 (gennaio e febbraio partono come giorni non richiesti).

Contratto di riferimento: **CCNL Metalmeccanici Industria, codice CNEL C011** (indennità di reperibilità, maggiorazioni dello straordinario e paga oraria seguono questo contratto).

Web app single-page (React + TypeScript + Tailwind) per il piano di reperibilità:

- **Approccio**: presentazione del modello (sintesi sempre visibile; calcolo del gettone integrativo, tutele e riferimenti normativi, valori per RAL in sezioni espandibili), con valori ricalcolati sui parametri correnti.
- **Parametri**: blocco A (ricavi, netto di riferimento per turno, moltiplicatore costo aziendale, coefficienti netto/lordo, indennità CCNL) e blocco B "Straordinari per interventi" (maggiorazioni CCNL per fascia, fascia notturna, minimo e tolleranza, divisore della paga oraria, eventuale compenso per intervento, di default 0 €).
- **Team**: anagrafica (aggiungi, modifica, elimina), team della risorsa, ruolo (primario, riserva ordinata, KO), disponibilità dichiarata (volontario, max 1–3 turni/mese, nessuna preferenza) usata dall'auto-compilazione, import da CSV o da Excel incollato con template scaricabile, anteprima e segnalazione degli errori riga per riga.
- **Calendario**: slot feriali e festivi (festività di Milano incluse), motore vincoli in tempo reale con il motivo di ogni blocco, auto-compilazione, blocco dei giorni non richiesti dal cliente (lucchetto). Dalla fine del turno: **Segna erogato** (giorno definitivo), **Consuntiva** (chiude gli interventi) e **Sblocca** (solo Director del team o space admin, con traccia).
- **Interventi** e **I miei interventi**: il turnista dichiara per ogni turno "Nessun intervento" o gli interventi (inizio, fine, nota), da telefono o desktop; i Director del team, i PM o lo space admin approvano, rifiutano con motivo o riportano in approvazione. Ore per fascia e straordinario CCNL (minimo 1 ora, tolleranza 10', prime 2 ore feriali diurne al 25%, poi 30%, notturno 50%, festivo 55%, notturno festivo 75%, più l'eventuale compenso per intervento, di default 0 €); importi visibili a chi vede la RAL della persona.
- **Riepilogo** (un Director vede solo il proprio team, salvo abilitazione dello Space admin a tutti i team): per mese, settimana o intervallo di date, e per team, una riga per persona con i turni per categoria (feriale notturno, sabato diurno e notturno, domenica/festivo diurno e notturno; il turno conta nel giorno in cui inizia) e gli interventi approvati con le ore riconosciute per fascia CCNL (e la durata effettiva), con il dettaglio dei turni di reperibilità (tipo di gettone) e degli interventi, solo effettuati oppure anche programmati (previsionale: turni del calendario non ancora erogati, interventi solo se effettuati); "Consuntiva il mese" e **Esporta per paghe** senza importi, in Excel (Riepilogo per persona, Turni di reperibilità, Interventi) o in PDF, in un file unico o uno per turnista (archivio ZIP), per l'ufficio paghe che calcola gli importi con livello e RAL seguendo le regole della pagina Approccio.
- **Consuntivo / Conto economico**: per turno indennità CCNL + gettone integrativo = lordo, netto di riferimento, costo aziendale; stato del giorno (da erogare, erogato, consuntivato), lordo erogato e previsto, "Consuntiva il mese", colonne Interventi e Straordinario; **Esporta per paghe (Excel)** per mese o settimana con 4 fogli (Reperibilità CCNL, Gettoni integrativi, Straordinario per interventi, Riepilogo paghe), solo turni erogati e interventi approvati; KPI e grafico di marginalità.
- **Guide**: accanto al nome c'è il pulsante **Guida**, con il colore del profilo e un puntino che pulsa finché non viene aperta; ognuno vede solo la guida del proprio profilo (Space admin, Governance, Director, HR, PM, Viewer, Turnista), indicato chiaramente in alto. Si apre in un pannello a destra (a tutto schermo su telefono), anche dal menu utente o con il link diretto `#/guida`. Il Turnista ha in più, in cima al calendario, l'avviso dei turni da compilare e il riquadro "Come funziona, in 3 passi". Gli esempi usano i valori dei parametri in vigore.

Dal 20/11/2026 la reperibilità si liquida **solo con il gettone integrativo**. La versione con l'alternativa "recupero come straordinario" (ore su un giorno del weekend, cap 8 h, domenica di imputazione) è archiviata con l'etichetta git `archivio-gettone-e-alternativa-straordinario`. Regole, calcoli e riferimenti CCNL del modello sono descritti in [`docs/modello-reperibilita.md`](docs/modello-reperibilita.md).

Salvataggio automatico sul database condiviso, export/import della configurazione JSON (validata, solo per chi vede tutti i team), report CSV, export dei soli turni in Excel formattato o in PDF (senza dati economici).

## Accesso e dati condivisi

I dati (anagrafica, ferie, turni, parametri) stanno in un database **Supabase** (UE, Francoforte) e sono condivisi in tempo reale tra gli utenti. Il sito su GitHub Pages contiene solo il codice. Ogni persona accede con email e password personali; al primo accesso e dopo un reset la password temporanea (formato `animale-animale-NN`) va cambiata, e finché non viene cambiata il database non restituisce alcun dato.

Ogni account ha un **profilo**; il team indica solo l'appartenenza.

| Profilo | Vede | Modifica / approva |
|---|---|---|
| Space admin (uno solo) | tutto | tutto, utenti e team; può essere a capo di un team |
| Governance | il piano di tutti i team | tutto il piano, team delle risorse |
| Director (uno per team) | il piano di tutti i team | il piano; approva gli interventi del proprio team, sblocca i giorni del team |
| HR (anche più di uno) | il piano di tutti i team, in lettura | nulla; consuntiva ed esporta il riepilogo per le paghe |
| PM | Approccio, calendario, interventi (ore) | approva gli interventi di tutti i team |
| Viewer | solo calendario turni | nulla |
| Turnista | calendario e "I miei interventi" | i propri interventi |

RAL e livelli stanno in una tabella separata dall'anagrafica e il database li consegna solo dove le regole di accesso lo consentono; dove compaiono, restano oscurati finché non si reinserisce la propria password.

### Turnista

Il Turnista è pensato per chi è in rotazione: vede solo il calendario, senza regole, vincoli né spiegazioni su come è stato costruito il piano. Lo space admin crea gli account dalla pagina Utenti, scheda **Turnisti** (tutte le persone dell'anagrafica con il loro account, filtro "Senza account", creazione singola o in blocco con le password temporanee mostrate una volta) oppure direttamente dall'anagrafica, cliccando "Nessun account · Crea" sotto il nome. Ogni account Turnista nasce collegato alla scheda della persona; un account esistente si riconosce anche dall'email. Lo space admin sceglie, per tutti i Turnisti, se mostrare **tutti i nomi** oppure **solo i propri turni** (gli altri compaiono come "Turno coperto"). Il Turnista non legge direttamente le tabelle: il calendario arriva dalla funzione del database `turnista_calendar()`, che nella modalità "solo i propri turni" non include i nomi degli altri, quindi non raggiungono mai il browser.

### Email delle risorse

Ogni risorsa ha un'**email aziendale obbligatoria** (sotto il nome nella pagina Team, nel modulo "Aggiungi risorsa" e nella colonna Email dell'import CSV): deve essere valida e diversa per ogni persona. Serve a riconoscere l'account della persona e a creare quello da Turnista. È visibile a chi vede l'anagrafica completa; il tipo di account lo vede solo lo space admin.

### Team e visibilità di RAL e livello

Ogni risorsa e ogni utente appartengono a un team (Utenti → Team: crea, rinomina, elimina se non usati). Ogni team ha **un solo capo**: il suo **Director** (ne approva gli interventi), oppure lo Space admin se assegnato a quel team (vincolo nel database). Prima di ogni modifica che può dare accesso alle RAL l'app mostra quante e quali RAL la persona vedrà e chiede conferma; la pagina Utenti ha in alto la guida "Come funzionano profili e accessi". Senza RAL l'app non calcola importi: turni e ore restano nel Riepilogo.

Nessun vincolo di rotazione dipende dalla RAL. L'auto-compilazione gira sulla funzione server `supabase/functions/planner` quando ci sono persone di cui il browser non conosce la RAL; restituisce solo le assegnazioni, mai importi o RAL, e usa il costo solo dove le regole di accesso consentono di usare la RAL. Il team di una risorsa può essere cambiato solo da Governance e Space admin (controllo nel database).

Per le risorse con RAL **Q/** i calcoli usano una RAL media di riferimento che sta solo sul server (tabella `server_params`, non leggibile dagli utenti): gli importi di queste persone li calcola la funzione `planner` e il browser riceve solo i risultati.

I permessi sono applicati dal database (Row Level Security, `supabase/migrations`); la gestione account passa dalla funzione server `supabase/functions/admin-users`, che usa la chiave di servizio senza esporla al browser. Gli account li crea solo lo space admin: il database rifiuta ogni iscrizione libera (anche via link magico). Al cambio password vengono rifiutate le password presenti in elenchi di password rubate (servizio Pwned Passwords, inviando solo i primi 5 caratteri dell'impronta SHA-1).

### Accesso (versione precedente)

Le password condivise lato browser delle prime versioni sono state sostituite dal login personale su Supabase.

## Dati personali

Il sito pubblicato e il repository contengono **solo il codice**. L'anagrafica reale (nomi, RAL, livelli, ferie, disponibilità) sta esclusivamente nel database Supabase, protetta dalle regole di accesso: non è mai salvata nel repository né nel sito.

Il `.gitignore` esclude CSV, Excel, PDF ed export JSON: **non committare mai file con dati reali**.

## Sviluppo

```bash
npm install
npm run dev      # sviluppo
npm test         # test del motore di calcolo e dei vincoli
npm run build    # genera dist/index.html
npm run build:planner  # rigenera supabase/functions/planner/index.js (motore regole per la funzione server)
```

Logica di dominio in `src/lib/`: `economics.ts` (calcoli), `rules.ts` (vincoli, compensazione settimanale, auto-compilazione), `reports.ts` (consuntivo, P&L, CSV), `salaryChecks.ts` (vincoli calcolati dal server per le risorse di altri team). La funzione `planner` riusa gli stessi file, quindi app e server applicano le stesse regole.
