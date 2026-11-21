import { supabase } from './supabase'
import { rowToTeam, teamDir, teamSlug, type TeamDir, type TeamId, type TeamRow } from './teams'

export async function loadTeams(): Promise<TeamDir> {
  const { data, error } = await supabase.from('teams').select('id, label, sort')
  if (error) throw new Error(error.message)
  return teamDir(((data ?? []) as TeamRow[]).map(rowToTeam))
}

/** Messaggi leggibili per gli errori del database sui team. */
function teamError(message: string): Error {
  if (/foreign key/i.test(message)) return new Error('Il team è ancora usato da risorse o account: spostali prima in un altro team.')
  if (/teams_label_key|duplicate key/i.test(message)) return new Error('Esiste già un team con questo nome.')
  return new Error(message)
}
const check = (r: { error: { message: string } | null }) => { if (r.error) throw teamError(r.error.message) }

/** Gestione dei team: le regole RLS la consentono solo allo space admin. */
export async function createTeam(label: string, dir: TeamDir): Promise<TeamId> {
  const id = teamSlug(label, dir.list.map((t) => t.id))
  const sort = Math.max(0, ...dir.list.map((t) => t.sort)) + 10
  check(await supabase.from('teams').insert({ id, label: label.trim(), sort }))
  return id
}
export async function updateTeam(id: TeamId, patch: { label: string }) {
  check(await supabase.from('teams').update(patch).eq('id', id))
}
export async function deleteTeam(id: TeamId) {
  check(await supabase.from('teams').delete().eq('id', id))
}
