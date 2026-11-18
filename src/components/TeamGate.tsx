import { useState, type ReactNode } from 'react'
import { isTeamUnlocked, setTeamUnlocked, verifyTeamPassword } from '../lib/auth'
import { Button } from './ui'

/** Protegge in pagina l'anagrafica (contiene le RAL) con una password dedicata. */
export function TeamGate({ children }: { children: (lock: () => void) => ReactNode }) {
  const [unlocked, setUnlocked] = useState(isTeamUnlocked)
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (unlocked) return <>{children(() => { setTeamUnlocked(false); setUnlocked(false) })}</>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (await verifyTeamPassword(pwd)) { setTeamUnlocked(true); setUnlocked(true); setPwd('') }
      else setError('Password non corretta.')
    } catch {
      setError('Verifica non disponibile in questo browser.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-6 max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-800 text-white">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5" aria-hidden><rect x="4" y="9" width="12" height="8.5" rx="1.8" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
      </span>
      <h3 className="mt-3 font-semibold text-slate-900">Anagrafica riservata</h3>
      <p className="mt-1 text-sm text-slate-500">Contiene le RAL delle persone: inserisci la password dedicata per visualizzarla.</p>
      <input type="password" autoFocus autoComplete="off" value={pwd} aria-label="Password anagrafica"
        onChange={(e) => { setPwd(e.target.value); setError('') }}
        className="mt-4 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" placeholder="Password anagrafica" />
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" variant="primary" className="mt-3 w-full justify-center" disabled={busy || !pwd}>{busy ? 'Verifica…' : 'Sblocca anagrafica'}</Button>
    </form>
  )
}
