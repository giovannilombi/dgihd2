import { useState } from 'react'
import { Button } from './ui'

/** Cambio password: obbligatorio al primo accesso e dopo un reset; disponibile anche dal menu utente. */
export function ChangePasswordForm({ forced, onSubmit, onCancel }: { forced?: boolean; onSubmit: (pwd: string) => Promise<void>; onCancel?: () => void }) {
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const problem =
    pwd.length > 0 && pwd.length < 10 ? 'Almeno 10 caratteri.'
    : /^[a-z]+-[a-z]+-\d{2}$/.test(pwd) ? 'Scegli una password diversa da quella temporanea.'
    : pwd2 && pwd !== pwd2 ? 'Le due password non coincidono.'
    : ''

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (problem || pwd !== pwd2) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(pwd)
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done && !forced) return <div className="text-sm text-emerald-800">Password aggiornata.<div className="mt-4 flex justify-end"><Button onClick={onCancel}>Chiudi</Button></div></div>

  return (
    <form onSubmit={submit}>
      {forced && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Stai usando una password temporanea: per continuare scegline una personale.</p>}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Nuova password</span>
        <input type="password" autoFocus autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
      </label>
      <label className="mt-3 block">
        <span className="text-sm font-medium text-slate-700">Ripeti la nuova password</span>
        <input type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
      </label>
      <p className="mt-2 text-xs text-slate-500">Almeno 10 caratteri. Non riutilizzare password di altri servizi.</p>
      {(problem || error) && <p role="alert" className="mt-2 text-sm text-red-700">{problem || error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Annulla</Button>}
        <Button type="submit" variant="primary" disabled={busy || !!problem || !pwd || pwd !== pwd2}>{busy ? 'Salvataggio…' : 'Salva nuova password'}</Button>
      </div>
    </form>
  )
}

export function ForcedPasswordChange({ email, onSubmit, onSignOut }: { email: string; onSubmit: (pwd: string) => Promise<void>; onSignOut: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Primo accesso</div>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Imposta la tua password</h1>
        <p className="mt-1 mb-4 text-sm text-slate-500">{email}</p>
        <ChangePasswordForm forced onSubmit={onSubmit} />
        <button type="button" onClick={onSignOut} className="mt-4 text-xs text-slate-500 hover:underline">Esci</button>
      </div>
    </div>
  )
}
