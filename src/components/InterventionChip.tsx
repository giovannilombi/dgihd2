import type { ShiftChipInfo } from '../lib/interventions'

const ICON = {
  pending: <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M6 3h8M6 17h8M7 3c0 4 6 4 6 7s-6 3-6 7M13 3c0 4-6 4-6 7s6 3 6 7" /></svg>,
  approved: <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><path d="M4 10.5l4 4 8-9" /></svg>,
  todo: <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M13.5 3.5l3 3L7 16H4v-3z" /></svg>,
  rejected: <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>,
}

const n = (k: number) => (k === 1 ? '1 intervento' : `${k} interventi`)

/** Chip dello stato degli interventi di un turno (giallo in approvazione, verde approvati, arancio da compilare, grigio nessuno). */
export function InterventionChip({ info, className = '' }: { info: ShiftChipInfo; className?: string }) {
  const base = `inline-flex items-center gap-1 self-start whitespace-nowrap rounded-md px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset ${className}`
  switch (info.chip) {
    case 'pending': return <span className={`${base} bg-yellow-100 text-yellow-900 ring-yellow-300`} title="In approvazione">{ICON.pending}{n(info.count)}</span>
    case 'approved': return <span className={`${base} bg-green-100 text-green-800 ring-green-300`} title="Approvati">{ICON.approved}{n(info.count)}</span>
    case 'rejected': return <span className={`${base} bg-red-50 text-red-800 ring-red-300`} title="Da correggere e rimandare">{ICON.rejected}{info.count === 1 ? 'Rifiutato' : `${info.count} rifiutati`}</span>
    case 'todo': return <span className={`${base} bg-orange-100 text-orange-900 ring-orange-300`} title="Il turnista deve indicare gli interventi o Nessun intervento">{ICON.todo}Da compilare</span>
    case 'nothing': return <span className={`${base} bg-slate-100 text-slate-600 ring-slate-200`}>Nessun intervento</span>
    default: return null
  }
}
