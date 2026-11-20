import { ALL_SLOTS, SLOT_BY_ID } from './calendar'
import { DEFAULT_TEAM, newId, nextColor } from './team'
import { DEFAULT_PARAMS, isEmail, LEVELS, normalizeEmail, type Assignments, type Level, type Params, type Person } from './types'
import { isTeamId, type TeamId } from './teams'

export interface AppData {
  version: 1
  params: Params
  people: Person[]
  assignments: Assignments
  /** Giorni non richiesti dal cliente: esclusi da rotazione, copertura, ricavi ed export. */
  excludedDays: string[]
  /** Turni bloccati a mano: l'auto-compilazione non li modifica. */
  pinned: string[]
}

const STORAGE_KEY = 'reperibilita-q4-2026:data'

export const STORAGE_KEY_DATA = STORAGE_KEY

export const defaultData = (): AppData => ({
  version: 1,
  params: structuredClone(DEFAULT_PARAMS),
  people: structuredClone(DEFAULT_TEAM),
  assignments: {},
  excludedDays: [],
  pinned: [],
})

/**
 * Valida e ripulisce dati importati o salvati: scarta persone e assegnazioni non valide,
 * accetta solo parametri numerici. Lancia un errore se il file non è una configurazione del tool.
 */
const HORIZON_DAYS = new Set(ALL_SLOTS.map((x) => x.date))
const dateList = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && HORIZON_DAYS.has(x)))].sort() : []
/** Ferie e disponibilità valide; se una data è in entrambe vince l'indisponibilità. */
function cleanDays(unavailable: unknown, preferred: unknown): Pick<Person, 'unavailable' | 'preferredDays'> {
  const u = dateList(unavailable)
  const pr = dateList(preferred).filter((d) => !u.includes(d))
  return { ...(u.length ? { unavailable: u } : {}), ...(pr.length ? { preferredDays: pr } : {}) }
}

/**
 * `knownTeams`: team esistenti (import di un file); una risorsa con un team sconosciuto resta senza team.
 */
