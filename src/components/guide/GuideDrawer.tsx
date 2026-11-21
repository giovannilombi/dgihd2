import { useEffect, useRef } from 'react'
import { GUIDE_TITLE, GUIDE_TONE, guideSeen, type GuideCtx, type GuideId } from '../../lib/guides'
import { ROLE_LABEL } from '../../lib/roles'
import { GuideDoc } from './GuideDoc'
import { BookIcon } from './kit'

/**
 * Pulsante "Guida" accanto al nome: colore del profilo e puntino che pulsa finché la guida
 * non è stata aperta su questo dispositivo. Apre sempre la guida del proprio profilo.
 */
export function GuideButton({ id, onOpen }: { id: GuideId; onOpen: () => void }) {
  const tone = GUIDE_TONE[id]
  const fresh = !guideSeen(id)
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" title={`Guida per il profilo ${ROLE_LABEL[id]}`}
      className={`no-print relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${tone.pill}`}>
      <BookIcon />
      Guida
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
 * Guida del proprio profilo: pannello a destra (a tutto schermo su telefono). Esc o il fondo scuro
 * la chiudono; il fuoco resta nel pannello e alla chiusura torna dove era.
 */
export function GuideDrawer({ id, ctx, onClose }: { id: GuideId; ctx: GuideCtx; onClose: () => void }) {
  const tone = GUIDE_TONE[id]
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [title, lead] = GUIDE_TITLE[id]

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; back?.focus?.() }
  }, [])

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
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone.solid}`}><BookIcon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 id="guida-titolo" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-semibold text-slate-900">
                Guida per il profilo
                <span className={`rounded-lg px-2.5 py-0.5 ${tone.solid}`}>{ROLE_LABEL[id]}</span>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600"><span className="font-semibold text-slate-900">{title}.</span> {lead}</p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Chiudi la guida"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
            </button>
          </div>
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <GuideDoc id={id} ctx={ctx} scrollRef={scrollRef} />
        </div>
      </aside>
    </div>
  )
}
