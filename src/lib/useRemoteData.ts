import { useCallback, useEffect, useRef, useState } from 'react'
import { diff, isEmpty, loadAll, persist, replaceAll, subscribe } from './remote'
import { defaultData, type AppData } from './store'

export type SyncStatus = 'loading' | 'synced' | 'saving' | 'error'

/**
 * Dati condivisi su Supabase: le modifiche si applicano subito in pagina e vengono salvate
 * in coda; le modifiche degli altri utenti arrivano in tempo reale.
 */
export function useRemoteData(readFull: boolean, editable: boolean) {
  const [data, setLocal] = useState<AppData>(defaultData)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const current = useRef<AppData>(data)
  const confirmed = useRef<AppData>(data) // ultimo stato allineato al database
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)

  const reload = useCallback(async () => {
    try {
      const fresh = await loadAll(readFull)
      current.current = fresh
      confirmed.current = fresh
      setLocal(fresh)
      setStatus('synced')
      setError(null)
    } catch (e) {
      setStatus('error')
      setError(`Impossibile leggere i dati: ${(e as Error).message}`)
    }
  }, [readFull])

  useEffect(() => {
    void Promise.resolve().then(reload)
    let timer: ReturnType<typeof setTimeout> | undefined
    // modifiche di altri utenti: ricarica (non durante i propri salvataggi)
    const off = subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => { if (pending.current === 0) void reload() }, 400)
    })
    return () => { off(); clearTimeout(timer) }
  }, [reload])

  const setData = useCallback((fn: AppData | ((d: AppData) => AppData)) => {
    if (!editable) return
    const next = typeof fn === 'function' ? fn(current.current) : fn
    // un blocco esiste solo su uno slot assegnato
    const fixed = { ...next, pinned: next.pinned.filter((id) => next.assignments[id]) }
    current.current = fixed
    setLocal(fixed)
    pending.current++
    setStatus('saving')
    queue.current = queue.current.then(async () => {
      const ops = diff(confirmed.current, fixed)
      try {
        if (!isEmpty(ops)) await persist(ops)
        confirmed.current = fixed
        if (--pending.current === 0) setStatus('synced')
      } catch (e) {
        pending.current--
        setStatus('error')
        setError(`Salvataggio non riuscito: ${(e as Error).message}. I dati sono stati ricaricati dal database.`)
        await reload()
      }
    })
  }, [editable, reload])

  /** Import di una configurazione completa: sostituisce i dati condivisi. */
  const replace = useCallback(async (next: AppData) => {
    setStatus('saving')
    await queue.current
    try {
      await replaceAll(next, confirmed.current)
    } finally {
      await reload()
    }
  }, [reload])

  return { data, setData, replace, status, error, reload }
}
