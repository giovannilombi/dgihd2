import { useCallback, useEffect, useRef, useState } from 'react'
import { diff, isEmpty, loadAll, persist, replaceAll, subscribe } from './remote'
import { canSeeSalaryOf, type Me } from './roles'
import { defaultData, type AppData } from './store'

export type SyncStatus = 'loading' | 'synced' | 'saving' | 'error'

/**
 * Dati condivisi su Supabase: le modifiche si applicano subito in pagina e vengono salvate
 * in coda; le modifiche degli altri utenti arrivano in tempo reale.
 */
export function useRemoteData(readFull: boolean, editable: boolean, readParams = readFull, salaryMe?: Pick<Me, 'role' | 'team' | 'full'>) {
  const salaryRole = salaryMe?.full ? salaryMe.role : null
  const salaryTeam = salaryMe?.team ?? null
  const [data, setLocal] = useState<AppData>(defaultData)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const current = useRef<AppData>(data)
  const confirmed = useRef<AppData>(data) // ultimo stato allineato al database
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)
  const lastLocalEdit = useRef(0)

  const reload = useCallback(async () => {
    try {
      const salaryOf = salaryRole ? (team: string | null) => canSeeSalaryOf({ role: salaryRole, team: salaryTeam, full: true }, team) : undefined
      const fresh = await loadAll(readFull, readParams, salaryOf)
      current.current = fresh
      confirmed.current = fresh
      setLocal(fresh)
      setStatus('synced')
      setError(null)
    } catch (e) {
      setStatus('error')
      setError(`Impossibile leggere i dati: ${(e as Error).message}`)
    }
  }, [readFull, readParams, salaryRole, salaryTeam])

  useEffect(() => {
    void Promise.resolve().then(reload)
    let timer: ReturnType<typeof setTimeout> | undefined
    // Modifiche di altri utenti: ricarica, ma mai durante i propri salvataggi o mentre si sta
    // modificando (le notifiche arrivano anche per le proprie scritture e sovrascriverebbero il campo).
    const schedule = (delay: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const quiet = Date.now() - lastLocalEdit.current > 2000
        const editingField = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
        if (pending.current === 0 && quiet && !editingField) void reload()
        else schedule(1000)
      }, delay)
    }
    const off = subscribe(() => schedule(400))
    return () => { off(); clearTimeout(timer) }
  }, [reload])

  const setData = useCallback((fn: AppData | ((d: AppData) => AppData)) => {
    if (!editable) return
    const next = typeof fn === 'function' ? fn(current.current) : fn
    // un blocco esiste solo su uno slot assegnato
    const fixed = { ...next, pinned: next.pinned.filter((id) => next.assignments[id]) }
    lastLocalEdit.current = Date.now()
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

  /** Attende che tutte le modifiche in coda siano salvate (prima di un calcolo sul server). */
  const flush = useCallback(async () => {
    await queue.current
    if (pending.current > 0) await queue.current
  }, [])

  return { data, setData, replace, status, error, reload, flush }
}
