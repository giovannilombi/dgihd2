import type { UserTeam } from './types'

export type Role = 'super_admin' | 'editor' | 'viewer_plus' | 'viewer' | 'turnista'

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  editor: 'Full edit',
  viewer_plus: 'Viewer esteso',
  viewer: 'Viewer',
  turnista: 'Turnista',
}

export const ROLE_HELP: Record<Role, string> = {
  super_admin: 'Legge e modifica tutto, gestisce utenti e livelli',
  editor: 'Legge e modifica tutto, senza gestione utenti',
  viewer_plus: 'Legge tutto senza modificare; RAL e livello del proprio team reinserendo la password',
  viewer: 'Vede solo il calendario dei turni',
  turnista: 'Vede solo il calendario, con i propri turni evidenziati',
}

export const ROLES: Role[] = ['super_admin', 'editor', 'viewer_plus', 'viewer', 'turnista']

export const canEdit = (r: Role) => r === 'super_admin' || r === 'editor'
export const canReadFull = (r: Role) => r === 'super_admin' || r === 'editor' || r === 'viewer_plus'
export const canManageUsers = (r: Role) => r === 'super_admin'

export interface Profile {
  id: string
  email: string
  display_name: string
  role: Role
  must_change_password: boolean
  team: UserTeam | null
  /** Risorsa del Team collegata all'account (serve al Turnista per riconoscere i propri turni). */
  person_id?: string | null
}
