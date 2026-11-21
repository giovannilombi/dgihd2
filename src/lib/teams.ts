/**
 * Team di risorse e account: solo appartenenza. Li gestisce il super admin (tabella `teams`).
 * Chi vede le RAL e chi approva lo decide il profilo dell'account (vedi roles.ts).
 * Logica pura, usata anche dalla funzione server `planner`.
 */
export type TeamId = string

export interface Team {
  id: TeamId
  label: string
  sort: number
}

/** Elenco dei team ordinato e indicizzato. */
export interface TeamDir {
  list: Team[]
  byId: Readonly<Record<TeamId, Team>>
}

export interface TeamRow { id: string; label: string; sort: number }
export const rowToTeam = (r: TeamRow): Team => ({ id: r.id, label: r.label, sort: Number(r.sort) || 0 })

export function teamDir(list: Team[]): TeamDir {
  const sorted = [...list].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
  return { list: sorted, byId: Object.fromEntries(sorted.map((t) => [t.id, t])) }
}

/** Team iniziali (prima che arrivi l'elenco dal database e nei test). */
export const DEFAULT_TEAMS: TeamDir = teamDir([
  { id: 'tech', label: 'Tech', sort: 10 },
  { id: 'design', label: 'Design', sort: 20 },
  { id: 'pm', label: 'PM', sort: 30 },
  { id: 'director', label: 'Director', sort: 40 },
  { id: 'hr', label: 'HR', sort: 50 },
  { id: 'governance', label: 'Governance', sort: 60 },
])

/** Stesso formato del vincolo del database. */
export const isTeamId = (v: unknown): v is TeamId => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(v)

export const teamLabel = (dir: TeamDir, id: TeamId | null | undefined) => (id ? dir.byId[id]?.label ?? id : '')

/** Team con cui un utente crea nuove risorse: il proprio, se esiste. */
export const defaultResourceTeam = (dir: TeamDir, myTeam: TeamId | null | undefined): TeamId | null =>
  myTeam && dir.byId[myTeam] ? myTeam : null

/** Identificativo per un nuovo team, ricavato dal nome e diverso da quelli esistenti. */
export function teamSlug(label: string, taken: Iterable<TeamId>): TeamId {
  const used = new Set(taken)
  const base = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'team'
  let id = base
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`
  return id
}

/** Nome valido e non già usato (senza distinguere maiuscole). */
export function teamLabelError(label: string, dir: TeamDir, exceptId?: TeamId): string | null {
  const l = label.trim()
  if (!l) return 'Scrivi il nome del team.'
  if (l.length > 40) return 'Nome troppo lungo (massimo 40 caratteri).'
  if (dir.list.some((t) => t.id !== exceptId && t.label.trim().toLowerCase() === l.toLowerCase())) return `Esiste già un team "${l}".`
  return null
}
