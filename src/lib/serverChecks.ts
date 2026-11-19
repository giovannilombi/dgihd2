import { useEffect, useRef, useState } from 'react'
import { RULE_MESSAGES, type RuleId, type Violation } from './rules'
import { needsServerChecks, type ServerChecks } from './salaryChecks'
import { callFunction } from './supabase'
import type { AppData } from './store'
import type { SyncStatus } from './useRemoteData'

export type { ServerChecks }
export { needsServerChecks }

export type ServerChecksState = 'off' | 'loading' | 'ok' | 'error'

/** Messaggi generici: nessuna informazione su ore o importi. */
const toViolations = (rules: RuleId[] | undefined): Violation[] => (rules ?? []).map((rule) => ({ rule, message: RULE_MESSAGES[rule] }))

/** Aggiunge le violazioni calcolate dal server a quelle calcolate in pagina (senza duplicati). */
export function mergeViolations(local: Violation[], rules: RuleId[] | undefined): Violation[] {
  const extra = toViolations(rules).filter((v) => !local.some((x) => x.rule === v.rule))
  return extra.length ? [...local, ...extra] : local
}

export function mergeConflicts(local: Record<string, Violation[]>, server: ServerChecks | null): Record<string, Violation[]> {
  if (!server) return local
  const out = { ...local }
  for (const [sid, rules] of Object.entries(server.conflicts)) out[sid] = mergeViolations(out[sid] ?? [], rules)
  return out
}

/**
 * Chiede al server i vincoli economici delle persone con RAL non visibile, dopo ogni modifica
 * salvata (il server legge i dati dal database). Attivo solo se esistono persone di questo tipo.
 */
export function useServerChecks(data: AppData, status: SyncStatus, enabled: boolean) {
  const [checks, setChecks] = useState<ServerChecks | null>(null)
  const [state, setState] = useState<ServerChecksState>('off')
  const seq = useRef(0)
  // persone di altri team in rotazione, o con RAL Q/ (vincoli e importi calcolati dal server)
  const active = enabled && data.people.some((p) => (p.salaryHidden && p.active) || p.ralNd)

  useEffect(() => {
    if (!active || status !== 'synced') return
    const id = ++seq.current
    const timer = setTimeout(async () => {
      setState((s) => (s === 'ok' ? s : 'loading'))
      try {
        const res = await callFunction<ServerChecks>('planner', { action: 'violations' })
        if (id === seq.current) { setChecks(res); setState('ok') }
      } catch {
        if (id === seq.current) setState('error')
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [active, status, data.people, data.assignments, data.params])

  return active ? { checks, state } : { checks: null, state: 'off' as const }
}
