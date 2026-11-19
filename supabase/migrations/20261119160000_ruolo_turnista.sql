-- Nuovo livello di accesso "Turnista": vede solo il calendario dei turni, con i propri evidenziati.
-- (Il valore va aggiunto in una migrazione a sé: PostgreSQL non permette di usarlo nella stessa transazione.)
alter type public.app_role add value if not exists 'turnista';
