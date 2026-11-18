import { LEVELS, type Level, type Person } from './types'

export const PALETTE = ['#2563eb', '#0d9488', '#9333ea', '#ea580c', '#db2777', '#4d7c0f', '#0891b2', '#b45309', '#4f46e5', '#be123c', '#15803d', '#7c3aed']

export const newId = () => Math.random().toString(36).slice(2, 10)

export const nextColor = (people: Person[]) => {
  const used = new Set(people.map((x) => x.color))
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[people.length % PALETTE.length]
}

export const DEFAULT_TEAM: Person[] = [26_000, 30_000, 34_000, 38_000].map((ral, i) => ({
  id: `p${i + 1}`,
  name: `Risorsa ${i + 1} (Placeholder)`,
  level: 'B1',
  ral,
  active: true,
  color: PALETTE[i],
}))

/** Interpreta numeri in formato italiano o inglese: "26.000", "26000", "26.000,50", "26,000". */
export function parseAmount(raw: string) {
  let s = raw.replace(/[€\s]/g, '')
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export interface ParseResult {
  people: Omit<Person, 'id' | 'color'>[]
  errors: string[]
}

/** Accetta testo incollato da Excel (tab) o CSV (; o ,): Nome, Livello, RAL. Ignora l'intestazione. */
export function parseTeamText(text: string): ParseResult {
  const out: ParseResult = { people: [], errors: [] }
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return
    const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (sep === ',' && cells.length > 3) {
      // RAL con separatore migliaia "," in CSV con virgola: ricompatta le celle finali
      cells.splice(2, cells.length - 2, cells.slice(2).join(''))
    }
    const [name, lvl, ralRaw] = cells
    if (i === 0 && /nome/i.test(name ?? '')) return
    const level = (lvl ?? '').toUpperCase() as Level
    const ral = parseAmount(ralRaw ?? '')
    if (!name) return out.errors.push(`Riga ${i + 1}: nome mancante`) && undefined
    if (!LEVELS.includes(level)) return out.errors.push(`Riga ${i + 1}: livello "${lvl ?? ''}" non valido`) && undefined
    if (!(ral > 0)) return out.errors.push(`Riga ${i + 1}: RAL "${ralRaw ?? ''}" non valida`) && undefined
    out.people.push({ name, level, ral, active: true })
  })
  return out
}
