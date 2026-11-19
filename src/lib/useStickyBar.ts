import { useCallback, useRef, useState } from 'react'

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
