import { useCallback, useEffect, useState } from 'react'
import type { AccountInfo } from './accounts'
import { adminCall } from './supabase'

/** Elenco degli account (solo per lo space admin: per gli altri resta vuoto e non chiama il server). */
export function useAccounts(enabled: boolean) {
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(async () => {
    if (!enabled) return
    try {
      const r = await adminCall<{ users: AccountInfo[] }>({ action: 'list' })
      setAccounts(r.users)
      setLoaded(true)
      setError('')
    } catch (e) {
      setError(`Elenco account non disponibile: ${(e as Error).message}`)
    }
  }, [enabled])
  useEffect(() => { void Promise.resolve().then(reload) }, [reload])
  return { accounts, loaded, error, reload }
}
