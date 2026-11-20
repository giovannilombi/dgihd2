import { TeamsContext, useTeamsData } from '../lib/useTeams'

/** Rende disponibile a tutta l'app l'elenco dei team letto dal database. */
export function TeamsProvider({ children }: { children: React.ReactNode }) {
  const value = useTeamsData(true)
  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>
}