export function normalizeWithReport(raw: unknown, knownTeams?: ReadonlySet<TeamId>): { data: AppData; warnings: string[] } {
  const d = raw as Record<string, unknown>
  if (!d || typeof d !== 'object' || Array.isArray(d) || !Array.isArray(d.people)) {
    throw new Error('il file non è una configurazione di questo tool (manca l\'elenco "people"). Usa un file creato con "Esporta configurazione JSON".')
  }
  const warnings: string[] = []

  const people: Person[] = []
  let unknownTeam = 0
  const teamOf = (t: unknown): TeamId | null => {
    if (!isTeamId(t)) return null
    if (knownTeams && !knownTeams.has(t)) { unknownTeam++; return null }
    return t
  }
  for (const r of d.people as Record<string, unknown>[]) {
    const ok = r && typeof r === 'object' && typeof r.name === 'string' && r.name.trim() &&
      LEVELS.includes(r.level as Level) && typeof r.ral === 'number' && Number.isFinite(r.ral) && r.ral >= 0
    if (!ok) continue
    let id = typeof r.id === 'string' && r.id ? r.id : newId()
    if (people.some((x) => x.id === id)) id = newId()
    people.push({
      id,
      name: String(r.name).slice(0, 80),
      level: r.level as Level,
      ral: r.ral as number,
      active: typeof r.active === 'boolean' ? r.active : true,
      color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : nextColor(people),
      availability: r.availability === 'volontario' || r.availability === 'limitato' ? r.availability : 'nessuna',
      ...(r.availability === 'limitato' ? { maxPerMonth: [1, 2, 3].includes(r.maxPerMonth as number) ? (r.maxPerMonth as number) : 1 } : {}),
      ...cleanDays(r.unavailable, r.preferredDays),
      ...(r.ralNd === true ? { ralNd: true } : {}),
      ...(isEmail(r.email) ? { email: normalizeEmail(r.email) } : {}),
      team: teamOf(r.team),
      ...(r.salaryHidden === true ? { salaryHidden: true } : {}),
      ...(r.reserve === true ? { reserve: true, reserveOrder: Number.isInteger(r.reserveOrder) && (r.reserveOrder as number) >= 1 ? (r.reserveOrder as number) : undefined } : {}),
    })
  }
  const dropped = (d.people as unknown[]).length - people.length
  if (dropped) warnings.push(`${dropped} risorse scartate perché incomplete o non valide`)
  if (unknownTeam) warnings.push(`${unknownTeam} ${unknownTeam === 1 ? 'risorsa ha' : 'risorse hanno'} un team che non esiste più: ${unknownTeam === 1 ? 'resta' : 'restano'} senza team`)

  const params = structuredClone(DEFAULT_PARAMS)
  const rp = (d.params ?? {}) as Record<string, unknown>
  for (const k of Object.keys(params) as (keyof Params)[]) {
    if (k === 'indemnity' || k === 'indemnitySplit') continue
    const v = rp[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) (params[k] as number) = v
  }
  if (rp.indemnitySplit === 'intera' || rp.indemnitySplit === 'proquota') params.indemnitySplit = rp.indemnitySplit
  if (typeof rp.ndRal === 'number' && Number.isFinite(rp.ndRal) && rp.ndRal > 0) params.ndRal = rp.ndRal
  const ri = (rp.indemnity ?? {}) as Record<string, Record<string, unknown>>
  for (const g of ['g1', 'g2', 'g3'] as const) {
    for (const k of ['feriale', 'sabato', 'domenica'] as const) {
      const v = ri[g]?.[k]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) params.indemnity[g][k] = v
    }
  }

  const assignments: Assignments = {}
  const ids = new Set(people.map((x) => x.id))
  const ra = (d.assignments && typeof d.assignments === 'object' ? d.assignments : {}) as Record<string, unknown>
  let droppedA = 0
  for (const [sid, pid] of Object.entries(ra)) {
    if (SLOT_BY_ID[sid] && typeof pid === 'string' && ids.has(pid)) assignments[sid] = pid
    else droppedA++
  }
  if (droppedA) warnings.push(`${droppedA} turni scartati (date fuori periodo o persone inesistenti)`)

  const days = new Set(ALL_SLOTS.map((x) => x.date))
  const excludedDays = Array.isArray(d.excludedDays) ? [...new Set((d.excludedDays as unknown[]).filter((x): x is string => typeof x === 'string' && days.has(x)))].sort() : []
  for (const sid of Object.keys(assignments)) if (excludedDays.includes(SLOT_BY_ID[sid].date)) delete assignments[sid]

  const pinned = Array.isArray(d.pinned) ? [...new Set((d.pinned as unknown[]).filter((x): x is string => typeof x === 'string' && !!assignments[x]))] : []

  return { data: { version: 1, params, people: renumberReserves(people), assignments, excludedDays, pinned }, warnings }
}

export const normalize = (raw: unknown) => normalizeWithReport(raw).data

/**
 * Le versioni precedenti salvavano i dati nel browser: ora i dati stanno solo nel database condiviso.
 * Rimuove eventuali copie locali rimaste (anche con dati personali) al primo avvio.
 */
export function purgeLegacyLocalData() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem('reperibilita-q4-2026:auth')
    sessionStorage.removeItem('reperibilita-q4-2026:team')
  } catch { /* storage non disponibile */ }
}

/** Numera le riserve 1..n mantenendo l'ordine esistente (le nuove vanno in coda). */
export function renumberReserves(people: Person[]): Person[] {
  const reserves = people.filter((p) => p.reserve).sort((a, b) => (a.reserveOrder ?? Infinity) - (b.reserveOrder ?? Infinity))
  const order = new Map(reserves.map((p, i) => [p.id, i + 1]))
  return people.map((p) => (p.reserve ? { ...p, reserveOrder: order.get(p.id) } : { ...p, reserveOrder: undefined }))
}
