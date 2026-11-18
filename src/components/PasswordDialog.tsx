import { useState } from 'react'
import { Button } from './ui'

/** Finestra che chiede di reinserire la propria password prima di un'azione sensibile. */
export function PasswordDialog({ title, description, verify, onSuccess, onClose }: { title: string; description: string; verify: (password: string) => Promise<boolean>; onSuccess: () => void; onClose: () => void }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (await verify(pwd)) onSuccess()
      else setError('Password non corretta.')
    } catch {
      setError('Verifica non disponibile in questo browser.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="pwd-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="pwd-title" className="font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        <input type="password" autoFocus autoComplete="off" value={pwd} aria-label="La tua password"
          onChange={(e) => { setPwd(e.target.value); setError('') }}
          className="mt-4 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" placeholder="La tua password" />
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button type="submit" variant="primary" disabled={busy || !pwd}>{busy ? 'Verifica…' : 'Conferma'}</Button>
        </div>
      </form>
    </div>
  )
}

export function EyeIcon({ off, className = 'h-4 w-4' }: { off?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.6" />
      {off && <path d="M3 3l14 14" />}
    </svg>
  )
}

