import { useRef, useState, type ReactNode } from 'react'

export function Section({ id, letter, title, subtitle, actions, children }: { id: string; letter?: string; title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-start gap-3">
          {letter && <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-700 text-sm font-semibold text-white">{letter}</span>}
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-800 ring-blue-600/20',
  violet: 'bg-violet-50 text-violet-800 ring-violet-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
} as const

export function Badge({ tone = 'slate', children, title }: { tone?: keyof typeof TONES; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>
}

export function Button({ variant = 'secondary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-blue-700 text-white hover:bg-blue-800 shadow-sm',
    secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }[variant]
  return <button type="button" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props} />
}

export function NumberField({ label, value, onChange, step = 0.01, min, max, suffix, hint }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1 flex items-center rounded-lg bg-white ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-blue-600">
        <input
          type="number"
          className="num w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1.5 text-sm text-slate-900 outline-none"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = e.target.valueAsNumber
            if (Number.isFinite(n)) onChange(min !== undefined && n < min ? min : max !== undefined && n > max ? max : n)
          }}
        />
        {suffix && <span className="shrink-0 whitespace-nowrap pr-2.5 text-sm text-slate-500">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${tone === 'bad' ? 'text-red-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

/** Intestazione cliccabile di un accordion: freccia che ruota + etichetta Espandi/Chiudi. Il <details> padre deve avere la classe `group`. */
export function AccordionSummary({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <summary className={`flex items-center gap-2 rounded-xl select-none hover:bg-slate-100/70 ${compact ? 'px-4 py-2.5 text-sm text-slate-700' : 'px-4 py-3 text-slate-800'} font-semibold`}>
      <svg className="chev h-4 w-4 shrink-0 text-slate-500 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M7 4l6 6-6 6V4z" /></svg>
      <span className="flex-1">{children}</span>
      <span className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200 group-open:text-slate-500 group-open:ring-slate-200">
        <span className="group-open:hidden">Espandi</span>
        <span className="hidden group-open:inline">Chiudi</span>
      </span>
    </summary>
  )
}

export function Collapsible({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-slate-200 bg-white">
      <AccordionSummary>{title}</AccordionSummary>
      <div className="border-t border-slate-200 px-5 py-4">{children}</div>
    </details>
  )
}

/**
 * Campo di testo che salva solo all'uscita dal campo o con Invio (Esc annulla): evita salvataggi
 * e ricaricamenti a ogni tasto mentre si scrive. Un valore non valido torna al precedente.
 */
export function CommitInput({ value, onCommit, validate, type = 'text', ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string | number
  onCommit: (v: string) => void
  validate?: (v: string) => boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const shown = draft ?? String(value)
  const commit = () => {
    const v = draft
    setDraft(null)
    if (cancelled.current) { cancelled.current = false; return }
    if (v !== null && v !== String(value) && (!validate || validate(v))) onCommit(v)
  }
  return (
    <input
      {...rest}
      type={type}
      value={shown}
      onFocus={(e) => { setDraft(String(value)); rest.onFocus?.(e) }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur() }
      }}
    />
  )
}
