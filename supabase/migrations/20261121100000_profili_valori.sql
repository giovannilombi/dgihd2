-- Profili normalizzati (passo 1 di 2): nuovi valori del livello. Gli account si migrano nel passo 2,
-- in una transazione separata (un nuovo valore di enum non si può usare nella stessa transazione).
-- Super admin (unico) · Governance · Director · HR · PM · Viewer · Turnista
alter type public.app_role add value if not exists 'governance';
alter type public.app_role add value if not exists 'director';
alter type public.app_role add value if not exists 'hr';
alter type public.app_role add value if not exists 'pm';
