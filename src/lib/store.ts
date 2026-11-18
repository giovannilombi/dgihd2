import { useEffect, useState } from 'react'
import { DEFAULT_TEAM } from './team'
import { DEFAULT_PARAMS, type Assignments, type Params, type Person } from './types'

export interface AppData {
  version: 1
  params: Params
  people: Person[]
  assignments: Assignments
}

const STORAGE_KEY = 'reperibilita-q4-2026:data'

export const defaultData = (): AppData => ({
  version: 1,
  params: structuredClone(DEFAULT_PARAMS),
  people: structuredClone(DEFAULT_TEAM),
  assignments: {},
})

/** Normalizza dati importati/salvati, completando eventuali parametri mancanti. */
export function normalize(raw: unknown): AppData {
  const d = raw as Partial<AppData>
  if (!d || typeof d !== 'object' || !Array.isArray(d.people)) throw new Error('File non valido: manca l\'elenco "people".')
  return {
    version: 1,
    params: { ...structuredClone(DEFAULT_PARAMS), ...(d.params ?? {}), indemnity: { ...DEFAULT_PARAMS.indemnity, ...(d.params?.indemnity ?? {}) } },
    people: d.people,
    assignments: d.assignments ?? {},
  }
}

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
