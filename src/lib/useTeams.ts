import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DEFAULT_TEAMS, type TeamDir } from './teams'
import { loadTeams } from './teamsApi'

/** Elenco dei team dal database, aggiornato in tempo reale. */
export function useTeamsData(enabled: boolean) {
  const [teams, setTeams] = useState<TeamDir>(DEFAULT_TEAMS)
  const reload = useCallback(async () => {
    try { setTeams(await loadTeams()) } catch { /* resta l'ultimo elenco noto */ }
  }, [])
  useEffect(() => {
    if (!enabled) return
    void Promise.resolve().then(reload)
    const ch = supabase.channel('teams').on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => void reload()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [enabled, reload])
  return { teams, reload }
}

export const TeamsContext = createContext<{ teams: TeamDir; reload: () => Promise<void> }>({ teams: DEFAULT_TEAMS, reload: async () => {} })
/** Team correnti (nome e ordine). */
export const useTeams = () => useContext(TeamsContext).teams
/** Ricarica l'elenco dopo una modifica (oltre all'aggiornamento in tempo reale). */
export const useReloadTeams = () => useContext(TeamsContext).reload
