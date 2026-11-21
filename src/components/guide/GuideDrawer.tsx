import { useEffect, useRef } from 'react'
import { GUIDE_IDS, GUIDE_LABEL, GUIDE_TITLE, GUIDE_TONE, guideSeen, type GuideCtx, type GuideId } from '../../lib/guides'
import { ROLE_LABEL } from '../../lib/roles'
import { GuideDoc } from './GuideDoc'
import { BookIcon } from './kit'

/**
 * Pulsante della guida accanto al nome: colore del profilo e puntino che pulsa finché la guida
 * non è stata aperta su questo dispositivo. Su schermi stretti mostra solo "Guida".
 */
export function GuideButton({ id, onOpen }: { id: GuideId; onOpen: () => void }) {
  const tone = GUIDE_TONE[id]
  const fresh = !guideSeen(id)
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" title={`${GUIDE_LABEL[id]}: come funziona l'app per il profilo ${ROLE_LABEL[id]}`}
      className={`no-print relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${tone.pill}`}>
      <BookIcon />
      <span className="sm:hidden">Guida</span>
      <span className="hidden sm:inline">{GUIDE_LABEL[id]}</span>
      {fresh && (
        <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden>
          <span className={`absolute inset-0 rounded-full opacity-75 motion-safe:animate-ping ${tone.ping}`} />
          <span className={`relative h-2.5 w-2.5 rounded-full ring-2 ring-white ${tone.dot}`} />
        </span>
      )}
      {fresh && <span className="sr-only">(da leggere)</span>}
    </button>
  )
}

/**
 * Guida aperta: pannello a destra (a tutto schermo su telefono). Esc o il fondo scuro la chiudono;
 * il fuoco resta nel pannello e alla chiusura torna dove era. Lo Space admin può leggere le guide di tutti.
 */
export function GuideDrawer({ id, own, ctx, onSwitch, onClose }: {
  id: GuideId; own: GuideId; ctx: GuideCtx; onSwitch: (id: GuideId) => void; onClose: () => void
}) {
  const tone = GUIDE_TONE[id]
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const switchable = own === 'super_admin'
  const [title, lead] = GUIDE_TITLE[id]

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; back?.focus?.() }
  }, [])
  useEffect(() => { scrollRef.current?.scrollTo(0, 0) }, [id])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = [...panelRef.current.querySelectorAll<HTMLElement>('button, select, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'))
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end">
      <div className="guide-fade absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="guida-titolo" onKeyDown={onKeyDown}
        className="guide-in relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="border-b border-slate-200 px-5 pb-4 pt-5 sm:px-8">
          <div className="flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone.solid}`}><BookIcon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${tone.text}`}>Guida per il profilo {ROLE_LABEL[id]}</p>
              <h2 id="guida-titolo" className="mt-0.5 text-xl font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{lead}</p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Chiudi la guida"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
            </button>
          </div>
          {switchable && (
            <label className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
              Guida da mostrare
              <select value={id} onChange={(e) => onSwitch(e.target.value as GuideId)}
                className="rounded-lg bg-white px-2.5 py-1.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-300">
                {GUIDE_IDS.map((g) => <option key={g} value={g}>{GUIDE_LABEL[g]}{g === own ? ' (la tua)' : ''}</option>)}
              </select>
            </label>
          )}
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <GuideDoc key={id} id={id} ctx={ctx} scrollRef={scrollRef} />
        </div>
      </aside>
    </div>
  )
}
