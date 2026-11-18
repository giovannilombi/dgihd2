import { useState } from 'react'
import { verifyCredentials } from '../lib/auth'

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [user, setUser] = useState('')
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (await verifyCredentials(user, pwd)) onSuccess()
      else setError('Credenziali non valide.')
    } catch {
      setError('Verifica non disponibile in questo browser: apri il file da un browser aggiornato (Chrome, Edge, Safari, Firefox).')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Accesso riservato</div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Piano reperibilità - ARM</h1>
          <p className="mt-1 text-sm text-slate-500">Inserisci le credenziali per accedere al simulatore.</p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Utente</span>
          <input autoFocus autoComplete="username" value={user} onChange={(e) => { setUser(e.target.value); setError('') }} className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input type="password" autoComplete="current-password" value={pwd} onChange={(e) => { setPwd(e.target.value); setError('') }} className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !user || !pwd} className="mt-5 w-full rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
          {busy ? 'Verifica…' : 'Accedi'}
        </button>
      </form>
    </div>
  )
}
