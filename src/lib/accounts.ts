import type { Role } from './roles'
import { adminCall } from './supabase'
import type { Person } from './types'

/** Account come lo restituisce la funzione "admin-users" (solo allo space admin). */
export interface AccountInfo {
  id: string
  email: string
  display_name: string
  role: Role
  team: string | null
  person_id?: string | null
  turnista_view?: 'own' | 'all'
  must_change_password: boolean
  created_at: string
  last_sign_in_at: string | null
}

/** Account di una risorsa: quello collegato esplicitamente, altrimenti quello con la stessa email. */
export function accountFor(p: Person, accounts: AccountInfo[]): AccountInfo | undefined {
  const linked = accounts.find((a) => a.person_id === p.id)
  if (linked) return linked
  const email = p.email?.toLowerCase()
  return email ? accounts.find((a) => a.email.toLowerCase() === email) : undefined
}

/** Si può creare l'account Turnista: la risorsa ha l'email e non ha ancora un account. */
export const canCreateAccount = (p: Person, accounts: AccountInfo[]) => !!p.email && !accountFor(p, accounts)

export interface Credential { name: string; email: string; password: string }

/** Crea l'account Turnista della risorsa, già collegato alla sua scheda; restituisce la password temporanea. */
export async function createTurnistaAccount(p: Person): Promise<Credential> {
  if (!p.email) throw new Error(`${p.name}: manca l'email`)
  const r = await adminCall<{ temp_password: string }>({ action: 'create', email: p.email, display_name: p.name, role: 'turnista', team: p.team ?? null, person_id: p.id })
  return { name: p.name, email: p.email, password: r.temp_password }
}

/**
 * Crea gli account uno dopo l'altro: un errore su una persona non ferma le altre.
 * Restituisce le password create e gli errori, nell'ordine.
 */
export async function createTurnistaAccounts(people: Person[], create = createTurnistaAccount) {
  const created: Credential[] = []
  const errors: string[] = []
  for (const p of people) {
    try { created.push(await create(p)) } catch (e) { errors.push(`${p.name}: ${(e as Error).message}`) }
  }
  return { created, errors }
}
