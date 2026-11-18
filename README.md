# Piano Reperibilità Q4 2026

Web app single-page (React + TypeScript + Tailwind) per il piano di reperibilità Novembre–Dicembre 2026:

- **Documento HR**: abstract sempre visibile e approfondimenti (modello matematico, analisi giuridica, tabella rapida B1) in sezioni espandibili, con valori ricalcolati sui parametri correnti.
- **A · Parametri**: ricavi, gettoni netti target, cap ore di compensazione, moltiplicatore costo aziendale, coefficienti netto/lordo, maggiorazioni e indennità CCNL.
- **B · Team**: anagrafica (aggiungi, modifica, elimina), stato di rotazione (KO), disponibilità dichiarata (volontario, max 1–3 turni/mese, nessuna preferenza) usata dall'auto-compilazione, import da CSV o da Excel incollato con template scaricabile, anteprima e segnalazione degli errori riga per riga.
- **C · Calendario**: slot feriali e festivi (festività di Milano incluse), motore vincoli in tempo reale con il motivo di ogni blocco, auto-compilazione, blocco dei giorni non richiesti dal cliente (lucchetto).
- **D · Consuntivo / E · Conto economico**: gettone di disponibilità lordo per settimana (modalità preferibile) e, in alternativa, ore di straordinario su Domenica o Sabato (cap 8h); netto, costo aziendale, KPI e grafico di marginalità.

Salvataggio automatico in LocalStorage, export/import della configurazione JSON (validata), report CSV HR & Finance, export dei soli turni in Excel formattato o in PDF (senza dati economici).

## Accesso

L'app è divisa in pagine (Documento HR, A–E) e chiede utente e password. L'accesso alla pagina Anagrafica è riservato ai soli autorizzati (seconda password). Il controllo è solo nel browser: nel bundle c'è l'hash SHA-256 delle credenziali, non le credenziali in chiaro. Basta a tenere fuori un accesso occasionale, ma non è una protezione lato server.

## Dati personali

Il sito pubblicato contiene **solo il codice e 4 risorse placeholder**. L'anagrafica reale (nomi, RAL, disponibilità) viene inserita da chi usa il tool e resta **esclusivamente nel suo browser** (LocalStorage): non viene mai inviata a un server né salvata nel repository. Per condividerla tra colleghi si usa il file JSON esportato, da trasmettere su canali interni.

Il `.gitignore` esclude CSV, Excel, PDF ed export JSON: **non committare mai file con dati reali**.

## Sviluppo

```bash
npm install
npm run dev      # sviluppo
npm test         # test del motore di calcolo e dei vincoli
npm run build    # genera dist/index.html, file unico e autonomo da condividere
```

Logica di dominio in `src/lib/`: `economics.ts` (calcoli), `rules.ts` (vincoli, compensazione settimanale, auto-compilazione), `reports.ts` (consuntivo, P&L, CSV).
