# Piano reperibilità - ARM

Primo periodo pianificato: Novembre – Dicembre 2026.

Web app single-page (React + TypeScript + Tailwind) per il piano di reperibilità Novembre–Dicembre 2026:

- **Approccio**: presentazione del modello (sintesi sempre visibile; calcolo del gettone, tutele e riferimenti normativi, valori per RAL in sezioni espandibili), con valori ricalcolati sui parametri correnti.
- **A · Parametri**: ricavi, gettoni netti target, cap ore di compensazione, moltiplicatore costo aziendale, coefficienti netto/lordo, maggiorazioni e indennità CCNL.
- **B · Team**: anagrafica (aggiungi, modifica, elimina), stato di rotazione (KO), disponibilità dichiarata (volontario, max 1–3 turni/mese, nessuna preferenza) usata dall'auto-compilazione, import da CSV o da Excel incollato con template scaricabile, anteprima e segnalazione degli errori riga per riga.
- **C · Calendario**: slot feriali e festivi (festività di Milano incluse), motore vincoli in tempo reale con il motivo di ogni blocco, auto-compilazione, blocco dei giorni non richiesti dal cliente (lucchetto).
- **D · Consuntivo / E · Conto economico**: gettone di disponibilità lordo per settimana (modalità preferibile) e, in alternativa, ore di straordinario su Domenica o Sabato (cap 8h); netto, costo aziendale, KPI e grafico di marginalità.

Salvataggio automatico in LocalStorage, export/import della configurazione JSON (validata), report CSV HR & Finance, export dei soli turni in Excel formattato o in PDF (senza dati economici).

## Accesso e dati condivisi

I dati (anagrafica, ferie, turni, parametri) stanno in un database **Supabase** (UE, Francoforte) e sono condivisi in tempo reale tra gli utenti. Il sito su GitHub Pages contiene solo il codice. Ogni persona accede con email e password personali; al primo accesso e dopo un reset la password temporanea (formato `animale-animale-NN`) va cambiata, e finché non viene cambiata il database non restituisce alcun dato.

| Livello | Vede | Modifica |
|---|---|---|
| Super admin | tutto | tutto + utenti e livelli (pagina Utenti) |
| Full edit | tutto | tutto, senza gestione utenti |
| Viewer esteso | tutto (RAL e livello reinserendo la propria password) | nulla |
| Viewer | solo calendario turni | nulla |

I permessi sono applicati dal database (Row Level Security, `supabase/migrations`); la gestione account passa dalla funzione server `supabase/functions/admin-users`, che usa la chiave di servizio senza esporla al browser.

### Accesso (versione precedente)

Le password condivise lato browser delle prime versioni sono state sostituite dal login personale su Supabase.

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
