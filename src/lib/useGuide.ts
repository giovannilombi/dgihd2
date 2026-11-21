import { useCallback, useEffect, useState } from 'react'
import { isGuideHash, markGuideSeen, type GuideId } from './guides'

/**
 * Guida del proprio profilo: si apre dal pulsante "Guida" oppure da un link diretto (#/guida).
 * Alla chiusura l'indirizzo torna a quello della pagina (`restoreHash`), senza aggiungere voci alla cronologia.
 */
export function useGuide(own: GuideId) {
  const [open, setOpen] = useState(() => {
    const fromLink = isGuideHash(location.hash)
    if (fromLink) markGuideSeen(own)
    return fromLink
  })
  useEffect(() => {
    const on = () => { if (isGuideHash(location.hash)) { markGuideSeen(own); setOpen(true) } }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [own])
  const show = useCallback(() => { markGuideSeen(own); setOpen(true) }, [own])
  const close = useCallback((restoreHash: string) => {
    setOpen(false)
    if (isGuideHash(location.hash)) history.replaceState(null, '', restoreHash)
  }, [])
  return { open, show, close }
}
