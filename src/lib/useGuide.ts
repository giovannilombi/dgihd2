import { useCallback, useEffect, useState } from 'react'
import { isGuideHash, markGuideSeen, readGuideHash, type GuideId } from './guides'

/**
 * Guida aperta: dal pulsante oppure da un link diretto (#/guida, #/guida/hr). Alla chiusura l'indirizzo
 * torna a quello della pagina (`restoreHash`), senza aggiungere voci alla cronologia.
 */
export function useGuide(own: GuideId) {
  const [open, setOpen] = useState<GuideId | null>(() => {
    const g = readGuideHash(location.hash, own)
    if (g) markGuideSeen(g)
    return g
  })
  useEffect(() => {
    const on = () => {
      const g = readGuideHash(location.hash, own)
      if (g) { markGuideSeen(g); setOpen(g) }
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [own])
  const show = useCallback((id: GuideId) => { markGuideSeen(id); setOpen(id) }, [])
  const close = useCallback((restoreHash: string) => {
    setOpen(null)
    if (isGuideHash(location.hash)) history.replaceState(null, '', restoreHash)
  }, [])
  return { open, show, close }
}
