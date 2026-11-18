import { useState } from 'react'

export function Login({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSignIn(email, pwd)
    } catch (err) {
      setError((err as Error).message)
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
          <p className="mt-1 text-sm text-slate-500">Accedi con la tua email e la tua password personale.</p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input type="email" autoFocus autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input type="password" autoComplete="current-password" value={pwd} onChange={(e) => { setPwd(e.target.value); setError('') }} className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !email || !pwd} className="mt-5 w-full rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
          {busy ? 'Accesso…' : 'Accedi'}
        </button>
        <p className="mt-4 text-xs text-slate-500">Password dimenticata? Chiedi al super admin di reimpostarla: riceverai una password temporanea da cambiare al primo accesso.</p>
      </form>
    </div>
  )
}
