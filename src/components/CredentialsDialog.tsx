import { useState } from 'react'
import type { Credential } from '../lib/accounts'
import { Button } from './ui'

/** Password provvisorie dei nuovi account, da comunicare su un canale riservato (restano copiabili dalla lista utenti finché non vengono cambiate). */
export function CredentialsDialog({ items, errors = [], onClose }: { items: Credential[]; errors?: string[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copyAll = () => {
    void navigator.clipboard?.writeText(items.map((c) => `${c.name}\t${c.email}\t${c.password}`).join('\n'))
    setCopied(true)
  }
  const title = items.length === 1 ? 'Account Turnista creato' : `${items.length} account Turnista creati`
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="cred-title">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="cred-title" className="text-lg font-semibold text-slate-900">{items.length ? title : 'Nessun account creato'}</h3>
        {items.length > 0 && (
          <>
            <p className="mt-1 text-sm text-slate-500">Copiale e comunicale a ciascuno su un canale riservato. Restano copiabili dalla lista utenti finché la persona non le cambia, cosa che dovrà fare al primo accesso.</p>
            <div className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-50">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-2 font-medium">Nome</th><th className="py-2 pr-3 font-medium">Email</th><th className="py-2 pr-3 font-medium">Password temporanea</th></tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.email} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-medium text-slate-900">{c.name}</td>
                      <td className="py-2 pr-3 text-slate-600">{c.email}</td>
                      <td className="py-2 pr-3"><code className="font-mono font-semibold text-slate-900 select-all">{c.password}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">Ogni account è già collegato alla sua scheda nel Team: al primo accesso la persona vede evidenziati i propri turni.</p>
          </>
        )}
        {errors.length > 0 && (
          <ul role="alert" className="mt-3 space-y-0.5 rounded-lg bg-red-50 p-2.5 text-xs text-red-800">
            {errors.map((e) => <li key={e}>✕ {e}</li>)}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {items.length > 0 && <Button onClick={copyAll}>{copied ? 'Copiato' : 'Copia tutto'}</Button>}
          <Button variant="primary" onClick={onClose}>{items.length ? 'Ho copiato le password' : 'Chiudi'}</Button>
        </div>
      </div>
    </div>
  )
}
