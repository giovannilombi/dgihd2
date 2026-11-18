export const LEVELS = ['D1', 'D2', 'C1', 'C2', 'C3', 'B1', 'B2', 'B3', 'A1'] as const
export type Level = (typeof LEVELS)[number]

/**
 * Disponibilità dichiarata (le regole di legge valgono per tutti):
 * - volontario: nessun limite oltre ai vincoli standard (2/settimana, 4/mese)
 * - limitato: disponibile fino a `maxPerMonth` turni al mese (1–3)
 * - nessuna: non ha espresso preferenze
 * Chi ha dato KO è semplicemente `active: false` (non in rotazione).
 */
export type Availability = 'volontario' | 'limitato' | 'nessuna'

export interface Person {
  id: string
  name: string
  level: Level
  ral: number
  active: boolean
  color: string
  availability?: Availability // default 'nessuna'
  maxPerMonth?: number // solo per 'limitato'
}

export const availabilityOf = (p: Pick<Person, 'availability'>): Availability => p.availability ?? 'nessuna'
/** Tetto mensile preferito, se espresso. */
export const preferredMax = (p: Pick<Person, 'availability' | 'maxPerMonth'>) =>
  availabilityOf(p) === 'limitato' ? Math.min(3, Math.max(1, p.maxPerMonth ?? 1)) : undefined
export const availabilityLabel = (p: Pick<Person, 'availability' | 'maxPerMonth' | 'active'>) =>
  !p.active ? 'KO · non in rotazione'
    : availabilityOf(p) === 'volontario' ? 'Volontario'
    : availabilityOf(p) === 'limitato' ? `Max ${preferredMax(p)}/mese`
    : 'Nessuna preferenza'

/** FN = Notte feriale, WD = Weekend/Festivo diurno, WN = Weekend/Festivo notturno */
export type SlotKind = 'FN' | 'WD' | 'WN'

export interface Slot {
  id: string
  date: string // YYYY-MM-DD
  kind: SlotKind
}

export type Assignments = Record<string, string> // slotId -> personId

export interface IndemnityRow {
  feriale: number
  sabato: number
  domenica: number
}

export interface Params {
  revenueFeriale: number
  revenueFestivo: number
  netFN: number
  netWD: number
  netWN: number
  capHours: number
  costMultiplier: number
  kNetLow: number // RAL <= 28.000
  kNetMid: number // 28.001 – 50.000
  kNetHigh: number // > 50.000
  majDom: number // +55%
  majSab1: number // +25% prime 2h
  majSab2: number // +30% dalla 3a ora
  indemnitySplit: 'intera' | 'proquota'
  indemnity: Record<'g1' | 'g2' | 'g3', IndemnityRow>
}

export const DEFAULT_PARAMS: Params = {
  revenueFeriale: 680,
  revenueFestivo: 1080,
  netFN: 50,
  netWD: 50,
  netWN: 60,
  capHours: 8,
  costMultiplier: 1.35,
  kNetLow: 0.62,
  kNetMid: 0.54,
  kNetHigh: 0.5,
  majDom: 0.55,
  majSab1: 0.25,
  majSab2: 0.3,
  indemnitySplit: 'intera',
  indemnity: {
    g1: { feriale: 5.87, sabato: 8.83, domenica: 9.53 },
    g2: { feriale: 7.0, sabato: 11.01, domenica: 11.88 },
    g3: { feriale: 8.03, sabato: 12.81, domenica: 13.92 },
  },
}

export const LEVEL_GROUP: Record<Level, 'g1' | 'g2' | 'g3'> = {
  D1: 'g1', D2: 'g1', C1: 'g1',
  C2: 'g2', C3: 'g2',
  B1: 'g3', B2: 'g3', B3: 'g3', A1: 'g3',
}

export const GROUP_LABEL = { g1: 'D1, D2, C1', g2: 'C2, C3', g3: 'B1, B2, B3, A1' } as const
