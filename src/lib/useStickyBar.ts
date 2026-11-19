import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Callback ref che pubblica l'altezza dell'elemento in una variabile CSS sulla radice del documento
 * (es. `--app-header-h`), aggiornata quando l'elemento cambia dimensione (intestazione che va a capo).
 * Serve agli elementi `sticky` che devono fermarsi subito sotto.
 */
export function useHeightVar(name: string) {
  const stop = useRef<(() => void) | null>(null)
  return useCallback((el: HTMLElement | null) => {
    stop.current?.()
    stop.current = null
    if (!el) return
    const root = document.documentElement
    const set = () => root.style.setProperty(name, `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    stop.current = () => { ro.disconnect(); root.style.removeProperty(name) }
  }, [name])
}

/**
 * Come `useHeightVar`, e in più dice se la barra `sticky` è attualmente agganciata in alto
 * (per mostrare l'ombra solo quando il contenuto le scorre sotto).
 */
export function useStickyBar(name: string) {
  const [stuck, setStuck] = useState(false)
  const heightRef = useHeightVar(name)
  const stop = useRef<(() => void) | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    heightRef(el)
    stop.current?.()
    stop.current = null
    if (!el) return
    let frame = 0
    const check = () => {
      frame = 0
      const cs = getComputedStyle(el)
      const top = parseFloat(cs.top)
      setStuck(cs.position === 'sticky' && Number.isFinite(top) && el.getBoundingClientRect().top <= top + 0.5)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check) }
    check()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    stop.current = () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [heightRef])
  return { ref, stuck }
}

export interface StickyOverlay { id: string; left: number; width: number }

/**
 * Intestazione di sezione "fissa" sotto una barra sticky: restituisce l'ultima sezione di `area`
 * (elementi con `data-sticky-id`) la cui intestazione è già passata sotto la barra, con posizione
 * e larghezza dell'area rispetto alla barra. `null` se la barra non è agganciata o nessuna
 * intestazione è ancora passata sotto. Serve quando le intestazioni stanno in un contenitore con
 * scorrimento orizzontale, dove `position: sticky` non può agganciarsi alla pagina.
 */
export function useStickyOverlay(bar: RefObject<HTMLElement | null>, area: RefObject<HTMLElement | null>, overlayEl: RefObject<HTMLElement | null>, key: string) {
  const [overlay, setOverlay] = useState<StickyOverlay | null>(null)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const b = bar.current, a = area.current
      if (!b || !a || getComputedStyle(b).position !== 'sticky') { setOverlay(null); return }
      const br = b.getBoundingClientRect(), ar = a.getBoundingClientRect()
      // Compare quando la prima intestazione passa sotto la barra; poi passa alla sezione successiva
      // quando la sua intestazione raggiunge il bordo inferiore della copia fissa.
      const limit = br.bottom - 0.5 + (overlayEl.current?.offsetHeight ?? 0)
      let id: string | null = null
      for (const el of a.querySelectorAll<HTMLElement>('[data-sticky-id]')) if (el.getBoundingClientRect().top < limit) id = el.dataset.stickyId ?? null
      // Sparisce quando l'area è quasi tutta passata (la barra si sgancia con la fine del contenitore).
      if (!id || ar.bottom <= br.bottom + 48) { setOverlay(null); return }
      const next = { id, left: Math.round(ar.left - br.left), width: Math.round(ar.width) }
      setOverlay((prev) => prev && prev.id === next.id && prev.left === next.left && prev.width === next.width ? prev : next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [bar, area, overlayEl, key])
  return overlay
}
