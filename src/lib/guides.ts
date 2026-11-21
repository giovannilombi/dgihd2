import type { Role } from './roles'
import type { Params } from './types'

/** Una guida per ogni profilo: l'id coincide con il profilo. */
export type GuideId = Role

/** Ordine nel selettore dello Space admin: dal profilo più ampio al più ristretto. */
export const GUIDE_IDS: GuideId[] = ['super_admin', 'governance', 'director', 'hr', 'pm', 'viewer', 'turnista']

export const GUIDE_LABEL: Record<GuideId, string> = {
  super_admin: 'Guida Space admin',
  governance: 'Guida Governance',
  director: 'Guida Director',
  hr: 'Guida HR',
  pm: 'Guida PM',
  viewer: 'Guida Viewer',
  turnista: 'Guida turnisti',
}

export const isGuideId = (x: unknown): x is GuideId => GUIDE_IDS.includes(x as GuideId)

/** Titolo e sottotitolo nell'intestazione della guida. */
export const GUIDE_TITLE: Record<GuideId, [string, string]> = {
  super_admin: ['Amministrare lo spazio', 'Account, profili, accesso alle RAL e team. Da qui leggi anche le guide di tutti gli altri profili.'],
  governance: ['Governare il piano di tutti i team', 'Calendario, anagrafica e parametri di tutti i team, conferma dei turni e controllo degli interventi.'],
  director: ['Gestire i turni del tuo team', 'Preparare il team, costruire il calendario, confermare i turni svolti e approvare gli interventi.'],
  hr: ['Monitorare ed esportare per le paghe', "Dove controllare l'andamento, come leggere il consuntivo, chiudere il mese ed esportare i file."],
  pm: ['Approvare gli interventi', 'Cosa vedi, come approvare o rifiutare gli interventi di tutti i team e come leggere il calendario.'],
  viewer: ['Consultare il calendario', 'Cosa vedi e come leggere ed esportare il calendario dei turni.'],
  turnista: ['Come funziona la reperibilità', 'Cosa fare a fine turno, come vengono approvati gli interventi e come vieni pagato.'],
}

/**
 * Valori delle regole mostrati negli esempi. `exact` è vero quando arrivano dai parametri del piano;
 * il Turnista riceve solo ore minime e tolleranza, quindi la guida non cita importi né orari delle fasce.
 */
export interface GuideCtx {
  p: Pick<Params, 'otMinHours' | 'otToleranceMin' | 'otNightStart' | 'otNightEnd' | 'callFee'>
  exact: boolean
}

/** Link diretto: "#/guida" apre la guida del proprio profilo, "#/guida/hr" quella indicata. */
export const guideHash = (id?: GuideId) => (id ? `#/guida/${id}` : '#/guida')
export const isGuideHash = (hash: string) => /^#\/?guida(\/|$)/.test(hash)

/** Guida richiesta dall'indirizzo, se c'è; un id sconosciuto apre quella del proprio profilo. */
export function readGuideHash(hash: string, own: GuideId): GuideId | null {
  const m = /^#\/?guida(?:\/([a-z_]*))?\/?$/.exec(hash)
  if (!m) return null
  return isGuideId(m[1]) ? m[1] : own
}

/**
 * Guida già aperta su questo dispositivo: finché non lo è, il pulsante ha il puntino che pulsa.
 * Se il browser non consente la memoria locale vale per la sola sessione.
 */
const SEEN_KEY = 'reperibilita:guida-vista:'
const seenInSession = new Set<string>()
export function guideSeen(id: GuideId): boolean {
  if (seenInSession.has(id)) return true
  try { return localStorage.getItem(SEEN_KEY + id) === '1' } catch { return false }
}
export function markGuideSeen(id: GuideId) {
  seenInSession.add(id)
  try { localStorage.setItem(SEEN_KEY + id, '1') } catch { /* solo per la sessione */ }
}

/** Riquadro "Come funziona, in 3 passi" del Turnista: chiuso una volta, resta chiuso su questo dispositivo. */
const INTRO_KEY = 'reperibilita:guida-intro-chiusa'
let introClosedInSession = false
export function introClosed(): boolean {
  if (introClosedInSession) return true
  try { return localStorage.getItem(INTRO_KEY) === '1' } catch { return false }
}
export function setIntroClosed(closed: boolean) {
  introClosedInSession = closed
  try { if (closed) localStorage.setItem(INTRO_KEY, '1'); else localStorage.removeItem(INTRO_KEY) } catch { /* solo per la sessione */ }
}

/**
 * Colore della guida: uno per profilo, usato solo per il pulsante, l'intestazione e i numeri delle sezioni
 * (il resto della guida è neutro). Classi scritte per intero perché Tailwind le trovi.
 */
export interface GuideTone {
  /** Pulsante nell'intestazione dell'app */
  pill: string
  /** Puntino "nuova" e il suo alone */
  dot: string
  ping: string
  /** Icona dell'intestazione, numeri delle sezioni, voce attiva dell'indice */
  solid: string
  /** Testo d'accento (sopratitolo) */
  text: string
}

export const GUIDE_TONE: Record<GuideId, GuideTone> = {
  turnista: { pill: 'bg-orange-50 text-orange-800 ring-orange-300 hover:bg-orange-100', dot: 'bg-orange-500', ping: 'bg-orange-400', solid: 'bg-orange-600 text-white', text: 'text-orange-700' },
  director: { pill: 'bg-blue-50 text-blue-800 ring-blue-300 hover:bg-blue-100', dot: 'bg-blue-600', ping: 'bg-blue-400', solid: 'bg-blue-700 text-white', text: 'text-blue-700' },
  governance: { pill: 'bg-indigo-50 text-indigo-800 ring-indigo-300 hover:bg-indigo-100', dot: 'bg-indigo-600', ping: 'bg-indigo-400', solid: 'bg-indigo-700 text-white', text: 'text-indigo-700' },
  hr: { pill: 'bg-violet-50 text-violet-800 ring-violet-300 hover:bg-violet-100', dot: 'bg-violet-600', ping: 'bg-violet-400', solid: 'bg-violet-700 text-white', text: 'text-violet-700' },
  pm: { pill: 'bg-teal-50 text-teal-800 ring-teal-300 hover:bg-teal-100', dot: 'bg-teal-600', ping: 'bg-teal-400', solid: 'bg-teal-700 text-white', text: 'text-teal-700' },
  viewer: { pill: 'bg-slate-50 text-slate-700 ring-slate-300 hover:bg-slate-100', dot: 'bg-slate-600', ping: 'bg-slate-400', solid: 'bg-slate-700 text-white', text: 'text-slate-600' },
  super_admin: { pill: 'bg-slate-900 text-white ring-slate-900 hover:bg-slate-800', dot: 'bg-amber-400', ping: 'bg-amber-300', solid: 'bg-slate-900 text-white', text: 'text-slate-700' },
}
