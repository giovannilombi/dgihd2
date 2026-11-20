# Piano reperibilità - ARM

Periodo pianificato: Novembre 2026 – Febbraio 2027 (gennaio e febbraio partono come giorni non richiesti).

Web app single-page (React + TypeScript + Tailwind) per il piano di reperibilità:

- **Approccio**: presentazione del modello (sintesi sempre visibile; calcolo del gettone integrativo, tutele e riferimenti normativi, valori per RAL in sezioni espandibili), con valori ricalcolati sui parametri correnti.
- **A · Parametri**: blocco A (ricavi, netto di riferimento per turno, moltiplicatore costo aziendale, coefficienti netto/lordo, indennità CCNL) e blocco B "Straordinari per interventi" (maggiorazioni CCNL per fascia, fascia notturna, minimo e tolleranza, divisore della paga oraria, compenso per chiamata).
- **B · Team**: anagrafica (aggiungi, modifica, elimina), team della risorsa, ruolo (primario, riserva ordinata, KO), disponibilità dichiarata (volontario, max 1–3 turni/mese, nessuna preferenza) usata dall'auto-compilazione, import da CSV o da Excel incollato con template scaricabile, anteprima e segnalazione degli errori riga per riga.
- **C · Calendario**: slot feriali e festivi (festività di Milano incluse), motore vincoli in tempo reale con il motivo di ogni blocco, auto-compilazione, blocco dei giorni non richiesti dal cliente (lucchetto). Dal giorno dopo: **Segna erogato** (giorno definitivo), **Consuntiva** (chiude gli interventi) e **Sblocca** (solo director del team o super admin, con traccia).
- **D · Consuntivo / E · Conto economico**: per turno indennità CCNL + gettone integrativo = lordo, netto di riferimento, costo aziendale; stato del giorno (da erogare, erogato, consuntivato), lordo erogato e previsto, "Consuntiva il mese"; KPI e grafico di marginalità.

Dal 20/11/2026 la reperibilità si liquida **solo con il gettone integrativo**. La versione con l'alternativa "recupero come straordinario" (ore su un giorno del weekend, cap 8 h, domenica di imputazione) è archiviata con l'etichetta git `archivio-gettone-e-alternativa-straordinario`. Regole, calcoli e riferimenti CCNL del modello sono descritti in [`docs/modello-reperibilita.md`](docs/modello-reperibilita.md).

Salvataggio automatico sul database condiviso, export/import della configurazione JSON (validata, solo per chi vede tutti i team), report CSV, export dei soli turni in Excel formattato o in PDF (senza dati economici).

## Accesso e dati condivisi

I dati (anagrafica, ferie, turni, parametri) stanno in un database **Supabase** (UE, Francoforte) e sono condivisi in tempo reale tra gli utenti. Il sito su GitHub Pages contiene solo il codice. Ogni persona accede con email e password personali; al primo accesso e dopo un reset la password temporanea (formato `animale-animale-NN`) va cambiata, e finché non viene cambiata il database non restituisce alcun dato.

| Livello | Vede | Modifica |
|---|---|---|
| Super admin | tutto | tutto + utenti e livelli (pagina Utenti) |
| Full edit | tutto | tutto, senza gestione utenti |
| Viewer esteso | tutto (RAL e livello reinserendo la propria password) | nulla |
| Viewer | solo calendario turni | nulla |
| Turnista | solo calendario turni, con i propri evidenziati e l'elenco "I miei turni" | nulla |

### Turnista

Il Turnista è pensato per chi è in rotazione: vede solo il calendario, senza regole, vincoli né spiegazioni su come è stato costruito il piano. Il super admin crea gli account dalla pagina Utenti, scheda **Turnisti** (tutte le persone dell'anagrafica con il loro account, filtro "Senza account", creazione singola o in blocco con le password temporanee mostrate una volta) oppure direttamente dall'anagrafica, cliccando "Nessun account · Crea" sotto il nome. Ogni account Turnista nasce collegato alla scheda della persona; un account esistente si riconosce anche dall'email. Il super admin sceglie, per tutti i Turnisti, se mostrare **tutti i nomi** oppure **solo i propri turni** (gli altri compaiono come "Turno coperto"). Il Turnista non legge direttamente le tabelle: il calendario arriva dalla funzione del database `turnista_calendar()`, che nella modalità "solo i propri turni" non include i nomi degli altri, quindi non raggiungono mai il browser.

### Email delle risorse

Ogni risorsa ha un'**email aziendale obbligatoria** (sotto il nome in B · Team, nel modulo "Aggiungi risorsa" e nella colonna Email dell'import CSV): deve essere valida e diversa per ogni persona. Serve a riconoscere l'account della persona e a creare quello da Turnista. È visibile a chi vede l'anagrafica completa; il tipo di account lo vede solo il super admin.

### Team e visibilità di RAL e livello

Ogni risorsa e ogni utente appartengono a un team. I team li gestisce il super admin (Utenti → Team): crea, rinomina, elimina se non usati, sceglie il **director** (un account del team con accesso completo in lettura) e indica quali team **vedono tutto** (oggi HR e Governance). RAL e livello sono visibili **solo per le risorse del proprio team**; i team che vedono tutto li vedono per tutti. Per le risorse degli altri team l'app mostra "Riservata" e non calcola costi né ore: consuntivo e conto economico riportano solo il proprio team.

Nessun vincolo di rotazione dipende dalla RAL. L'auto-compilazione, che a parità di condizioni preferisce il costo minore, gira sulla funzione server `supabase/functions/planner` quando ci sono persone di cui il browser non conosce la RAL; restituisce solo le assegnazioni, mai importi o RAL. Il team di una risorsa può essere cambiato solo da chi appartiene a un team che vede tutto (controllo nel database).

Per le risorse con RAL **Q/** i calcoli usano una RAL media di riferimento che sta solo sul server (tabella `server_params`, non leggibile dagli utenti): gli importi di queste persone li calcola la funzione `planner` e il browser riceve solo i risultati.

I permessi sono applicati dal database (Row Level Security, `supabase/migrations`); la gestione account passa dalla funzione server `supabase/functions/admin-users`, che usa la chiave di servizio senza esporla al browser. Gli account li crea solo il super admin: il database rifiuta ogni iscrizione libera (anche via link magico). Al cambio password vengono rifiutate le password presenti in elenchi di password rubate (servizio Pwned Passwords, inviando solo i primi 5 caratteri dell'impronta SHA-1).

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
