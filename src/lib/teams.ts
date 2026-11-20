/**
 * Team di risorse e account. Li gestisce il super admin (tabella `teams` del database): nome,
 * director e se il team "vede tutto" (RAL e importi di tutti i team, es. HR e Governance).
 * Logica pura, usata anche dalla funzione server `planner`.
 */
export type TeamId = string

export interface Team {
  id: TeamId
  label: string
  /** Vede RAL, livello e importi di tutti i team. */
  seesAll: boolean
  /** Account director del team: approva gli interventi, segna gli erogati, vede gli importi del team. */
  directorId: string | null
  sort: number
}

/** Elenco dei team ordinato e indicizzato. */
export interface TeamDir {
  list: Team[]
  byId: Readonly<Record<TeamId, Team>>
}

export interface TeamRow { id: string; label: string; sees_all: boolean; director_id: string | null; sort: number }
export const rowToTeam = (r: TeamRow): Team => ({ id: r.id, label: r.label, seesAll: !!r.sees_all, directorId: r.director_id ?? null, sort: Number(r.sort) || 0 })

export function teamDir(list: Team[]): TeamDir {
  const sorted = [...list].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
  return { list: sorted, byId: Object.fromEntries(sorted.map((t) => [t.id, t])) }
}

/** Team iniziali (prima che arrivi l'elenco dal database e nei test): HR e Governance vedono tutto. */
export const DEFAULT_TEAMS: TeamDir = teamDir([
  { id: 'tech', label: 'Tech', seesAll: false, directorId: null, sort: 10 },
  { id: 'design', label: 'Design', seesAll: false, directorId: null, sort: 20 },
  { id: 'pm', label: 'PM', seesAll: false, directorId: null, sort: 30 },
  { id: 'director', label: 'Director', seesAll: false, directorId: null, sort: 40 },
  { id: 'hr', label: 'HR', seesAll: true, directorId: null, sort: 50 },
  { id: 'governance', label: 'Governance', seesAll: true, directorId: null, sort: 60 },
])

/** Stesso formato del vincolo del database. */
export const isTeamId = (v: unknown): v is TeamId => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(v)

export const teamLabel = (dir: TeamDir, id: TeamId | null | undefined) => (id ? dir.byId[id]?.label ?? id : '')

/** Il team vede RAL, livello e importi di tutti i team. */
export const seesAllSalaries = (dir: TeamDir, team: TeamId | null | undefined) => !!team && !!dir.byId[team]?.seesAll

/** Stessa regola della RLS: RAL e livello visibili a chi "vede tutto" o a chi è dello stesso team della risorsa. */
export const canSeeSalaryOf = (dir: TeamDir, myTeam: TeamId | null | undefined, personTeam: TeamId | null | undefined) =>
  seesAllSalaries(dir, myTeam) || (!!myTeam && myTeam === personTeam)

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
