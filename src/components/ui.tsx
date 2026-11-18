import type { ReactNode } from 'react'

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
        {suffix && <span className="pr-2.5 text-sm text-slate-500">{suffix}</span>}
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

export function Collapsible({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex items-center gap-2 px-4 py-3 font-semibold text-slate-800 hover:bg-slate-50">
        <svg className="chev h-4 w-4 shrink-0 text-slate-400 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M7 4l6 6-6 6V4z" /></svg>
        <span className="flex-1">{title}</span>
        <span className="text-xs font-normal text-slate-400 group-open:hidden">Clicca per espandere</span>
      </summary>
      <div className="border-t border-slate-200 px-5 py-4">{children}</div>
    </details>
  )
}
