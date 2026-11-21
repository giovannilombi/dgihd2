import { createClient } from '@supabase/supabase-js'

// URL e chiave "publishable" sono pubblici per progetto: l'accesso ai dati è regolato
// lato database dalle regole RLS in base al livello dell'utente autenticato.
export const SUPABASE_URL = 'https://tvmvxfspsjabcluebzfg.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_x6bZ2ttAgvS9b_34bUx-hQ_YhK2JbdB'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'arm-hd2-auth' },
})

/** Chiamata a una funzione server con il token della sessione corrente; il messaggio d'errore è quello leggibile restituito dalla funzione. */
export async function callFunction<T = Record<string, unknown>>(name: string, body: Record<string, unknown>, retried = false): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  const status = (error as { context?: Response } | null)?.context?.status
  if (error && status === 401 && !retried) {
    // sessione chiusa lato server (es. dopo un cambio password): prova a rinnovarla una volta
    const { error: refreshErr } = await supabase.auth.refreshSession()
    if (!refreshErr) return callFunction<T>(name, body, true)
  }
  if (error) {
    let message = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) message = (await ctx.json()).error ?? message
    } catch { /* risposta non JSON */ }
    throw new Error(message)
  }
  return data as T
}

/** Gestione account (space admin, cambio password). */
export const adminCall = <T = Record<string, unknown>>(body: Record<string, unknown>) => callFunction<T>('admin-users', body)
