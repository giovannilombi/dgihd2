import { isEmail, LEVELS, normalizeEmail, type Availability, type Level, type Person } from './types'

export const PALETTE = ['#2563eb', '#0d9488', '#9333ea', '#ea580c', '#db2777', '#4d7c0f', '#0891b2', '#b45309', '#4f46e5', '#be123c', '#15803d', '#7c3aed', '#a21caf', '#ca8a04', '#334155', '#65a30d']

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
  availability: 'nessuna',
}))

/** Interpreta numeri in formato italiano o inglese: "26.000", "26000", "26.000,50", "26,000". */
export function parseAmount(raw: string) {
  let s = raw.replace(/[€\s]/g, '')
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export type ImportedPerson = Omit<Person, 'id' | 'color'>

export interface ParseResult {
  people: ImportedPerson[]
  errors: string[] // righe scartate
  warnings: string[] // righe importate ma da verificare
  fatal?: string // file non interpretabile: nessuna riga importabile
}

export const MAX_IMPORT_ROWS = 500
export const RAL_MIN = 10_000
export const RAL_MAX = 250_000

export const TEMPLATE_CSV = '﻿' + [
  'Nome;Email;Livello;RAL;Disponibilità',
  'Mario Rossi;mario.rossi@azienda.it;B1;32.000;volontario',
  'Anna Bianchi;anna.bianchi@azienda.it;C2;28.500;2',
  'Luca Verdi;luca.verdi@azienda.it;B2;35.000;',
  'Sara Neri;sara.neri@azienda.it;C3;30.000;ko',
].join('\r\n') + '\r\n'

/** Valori ammessi nella colonna Disponibilità (facoltativa). */
export const AVAILABILITY_HELP = 'volontario · 1, 2 o 3 (max turni/mese) · vuoto = nessuna preferenza · ko = non in rotazione'

/** Interpreta la colonna Disponibilità. `null` = valore non riconosciuto. */
export function parseAvailability(raw: string): { availability: Availability; maxPerMonth?: number; active: boolean } | null {
  const v = raw.trim().toLowerCase()
  if (!v || /^(nessuna|nessuna preferenza|n\.?d\.?|-)$/.test(v)) return { availability: 'nessuna', active: true }
  if (/^(ko|no|non disponibile|non in rotazione|0)$/.test(v)) return { availability: 'nessuna', active: false }
  if (/^(volontari[oa]|si|sì|senza limite|illimitat[oa]|4)$/.test(v)) return { availability: 'volontario', active: true }
  const m = v.match(/^(?:max\s*)?([123])(?:\s*(?:turni|turno)?(?:\s*\/?\s*mese)?)?$/)
  if (m) return { availability: 'limitato', maxPerMonth: Number(m[1]), active: true }
  return null
}

/** Divide una riga CSV rispettando i campi tra virgolette ("26.000,00"). */
function splitCsvLine(line: string, sep: string) {
  const out: string[] = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === sep && !quoted) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

function detectSeparator(line: string) {
  if (line.includes('\t')) return '\t'
  if (line.includes(';')) return ';'
  return ','
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
const HEADER_ALIASES = {
  name: ['nome', 'nomecognome', 'nomeecognome', 'cognomenome', 'cognomeenome', 'name', 'risorsa', 'dipendente'],
  level: ['livello', 'livelloccnl', 'level', 'inquadramento', 'liv'],
  ral: ['ral', 'ralannua', 'retribuzioneannualorda', 'ralanno', 'ralannualorda'],
  availability: ['disponibilita', 'preferenza', 'adesione', 'disponibilitamax', 'maxturni'],
  email: ['email', 'mail', 'emailaziendale', 'indirizzoemail', 'posta'],
} as const

/** Riconosce un livello anche se scritto "b1", "Liv. B1", "livello B1". */
function parseLevel(raw: string): Level | null {
  const m = raw.toUpperCase().match(/\b([ABCD][123])\b/) ?? raw.toUpperCase().match(/([ABCD][123])/)
  const lvl = m?.[1] as Level | undefined
  return lvl && LEVELS.includes(lvl) ? lvl : null
}

/**
 * Accetta testo incollato da Excel (tab) o CSV (; o ,). Se c'è un'intestazione le colonne
 * vengono riconosciute per nome in qualunque ordine; altrimenti l'ordine atteso è
 * Nome, Livello, RAL, Disponibilità, Email. L'email è obbligatoria e non può ripetersi.
 */
export function parseTeamText(text: string): ParseResult {
  const out: ParseResult = { people: [], errors: [], warnings: [] }
  if (text.includes('\u0000') || text.startsWith('PK\u0003\u0004')) {
    out.fatal = 'Il file non è un CSV di testo (sembra un file Excel o binario). Salvalo come "CSV UTF-8" oppure copia le celle da Excel e incollale qui.'
    return out
  }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l, i) => ({ l, n: i + 1 })).filter((x) => x.l.trim())
  if (!lines.length) return out
  if (lines.length > MAX_IMPORT_ROWS + 1) {
    out.fatal = `Il file contiene ${lines.length} righe: il massimo importabile è ${MAX_IMPORT_ROWS}. Verifica di aver caricato il file giusto.`
    return out
  }
  const sep = detectSeparator(lines[0].l)
  const first = splitCsvLine(lines[0].l, sep).map(norm)
  const find = (aliases: readonly string[]) => first.findIndex((c) => aliases.includes(c))
  let cols = { name: 0, level: 1, ral: 2, availability: 3, email: 4 }
  let body = lines
  const looksLikeHeader = first.some((c) => Object.values(HEADER_ALIASES).some((a) => (a as readonly string[]).includes(c)))
  if (looksLikeHeader) {
    const idx = { name: find(HEADER_ALIASES.name), level: find(HEADER_ALIASES.level), ral: find(HEADER_ALIASES.ral), availability: find(HEADER_ALIASES.availability), email: find(HEADER_ALIASES.email) }
    const missing = [idx.name < 0 && 'Nome', idx.email < 0 && 'Email', idx.level < 0 && 'Livello', idx.ral < 0 && 'RAL'].filter(Boolean)
    if (missing.length) {
      out.fatal = `Intestazione riconosciuta ma mancano le colonne: ${missing.join(', ')}. Usa il template (colonne Nome, Email, Livello, RAL).`
      return out
    }
    cols = idx
    body = lines.slice(1)
  }
  const seen = new Map<string, number>()
  const seenEmail = new Map<string, number>()
  for (const { l, n } of body) {
    let cells = splitCsvLine(l, sep)
    if (!looksLikeHeader && sep === ',' && cells.length > 3 && /^\d{3}$/.test(cells[3] ?? '')) {
      // CSV con virgola e RAL non tra virgolette ("26,000"): ricompatta la RAL
      cells = [cells[0], cells[1], cells[2] + cells[3], ...cells.slice(4)]
    }
    const name = (cells[cols.name] ?? '').replace(/\s+/g, ' ').trim()
    const lvlRaw = cells[cols.level] ?? ''
    const ralRaw = cells[cols.ral] ?? ''
    if (!name) { out.errors.push(`Riga ${n}: nome mancante`); continue }
    if (name.length > 80) { out.errors.push(`Riga ${n}: nome troppo lungo (max 80 caratteri)`); continue }
    const level = parseLevel(lvlRaw)
    if (!level) { out.errors.push(`Riga ${n} (${name}): livello "${lvlRaw}" non valido – ammessi ${LEVELS.join(', ')}`); continue }
    const ral = parseAmount(ralRaw)
    if (!Number.isFinite(ral) || ral <= 0) { out.errors.push(`Riga ${n} (${name}): RAL "${ralRaw}" non è un numero`); continue }
    if (ral < RAL_MIN || ral > RAL_MAX) { out.errors.push(`Riga ${n} (${name}): RAL ${ralRaw} fuori dall'intervallo plausibile (${RAL_MIN.toLocaleString('it-IT')}–${RAL_MAX.toLocaleString('it-IT')} €)`); continue }
    const emailRaw = cells[cols.email] ?? ''
    if (!isEmail(emailRaw)) { out.errors.push(`Riga ${n} (${name}): email ${emailRaw ? `"${emailRaw}" non valida` : 'mancante'} – è obbligatoria`); continue }
    const email = normalizeEmail(emailRaw)
    if (seenEmail.has(email)) { out.errors.push(`Riga ${n} (${name}): email ${email} già usata alla riga ${seenEmail.get(email)}`); continue }
    seenEmail.set(email, n)
    const key = name.toLowerCase()
    if (seen.has(key)) out.warnings.push(`Riga ${n}: "${name}" compare anche alla riga ${seen.get(key)}`)
    else seen.set(key, n)
    const availRaw = cols.availability >= 0 ? cells[cols.availability] ?? '' : ''
    let avail = parseAvailability(availRaw)
    if (!avail) {
      out.warnings.push(`Riga ${n} (${name}): disponibilità "${availRaw}" non riconosciuta, impostata "Nessuna preferenza"`)
      avail = { availability: 'nessuna', active: true }
    }
    out.people.push({ name, email, level, ral, ...avail })
  }
  if (!out.people.length && out.errors.length && !looksLikeHeader) {
    out.fatal = 'Nessuna riga riconosciuta. Il file deve avere le colonne Nome, Email, Livello, RAL: scarica il template e compilalo.'
  }
  return out
}
