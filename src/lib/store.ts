import { useEffect, useState } from 'react'
import { ALL_SLOTS, SLOT_BY_ID } from './calendar'
import { DEFAULT_TEAM, newId, nextColor } from './team'
import { DEFAULT_PARAMS, LEVELS, type Assignments, type Level, type Params, type Person } from './types'

export interface AppData {
  version: 1
  params: Params
  people: Person[]
  assignments: Assignments
  /** Giorni non richiesti dal cliente: esclusi da rotazione, copertura, ricavi ed export. */
  excludedDays: string[]
}

const STORAGE_KEY = 'reperibilita-q4-2026:data'

export const STORAGE_KEY_DATA = STORAGE_KEY

export const defaultData = (): AppData => ({
  version: 1,
  params: structuredClone(DEFAULT_PARAMS),
  people: structuredClone(DEFAULT_TEAM),
  assignments: {},
  excludedDays: [],
})

/**
 * Valida e ripulisce dati importati o salvati: scarta persone e assegnazioni non valide,
 * accetta solo parametri numerici. Lancia un errore se il file non è una configurazione del tool.
 */
export function normalizeWithReport(raw: unknown): { data: AppData; warnings: string[] } {
  const d = raw as Record<string, unknown>
  if (!d || typeof d !== 'object' || Array.isArray(d) || !Array.isArray(d.people)) {
    throw new Error('il file non è una configurazione di questo tool (manca l\'elenco "people"). Usa un file creato con "Esporta configurazione JSON".')
  }
  const warnings: string[] = []

  const people: Person[] = []
  for (const r of d.people as Record<string, unknown>[]) {
    const ok = r && typeof r === 'object' && typeof r.name === 'string' && r.name.trim() &&
      LEVELS.includes(r.level as Level) && typeof r.ral === 'number' && Number.isFinite(r.ral) && r.ral > 0
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
    })
  }
  const dropped = (d.people as unknown[]).length - people.length
  if (dropped) warnings.push(`${dropped} risorse scartate perché incomplete o non valide`)

  const params = structuredClone(DEFAULT_PARAMS)
  const rp = (d.params ?? {}) as Record<string, unknown>
  for (const k of Object.keys(params) as (keyof Params)[]) {
    if (k === 'indemnity' || k === 'indemnitySplit') continue
    const v = rp[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) (params[k] as number) = v
  }
  if (rp.indemnitySplit === 'intera' || rp.indemnitySplit === 'proquota') params.indemnitySplit = rp.indemnitySplit
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

  return { data: { version: 1, params, people, assignments, excludedDays }, warnings }
}

export const normalize = (raw: unknown) => normalizeWithReport(raw).data

export function useAppData() {
  const [data, setData] = useState<AppData>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      if (s) return normalize(JSON.parse(s))
    } catch { /* storage assente o corrotto: si riparte dai default */ }
    return defaultData()
  })
  const [storageOk] = useState(() => {
    try { localStorage.setItem(STORAGE_KEY + ':probe', '1'); localStorage.removeItem(STORAGE_KEY + ':probe'); return true } catch { return false }
  })
  // Salvataggio automatico in LocalStorage a ogni modifica
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* quota o storage bloccato */ }
  }, [data])
  return { data, setData, storageOk }
}
