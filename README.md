# Piano Reperibilità Q4 2026

Web app single-page (React + TypeScript + Tailwind) per il piano di reperibilità Novembre–Dicembre 2026:

- **Documento HR**: abstract sempre visibile e approfondimenti (modello matematico, analisi giuridica, tabella rapida B1) in sezioni espandibili, con valori ricalcolati sui parametri correnti.
- **A · Parametri**: ricavi, gettoni netti target, cap ore di compensazione, moltiplicatore costo aziendale, coefficienti netto/lordo, maggiorazioni e indennità CCNL.
- **B · Team**: anagrafica (aggiungi, modifica, elimina), stato di adesione alla rotazione, import da CSV o da Excel incollato.
- **C · Calendario**: slot feriali e festivi (festività di Milano incluse), motore vincoli in tempo reale con il motivo di ogni blocco, auto-compilazione.
- **D · Consuntivo e P&L**: gettone di disponibilità lordo per settimana (modalità preferibile) e, in alternativa, ore di straordinario su Domenica o Sabato (cap 8h); netto, costo aziendale, KPI e grafico di marginalità.

Salvataggio automatico in LocalStorage, export/import della configurazione JSON, report CSV, stampa/PDF dal browser.

## Accesso

L'app chiede utente e password. Il controllo è solo nel browser: nel bundle c'è l'hash SHA-256 delle credenziali, non le credenziali in chiaro. Basta a tenere fuori un accesso occasionale, ma non è una protezione lato server.

## Sviluppo

```bash
npm install
npm run dev      # sviluppo
npm test         # test del motore di calcolo e dei vincoli
npm run build    # genera dist/index.html, file unico e autonomo da condividere
```

Logica di dominio in `src/lib/`: `economics.ts` (calcoli), `rules.ts` (vincoli, compensazione settimanale, auto-compilazione), `reports.ts` (consuntivo, P&L, CSV).
