# Piano reperibilità - ARM

Periodo pianificato: Novembre 2026 – Febbraio 2027 (gennaio e febbraio partono come giorni non richiesti).

Web app single-page (React + TypeScript + Tailwind) per il piano di reperibilità:

- **Approccio**: presentazione del modello (sintesi sempre visibile; calcolo del gettone, tutele e riferimenti normativi, valori per RAL in sezioni espandibili), con valori ricalcolati sui parametri correnti.
- **A · Parametri**: ricavi, gettoni netti target, cap ore di compensazione, moltiplicatore costo aziendale, coefficienti netto/lordo, maggiorazioni e indennità CCNL.
- **B · Team**: anagrafica (aggiungi, modifica, elimina), team della risorsa, ruolo (primario, riserva ordinata, KO), disponibilità dichiarata (volontario, max 1–3 turni/mese, nessuna preferenza) usata dall'auto-compilazione, import da CSV o da Excel incollato con template scaricabile, anteprima e segnalazione degli errori riga per riga.
- **C · Calendario**: slot feriali e festivi (festività di Milano incluse), motore vincoli in tempo reale con il motivo di ogni blocco, auto-compilazione, blocco dei giorni non richiesti dal cliente (lucchetto).
- **D · Consuntivo / E · Conto economico**: gettone di disponibilità lordo per settimana (modalità preferibile) e, in alternativa, ore di straordinario su Domenica o Sabato (cap 8h); netto, costo aziendale, KPI e grafico di marginalità.

Salvataggio automatico sul database condiviso, export/import della configurazione JSON (validata, solo per chi vede tutti i team), report CSV, export dei soli turni in Excel formattato o in PDF (senza dati economici).

## Accesso e dati condivisi

I dati (anagrafica, ferie, turni, parametri) stanno in un database **Supabase** (UE, Francoforte) e sono condivisi in tempo reale tra gli utenti. Il sito su GitHub Pages contiene solo il codice. Ogni persona accede con email e password personali; al primo accesso e dopo un reset la password temporanea (formato `animale-animale-NN`) va cambiata, e finché non viene cambiata il database non restituisce alcun dato.

| Livello | Vede | Modifica |
|---|---|---|
| Super admin | tutto | tutto + utenti e livelli (pagina Utenti) |
| Full edit | tutto | tutto, senza gestione utenti |
| Viewer esteso | tutto (RAL e livello reinserendo la propria password) | nulla |
| Viewer | solo calendario turni | nulla |

### Team e visibilità di RAL e livello

Ogni risorsa appartiene a un team (Tech, Design, PM, Director, Governance) e ogni utente ha un team (gli stessi, più HR). RAL e livello sono visibili **solo per le risorse del proprio team**; HR e Governance li vedono per tutti. Per le risorse degli altri team l'app mostra "Riservata" e non calcola costi né ore: consuntivo e conto economico riportano solo il proprio team.

Vincoli e auto-compilazione restano corretti per tutti: le regole che dipendono dalla RAL (cap ore di compensazione e domenica di recupero) sono calcolate dalla funzione server `supabase/functions/planner`, che restituisce solo l'esito (regola violata, assegnazioni), mai importi, ore o RAL. Il team di una risorsa può essere cambiato solo da HR e Governance (controllo nel database).

I permessi sono applicati dal database (Row Level Security, `supabase/migrations`); la gestione account passa dalla funzione server `supabase/functions/admin-users`, che usa la chiave di servizio senza esporla al browser.

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
