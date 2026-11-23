import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { PasswordDialog } from './PasswordDialog'
import { Button } from './ui'

/** Attiva o spegne la vista completa per sé: il database verifica l'abilitazione. */
async function setFullView(on: boolean) {
  const { error } = await supabase.rpc('set_full_view', { p_on: on })
  if (error) throw new Error(error.message)
}

/**
 * Impostazioni personali: per gli account abilitati, l'interruttore "Calcoli e importi".
 * Per accenderlo serve la password; a ogni cambio la pagina si ricarica, così i dati già letti
 * (RAL, livelli, importi) spariscono dal browser.
 */
export function SettingsDialog({ on, verify, onClose }: { on: boolean; verify: (password: string) => Promise<boolean>; onClose: () => void }) {
  const [askPassword, setAskPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const apply = async (next: boolean) => {
    setBusy(true)
    setError('')
    try {
      await setFullView(next)
      location.reload()
    } catch (e) {
      setError(`Impostazione non salvata: ${(e as Error).message}`)
      setBusy(false)
    }
  }
  if (askPassword) {
    return (
      <PasswordDialog title="Attiva calcoli e importi" description="Reinserisci la tua password: la pagina si ricaricherà con RAL, livelli e importi."
        verify={verify} onSuccess={() => { setAskPassword(false); void apply(true) }} onClose={() => setAskPassword(false)} />
    )
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="settings-title"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="settings-title" className="text-lg font-semibold text-slate-900">Impostazioni</h3>
        <div className="mt-4 flex items-start gap-4 rounded-xl px-4 py-3 ring-1 ring-inset ring-slate-200">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">Calcoli e importi</div>
            <p className="mt-0.5 text-sm text-slate-600">
              {on
                ? 'Attivi: vedi RAL, livelli, importi, Consuntivo e Conto economico.'
                : 'Spenti: RAL, livelli e importi non arrivano in questo browser.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Spegnili prima di condividere lo schermo.</p>
          </div>
          <button type="button" role="switch" aria-checked={on} disabled={busy} autoFocus
            aria-label={on ? 'Spegni calcoli e importi' : 'Attiva calcoli e importi'}
            onClick={() => (on ? void apply(false) : setAskPassword(true))}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 ${on ? 'bg-blue-700' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        {busy && <p role="status" className="mt-3 text-sm text-slate-500">Aggiornamento…</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={onClose}>Chiudi</Button>
        </div>
      </div>
    </div>
  )
}
