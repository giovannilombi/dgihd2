import { Component, type ReactNode } from 'react'
import { STORAGE_KEY_DATA } from '../lib/store'

/** Rete di sicurezza: se dati corrotti mandano in errore la pagina, offre il ripristino invece di una schermata bianca. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    const reset = () => {
      try { localStorage.removeItem(STORAGE_KEY_DATA) } catch { /* storage non disponibile */ }
      location.reload()
    }
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <div role="alert" className="max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Si è verificato un errore</h1>
          <p className="mt-2 text-sm text-slate-600">I dati salvati sembrano non validi e la pagina non può essere mostrata. Puoi ricaricare oppure ripristinare i dati iniziali (team placeholder e calendario vuoto).</p>
          <p className="mt-2 rounded bg-slate-50 p-2 font-mono text-xs text-slate-500">{this.state.error.message}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => location.reload()} className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50">Ricarica</button>
            <button type="button" onClick={reset} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800">Ripristina dati iniziali</button>
          </div>
        </div>
      </div>
    )
  }
}
