import { TEAM_LABEL, type UserTeam } from './types'

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
  /** Visibilità del Turnista quando l'impostazione generale è "per persona". */
  turnista_view?: 'own' | 'all'
}

/** Ordine dei livelli dal più ampio al più ristretto (per ordinare l'elenco utenti). */
export const roleRank = (r: Role) => { const i = ROLES.indexOf(r); return i < 0 ? ROLES.length : i }

export interface RoleAccess {
  /** Cosa vede e può fare, in frasi brevi. */
  sees: string[]
  /** Cosa resta escluso. */
  excluded: string[]
  /** Perimetro delle RAL visibili: tutti i team, quello dell'utente, nessuno. */
  ral: 'all' | 'team' | 'none'
  /** Frase sulle RAL, da evidenziare nella conferma. */
  ralText: string
  /** Gestisce gli utenti (e quindi può darsi qualsiasi visibilità). */
  managesUsers: boolean
}

/**
 * Cosa vede un utente con questo livello e questo team: le stesse regole del database
 * (RAL e livello solo per chi legge l'anagrafica completa, e solo del proprio team; HR e Governance tutti).
 */
export function roleAccess(role: Role, team: UserTeam | null, turnistaNames: 'all' | 'own' = 'all'): RoleAccess {
  const readsFull = canReadFull(role)
  const ral: RoleAccess['ral'] = !readsFull ? 'none' : team === 'hr' || team === 'governance' ? 'all' : team ? 'team' : 'none'
  const teamName = team ? TEAM_LABEL[team] : ''
  const ralText = !readsFull ? 'Nessuna RAL né livello, qualunque sia il team.'
    : ral === 'all' ? `RAL e livello di TUTTE le risorse di tutti i team (team ${teamName}).`
    : ral === 'team' ? `RAL e livello delle sole risorse del team ${teamName}.`
    : 'Nessuna RAL né livello: senza team non ne vede nessuna.'
  const fullRead = [
    'Tutte le pagine del piano: approccio, parametri, anagrafica, calendario, consuntivo e conto economico.',
    'Anagrafica di tutte le persone: nomi, email, ferie, disponibilità e turni assegnati.',
    'Consuntivo e conto economico con gli importi delle sole risorse di cui vede la RAL.',
  ]
  switch (role) {
    case 'super_admin':
      return {
        sees: [...fullRead, 'Modifica anagrafica, parametri e calendario.', 'Gestione utenti: crea account, cambia livelli e team, reimposta password.'],
        excluded: [], ral, ralText, managesUsers: true,
      }
    case 'editor':
      return {
        sees: [...fullRead, 'Modifica anagrafica, parametri e calendario.'],
        excluded: ['Gestione utenti.'], ral, ralText, managesUsers: false,
      }
    case 'viewer_plus':
      return {
        sees: [...fullRead, 'Nell\'anagrafica RAL e livello in chiaro solo dopo aver reinserito la propria password.'],
        excluded: ['Non modifica nulla.', 'Gestione utenti.'], ral, ralText, managesUsers: false,
      }
    case 'viewer':
      return {
        sees: ['Solo il calendario dei turni, con i nomi di chi copre ogni turno.'],
        excluded: ['RAL, livelli, email, ferie e disponibilità.', 'Parametri, consuntivo e conto economico.', 'Non modifica nulla.'],
        ral, ralText, managesUsers: false,
      }
    case 'turnista':
      return {
        sees: [
          'Solo il calendario dei turni, con i propri turni evidenziati e l\'elenco "I miei turni".',
          turnistaNames === 'own' ? 'Dei turni degli altri vede solo "Turno coperto", senza nomi.' : 'Vede anche i nomi di chi copre gli altri turni (impostazione attuale per tutti i Turnisti).',
        ],
        excluded: ['RAL, livelli, email, ferie e disponibilità.', 'Anagrafica, parametri, consuntivo e conto economico.', 'Non modifica nulla.'],
        ral, ralText, managesUsers: false,
      }
  }
}
