import { teamLabel, type TeamDir, type TeamId } from './teams'

/**
 * Profili degli account (uno per account; il team indica solo l'appartenenza):
 * - Space admin: unico; tutto, utenti compresi
 * - Governance: modifica tutto, vede RAL e importi di tutti
 * - Director: modifica il piano; RAL e importi solo del proprio team; approva gli interventi del proprio team
 * - HR: sola lettura, RAL e importi di tutti; consuntiva ed esporta le paghe
 * - PM: Approccio, calendario e interventi (solo ore, nessuna RAL); approva gli interventi di tutti i team
 * - Viewer: solo calendario
 * - Turnista: calendario e i propri interventi
 */
export type Role = 'super_admin' | 'governance' | 'director' | 'hr' | 'pm' | 'viewer' | 'turnista'

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Space admin',
  governance: 'Governance',
  director: 'Director',
  hr: 'HR',
  pm: 'PM',
  viewer: 'Viewer',
  turnista: 'Turnista',
}

export const ROLE_HELP: Record<Role, string> = {
  super_admin: 'Unico: legge e modifica tutto, gestisce utenti e team; può essere a capo di un team',
  governance: 'Modifica tutto il piano; se abilitato, vede RAL e importi di tutti i team',
  director: 'Capo del proprio team (uno per team): modifica il piano; se abilitato, RAL e importi solo del team; approva gli interventi del team',
  hr: 'Sola lettura; se abilitato, vede RAL e importi di tutti; consuntiva ed esporta le paghe',
  pm: 'Approccio, calendario e interventi (solo ore, nessuna RAL); approva gli interventi di tutti i team',
  viewer: 'Vede solo il calendario dei turni',
  turnista: 'Vede il calendario e dichiara i propri interventi',
}
/** Descrizioni senza RAL e importi: per chi non ha la vista completa. */
const ROLE_HELP_BASE: Record<Role, string> = {
  ...ROLE_HELP,
  governance: 'Modifica tutto il piano, team delle risorse compreso',
  director: 'Capo del proprio team (uno per team): modifica il piano e approva gli interventi del team',
  hr: 'Sola lettura; consuntiva i mesi ed esporta il riepilogo per le paghe',
  pm: 'Approccio, calendario e interventi (solo ore); approva gli interventi di tutti i team',
}
/** Descrizione breve del profilo; con `full` falso non parla di RAL e importi. */
export const roleHelp = (r: Role, full: boolean) => (full ? ROLE_HELP : ROLE_HELP_BASE)[r]

export const ROLES: Role[] = ['super_admin', 'governance', 'director', 'hr', 'pm', 'viewer', 'turnista']
/** Profili assegnabili dalla pagina Utenti: lo Space admin è uno solo e non si assegna. */
export const ASSIGNABLE_ROLES: Role[] = ROLES.filter((r) => r !== 'super_admin')
export const isRole = (r: unknown): r is Role => ROLES.includes(r as Role)

/**
 * Livello come lo usa l'app. Converte anche i livelli della versione precedente (Full edit, Viewer esteso),
 * nel caso la pagina incontri un account non ancora migrato.
 */
export function normalizeRole(raw: unknown, team: TeamId | null | undefined): Role | null {
  if (isRole(raw)) return raw
  if (raw === 'editor') return team === 'governance' ? 'governance' : 'director'
  if (raw === 'viewer_plus') return team === 'hr' ? 'hr' : 'pm'
  return null
}

/** Modifica anagrafica, parametri e calendario */
export const canEdit = (r: Role) => r === 'super_admin' || r === 'governance' || r === 'director'
/** Legge anagrafica completa, parametri, consuntivo e conto economico */
export const canReadFull = (r: Role) => canEdit(r) || r === 'hr'
/** Legge Approccio (parametri applicati) e interventi di tutti */
export const canReadPlan = (r: Role) => canReadFull(r) || r === 'pm'
export const canManageUsers = (r: Role) => r === 'super_admin'
/** Vede RAL, livello e importi di tutti i team */
export const seesAllSalaries = (r: Role) => r === 'super_admin' || r === 'governance' || r === 'hr'

export interface Me {
  id: string
  role: Role
  team: TeamId | null
  /** Vista completa attiva (vedi `fullViewOn`): senza, nessuna RAL, livello o importo. */
  full?: boolean
}
/**
 * Stessa regola del database: con la vista completa attiva, tutti per Space admin, Governance e HR;
 * il Director solo il proprio team. Senza vista completa, nessuno.
 */
export const canSeeSalaryOf = (me: Pick<Me, 'role' | 'team' | 'full'>, personTeam: TeamId | null | undefined) =>
  !!me.full && (seesAllSalaries(me.role) || (me.role === 'director' && !!me.team && me.team === personTeam))
/** Capo del team: il suo Director (uno solo per team) o lo Space admin assegnato a quel team. Stessa regola del database. */
export const isDirectorOf = (team: TeamId | null | undefined, me: Pick<Me, 'role' | 'team'>) =>
  !!team && (me.role === 'director' || me.role === 'super_admin') && me.team === team

export interface Profile {
  id: string
  email: string
  display_name: string
  role: Role
  must_change_password: boolean
  team: TeamId | null
  /** Risorsa del Team collegata all'account (serve al Turnista per riconoscere i propri turni). */
  person_id?: string | null
  /** Visibilità del Turnista quando l'impostazione generale è "per persona". */
  turnista_view?: 'own' | 'all'
  /** Director: riepilogo di tutti i team invece del solo proprio (deciso dallo Space admin). */
  summary_all?: boolean
  /** Abilitato dallo Space admin alla vista completa (Governance, Director, HR). */
  full_view_allowed?: boolean
  /** Vista completa attivata dall'account stesso. */
  full_view?: boolean
}

