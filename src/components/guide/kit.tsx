import type { ReactNode } from 'react'

/**
 * Elementi grafici delle guide. Tutto neutro (grigi): il colore lo danno solo i veri elementi dell'app
 * riprodotti (chip di stato, pulsanti), così chi legge li riconosce subito quando li incontra.
 */

/** Paragrafo. */
export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-slate-700">{children}</p>
}

/** Elenco puntato breve. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed text-slate-700">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden /><span className="min-w-0">{x}</span></li>
      ))}
    </ul>
  )
}

/** Passi numerati, in ordine. */
export function Steps({ items }: { items: [ReactNode, ReactNode?][] }) {
  return (
    <ol className="space-y-3">
      {items.map(([title, body], i) => (
        <li key={i} className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-300">{i + 1}</span>
          <div className="min-w-0 pt-0.5 text-sm leading-relaxed text-slate-700">
            <div className="font-medium text-slate-900">{title}</div>
            {body && <div className="mt-0.5">{body}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Riproduzione di una parte dell'app, con didascalia. */
export function Mock({ caption, children, className = '' }: { caption?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={`rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 ${className}`}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400" aria-hidden>Nell'app</div>
      {children}
      {caption && <figcaption className="mt-2.5 text-xs leading-relaxed text-slate-500">{caption}</figcaption>}
    </figure>
  )
}

/** Nota a margine: neutra, oppure di attenzione. */
export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-lg border-l-2 px-3 py-2 text-sm leading-relaxed ${warn ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-300 bg-slate-50 text-slate-700'}`}>{children}</div>
  )
}

/** Riquadri affiancati: titolo e spiegazione breve. */
export function Cards({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 2 | 3 }) {
  return (
    <div className={`grid gap-2.5 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {items.map(([title, body], i) => (
        <div key={i} className="rounded-xl bg-white p-3 ring-1 ring-inset ring-slate-200">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs leading-relaxed text-slate-600">{body}</div>
        </div>
      ))}
    </div>
  )
}

/** Flusso a passaggi: riquadri bianchi collegati da frecce (su telefono vanno a capo). */
export function Flow({ steps }: { steps: { top?: ReactNode; label: ReactNode; sub?: ReactNode }[] }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-x-1.5 gap-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-stretch gap-1.5">
          {i > 0 && <span className="self-center text-slate-300" aria-hidden>→</span>}
          <div className="flex min-w-[104px] max-w-[180px] flex-col justify-center rounded-lg bg-white px-2.5 py-2 ring-1 ring-inset ring-slate-200">
            {s.top && (typeof s.top === 'string'
              ? <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.top}</div>
              : <div className="mb-1.5 flex">{s.top}</div>)}
            <div className="text-xs font-semibold text-slate-900">{s.label}</div>
            {s.sub && <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{s.sub}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Tabella semplice. */
export function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 align-top text-slate-700">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

/** Domande frequenti. */
export function Faq({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([q, a], i) => (
        <div key={i}>
          <dt className="text-sm font-semibold text-slate-900">{q}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-slate-600">{a}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Pulsante dell'app riprodotto (non cliccabile): stessi stili di Button. */
export function UiBtn({ children, variant = 'secondary', small }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'approve' | 'link'; small?: boolean }) {
  const styles = {
    primary: 'bg-blue-700 text-white shadow-sm',
    secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300',
    danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200',
    approve: 'bg-emerald-700 text-white shadow-sm',
    link: 'text-blue-700 underline-offset-2',
  }[variant]
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg font-medium ${small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'} ${styles}`}>{children}</span>
}

/** Nome di una scheda o di un pulsante dell'app, nel testo. */
export function Ui({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>
}

/** Stato del giorno, come nel calendario. */
export function DayChip({ state }: { state: 'open' | 'erogato' | 'consuntivato' }) {
  const s = {
    open: ['bg-slate-100 text-slate-600 ring-slate-200', 'Da erogare'],
    erogato: ['bg-emerald-50 text-emerald-800 ring-emerald-200', 'Erogato'],
    consuntivato: ['bg-indigo-50 text-indigo-800 ring-indigo-200', 'Consuntivato'],
  }[state]
  return <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 py-px text-[11px] font-semibold ring-1 ring-inset ${s[0]}`}>{s[1]}</span>
}

/** Campo di un modulo riprodotto. */
export function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="text-xs font-medium text-slate-600">{label}
      <div className={`mt-1 rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300 ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

export function PinGlyph({ on }: { on?: boolean }) {
  return (
    <span className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded ${on ? 'bg-blue-700 text-white' : 'bg-white text-slate-500 ring-1 ring-inset ring-slate-300'}`} aria-hidden>
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor"><path d="M7 2h6l-1 5 3 3H5l3-3zM9.3 10h1.4v8H9.3z" /></svg>
    </span>
  )
}

export function LockGlyph() {
  return (
    <span className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-700 text-white" aria-hidden>
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="9" width="12" height="8" rx="1.5" /><path d="M7 9V6a3 3 0 0 1 6 0v3" /></svg>
    </span>
  )
}

export function BookIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M3 4.5c2.5-1 4.8-1 7 .5v11c-2.2-1.5-4.5-1.5-7-.5z" /><path d="M17 4.5c-2.5-1-4.8-1-7 .5v11c2.2-1.5 4.5-1.5 7-.5z" />
    </svg>
  )
}