/**
 * Team a cui è limitato il Riepilogo: il Director vede solo il proprio, salvo abilitazione dello Space admin.
 * undefined = nessun limite; null = Director senza team (nessuna persona).
 */
export const summaryTeamLock = (p: Pick<Profile, 'role' | 'team' | 'summary_all'>): TeamId | null | undefined =>
  p.role === 'director' && !p.summary_all ? p.team : undefined

/** Profili che lo Space admin può abilitare alla vista completa. */
export const FULL_VIEW_ROLES: readonly Role[] = ['governance', 'director', 'hr']
/** Può attivare la vista completa: lo Space admin sempre, gli altri profili se abilitati. Stessa regola del database. */
export const fullViewEligible = (p: Pick<Profile, 'role' | 'full_view_allowed'>) =>
  p.role === 'super_admin' || (FULL_VIEW_ROLES.includes(p.role) && !!p.full_view_allowed)
/** Vista completa attiva: RAL, livelli, importi, consuntivo e conto economico. */
export const fullViewOn = (p: Pick<Profile, 'role' | 'full_view_allowed' | 'full_view'>) => fullViewEligible(p) && !!p.full_view

/** Ordine dei profili dal più ampio al più ristretto (per ordinare l'elenco utenti). */
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
 * Cosa vede un account con questo profilo e questo team: le stesse regole del database.
 * `full`: l'account può avere la vista completa (Space admin, o abilitato); senza, nessuna RAL e niente
 * consuntivo e conto economico.
 */
export function roleAccess(role: Role, team: TeamId | null, teams: TeamDir, turnistaNames: 'all' | 'own' = 'all', full = true): RoleAccess {
  const ral: RoleAccess['ral'] = !full ? 'none' : seesAllSalaries(role) ? 'all' : role === 'director' && team ? 'team' : 'none'
  const teamName = teamLabel(teams, team)
  const ralText = ral === 'all' ? 'RAL, livelli e importi di TUTTE le risorse di tutti i team.'
    : ral === 'team' ? `RAL, livelli e importi delle sole risorse del team ${teamName}.`
    : role === 'director' ? 'Nessuna RAL: senza team il Director non ne vede nessuna.'
    : 'Nessuna RAL, livello o importo.'
  const fullRead = [
    full ? 'Tutte le pagine del piano: approccio, parametri, anagrafica, calendario, interventi, riepilogo, consuntivo e conto economico.'
      : 'Tutte le pagine del piano: approccio, parametri, anagrafica, calendario, interventi e riepilogo.',
    'Anagrafica di tutte le persone: nomi, email, ferie, disponibilità e turni assegnati.',
  ]
  switch (role) {
    case 'super_admin':
      return { sees: [...fullRead, 'Modifica tutto; gestisce utenti e team.', ...(team ? [`A capo del team ${teamName}: ne approva gli interventi e sblocca i giorni dei turni.`] : [])], excluded: [], ral, ralText, managesUsers: true }
    case 'governance':
      return { sees: [...fullRead, 'Modifica anagrafica (team delle risorse compreso), parametri e calendario; segna gli erogati.'], excluded: ['Gestione utenti.'], ral, ralText, managesUsers: false }
    case 'director':
      return {
        sees: [...fullRead, 'Modifica anagrafica, parametri e calendario; segna gli erogati.', `Approva e rifiuta gli interventi${team ? ` del team ${teamName}` : ' del proprio team'}; sblocca i giorni dei turni del team.`],
        excluded: [...(full ? ['RAL e importi degli altri team.'] : []), 'Gestione utenti.'], ral, ralText, managesUsers: false,
      }
    case 'hr':
      return { sees: [...fullRead, 'Consuntiva i giorni e i mesi; esporta per le paghe.'], excluded: ['Non modifica il piano.', 'Gestione utenti.'], ral, ralText, managesUsers: false }
    case 'pm':
      return {
        sees: ['Approccio (con i valori dei parametri applicati), calendario e interventi con le ore.', 'Approva e rifiuta gli interventi di tutti i team.'],
        excluded: [...(full ? ['RAL, livelli e importi.'] : []), `Pagina Parametri, anagrafica, riepilogo${full ? ', consuntivo e conto economico' : ''}.`, 'Non modifica il piano.'],
        ral, ralText, managesUsers: false,
      }
    case 'viewer':
      return {
        sees: ['Solo il calendario dei turni, con i nomi di chi copre ogni turno.'],
        excluded: [full ? 'RAL, livelli, email, ferie e disponibilità.' : 'Email, ferie e disponibilità.', `Parametri, interventi, riepilogo${full ? ', consuntivo e conto economico' : ''}.`, 'Non modifica nulla.'],
        ral, ralText, managesUsers: false,
      }
    case 'turnista':
      return {
        sees: [
          'Solo il calendario dei turni, con i propri turni evidenziati, e la pagina "I miei interventi".',
          turnistaNames === 'own' ? 'Dei turni degli altri vede solo "Turno coperto", senza nomi.' : 'Vede anche i nomi di chi copre gli altri turni (impostazione attuale per tutti i Turnisti).',
        ],
        excluded: [full ? 'RAL, livelli, email, ferie e disponibilità.' : 'Email, ferie e disponibilità.', `Anagrafica, parametri, riepilogo${full ? ', consuntivo e conto economico' : ''}.`, 'Non modifica il piano.'],
        ral, ralText, managesUsers: false,
      }
  }
}
