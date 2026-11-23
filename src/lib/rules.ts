import { ALL_SLOTS, SLOT_BY_ID, addDays, monthKey, weekSaturday, weekStart, weekSunday } from './calendar'
import { calcRal, hasRal, saturdayHours, slotEconomics, sundayHours } from './economics'
import { availabilityOf, preferredMax, type Assignments, type Params, type Person, type Slot } from './types'

export type RuleId = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R7'

export interface Violation {
  rule: RuleId
  message: string
}

export const RULE_MESSAGES: Record<RuleId, string> = {
  R0: 'Bloccato: risorsa esclusa dalla rotazione su richiesta',
  R1: 'Bloccato: copertura massima 1 slot/giorno per garantire il riposo legale di 11h',
  R2: 'Bloccato: vietati turni consecutivi o adiacenti nel weekend (tutela riposo 11h e 35h settimanali)',
  R3: 'Bloccato: raggiunto il limite massimo di 2 turni/settimana',
  R4: 'Bloccato: raggiunto il tetto massimo di 4 giornate nel mese',
  R5: 'Bloccato: recupero festivo obbligatorio avendo già coperto un turno weekend/festivo la settimana precedente',
  R7: 'Bloccato: la persona non è disponibile in questa data (ferie o assenza)',
}

export const RULE_SHORT: Record<RuleId, string> = {
  R0: 'Esclusa', R1: '1 slot/giorno', R2: 'Adiacenza', R3: 'Max 2/sett.', R4: 'Max 4/mese', R5: 'Recupero weekend', R7: 'Non disponibile',
}

const isFestive = (s: Slot) => s.kind !== 'FN'

/**
 * Indisponibilità per ferie/assenze:
 * - 'giorno': lo slot cade in un giorno di ferie (inclusa la notte che parte da quel giorno,
 *   quindi anche la notte dopo l'ultimo giorno di ferie è coperta);
 * - 'notte-prima': è la notte che termina alle 09:00 del primo giorno di ferie.
 */
export function unavailabilityReason(unavailable: string[] | undefined, slot: Pick<Slot, 'date' | 'kind'>): 'giorno' | 'notte-prima' | undefined {
  if (!unavailable?.length) return undefined
  if (unavailable.includes(slot.date)) return 'giorno'
  if (slot.kind !== 'WD' && unavailable.includes(addDays(slot.date, 1))) return 'notte-prima'
  return undefined
}

/** Slot assegnati a una persona, ordinati per data. */
export function personSlots(a: Assignments, personId: string): Slot[] {
  return Object.entries(a)
    .filter(([, pid]) => pid === personId)
    .map(([sid]) => SLOT_BY_ID[sid])
    .filter(Boolean)
    .sort((x, y) => x.id.localeCompare(y.id))
}

export interface WeekComp {
  week: string // lunedì
  slots: Slot[]
  iccnl: number
  lcomp: number
  ltot: number
  net: number
  cost: number
  day: 'dom' | 'sab'
  dayDate: string
  hours: number
  movedToSat: boolean
  /** Ore totali imputate su `dayDate` (anche da altre settimane spostate sulla stessa domenica). */
  dayTotal: number
  /** Sabato e domenica della settimana non utilizzabili: ore spostate su un'altra domenica. */
  relocated?: 'next' | 'prev'
  needsRelocation: boolean
  moveReason?: string
  warning?: string
}

/** Calcolo della compensazione settimanale (giorno di imputazione + ore) per una persona. */
export function weekCompensation(person: Person, slots: Slot[], allSlotsOfPerson: Slot[], p: Params): WeekComp {
  const week = weekStart(slots[0].date)
  const sat = weekSaturday(week)
  const sun = weekSunday(week)
  const nextMon = addDays(sun, 1)
  const dates = new Set(allSlotsOfPerson.map((s) => s.date))
  let iccnl = 0, lcomp = 0, ltot = 0, net = 0, cost = 0
  for (const s of slots) {
    const e = slotEconomics(person, s, p)
    iccnl += e.iccnl; lcomp += e.lcomp; ltot += e.ltot; net += e.net; cost += e.cost
  }
  const hasSun = dates.has(sun)
  const hasSat = dates.has(sat)
  const hasNextMon = dates.has(nextMon)
  let day: 'dom' | 'sab' = 'dom'
  let needsRelocation = false
  let moveReason: string | undefined
  if (hasSun) {
    day = 'sab'
    moveReason = 'Spostato su Sabato (turno di reperibilità la domenica)'
  } else if (hasNextMon) {
    if (hasSat) needsRelocation = true // sabato e domenica entrambi a contatto con un turno
    else { day = 'sab'; moveReason = 'Spostato su Sabato (evita continuità con Lunedì)' }
  }
  const ral = calcRal(person, p)
  const hours = day === 'dom' ? sundayHours(lcomp, ral, p) : saturdayHours(lcomp, ral, p)
  return {
    week, slots, iccnl, lcomp, ltot, net, cost, day, dayDate: day === 'dom' ? sun : sat, hours,
    movedToSat: day === 'sab', dayTotal: hours, needsRelocation, moveReason,
  }
}

/**
 * Assegna il giorno di imputazione a ogni settimana di una persona.
 * 1) Le settimane "normali" usano la propria Domenica (o il Sabato).
 * 2) Se Sabato e Domenica sono entrambi a contatto con un turno (turno il sabato e il lunedì
 *    successivo), le ore vanno alla Domenica successiva; in alternativa alla Domenica precedente,
 *    purché nello stesso mese. Una domenica è utilizzabile se la persona non ha turni tra il sabato
 *    e il lunedì attorno ad essa e se il totale delle ore imputate quel giorno resta entro il cap.
 */
export function allocateCompensations(person: Person, all: Slot[], p: Params): WeekComp[] {
  const byWeek = new Map<string, Slot[]>()
  for (const s of [...all].sort((x, y) => x.id.localeCompare(y.id))) {
    const w = weekStart(s.date)
    byWeek.set(w, [...(byWeek.get(w) ?? []), s])
  }
  const comps = [...byWeek.values()].map((ss) => weekCompensation(person, ss, all, p))
  const load = new Map<string, number>()
  const addLoad = (d: string, h: number) => load.set(d, (load.get(d) ?? 0) + h)
  for (const c of comps) if (!c.needsRelocation) addLoad(c.dayDate, c.hours)

  const dates = new Set(all.map((s) => s.date))
  const free = (sun: string) => !dates.has(addDays(sun, -1)) && !dates.has(sun) && !dates.has(addDays(sun, 1))
  const ralKnown = hasRal(calcRal(person, p))
  for (const c of comps.filter((x) => x.needsRelocation)) {
    const h = sundayHours(c.lcomp, calcRal(person, p), p)
    // senza RAL le ore non sono calcolabili: conta solo che la domenica sia libera da turni
    const fits = (d: string) => free(d) && (!ralKnown || (load.get(d) ?? 0) + h <= p.capHours + 1e-9)
    const next = addDays(weekSunday(c.week), 7)
    const prev = addDays(c.week, -1)
    c.day = 'dom'
    c.hours = h
    c.movedToSat = false
    if (fits(next)) {
      c.dayDate = next
      c.relocated = 'next'
      c.moveReason = 'Spostato alla Domenica successiva (sabato e lunedì già impegnati)'
    } else if (monthKey(prev) === monthKey(c.slots[0].date) && fits(prev)) {
      c.dayDate = prev
      c.relocated = 'prev'
      c.moveReason = 'Anticipato alla Domenica precedente, stesso mese (sabato e lunedì già impegnati)'
    } else {
      c.dayDate = weekSunday(c.week)
      c.warning = 'Nessuna domenica libera entro il cap per imputare le ore: rivedere i turni'
    }
    addLoad(c.dayDate, h)
  }
  for (const c of comps) c.dayTotal = load.get(c.dayDate) ?? c.hours
  return comps
}

export function compensationsFor(person: Person, a: Assignments, p: Params): WeekComp[] {
  return allocateCompensations(person, personSlots(a, person.id), p)
}

/**
 * Verifica se `person` può essere assegnata a `slotId`, considerando tutte le altre
 * assegnazioni (l'eventuale assegnazione attuale dello slot viene ignorata).
 */
export function checkAssignment(person: Person, slotId: string, a: Assignments, _p: Params): Violation[] {
  const slot = SLOT_BY_ID[slotId]
  const others: Assignments = { ...a }
  delete others[slotId]
  const mine = personSlots(others, person.id)
  const v: Violation[] = []
  const add = (rule: RuleId, message = RULE_MESSAGES[rule]) => v.push({ rule, message })

  if (!person.active) add('R0')

  // R7 – ferie/assenze: nessun turno nei giorni di ferie né nella notte che le precede
  const off = unavailabilityReason(person.unavailable, slot)
  if (off === 'giorno') add('R7')
  else if (off === 'notte-prima') add('R7', 'Bloccato: è la notte che precede un giorno di ferie o assenza (finirebbe alle 09:00 del primo giorno di ferie)')

  // R1 – un solo slot nello stesso giorno
  if (mine.some((s) => s.date === slot.date)) add('R1')

  // R2 – nessun turno nel giorno precedente o successivo (copre ponti Ven→Sab e Dom→Lun)
  const prev = addDays(slot.date, -1), next = addDays(slot.date, 1)
  if (mine.some((s) => s.date === prev || s.date === next)) add('R2')

  // R3 – max 2 turni nella settimana ISO
  // (con il solo gettone integrativo non servono più il cap ore di compensazione né la domenica di
  // imputazione: erano vincoli dell'alternativa "recupero come straordinario", archiviata.)
  const week = weekStart(slot.date)
  const sameWeek = mine.filter((s) => weekStart(s.date) === week)
  if (sameWeek.length >= 2) add('R3')

  // R4 – max 4 turni nel mese solare
  if (mine.filter((s) => monthKey(s.date) === monthKey(slot.date)).length >= 4) add('R4')

  // R5 – recupero weekend/festivo: niente weekend/festivi nella settimana successiva (e precedente)
  if (isFestive(slot)) {
    const adjWeeks = new Set([addDays(week, -7), addDays(week, 7)])
    if (mine.some((s) => isFestive(s) && adjWeeks.has(weekStart(s.date)))) add('R5')
  }
  return v
}

/** Violazioni delle assegnazioni già presenti (es. dopo cambio parametri o RAL). */
export function existingViolations(people: Person[], a: Assignments, p: Params): Record<string, Violation[]> {
  const byId = Object.fromEntries(people.map((x) => [x.id, x]))
  const out: Record<string, Violation[]> = {}
  for (const [sid, pid] of Object.entries(a)) {
    const person = byId[pid]
    if (!person) continue
    const v = checkAssignment(person, sid, a, p)
    if (v.length) out[sid] = v
  }
  return out
}

/**
 * Bozza automatica: riempie solo gli slot vuoti nel range, rispettando tutti i vincoli.
 * Priorità ai weekend/festivi (fatturati a giornata intera), poi alle notti feriali.
 * Tra i candidati validi preferisce chi ha meno turni nel mese, poi in totale, poi (se `useCost`) il costo minore.
 */
/** Avviso (non bloccante) se l'assegnazione supera il tetto mensile preferito dalla persona. */
export function preferenceWarning(person: Person, slotId: string, a: Assignments): string | undefined {
  const max = preferredMax(person)
  if (max === undefined) return undefined
  const slot = SLOT_BY_ID[slotId]
  const others: Assignments = { ...a }
  delete others[slotId]
  const n = personSlots(others, person.id).filter((s) => monthKey(s.date) === monthKey(slot.date)).length
  return n + 1 > max ? `Oltre la disponibilità dichiarata: max ${max} ${max === 1 ? 'turno' : 'turni'}/mese (sarebbe il ${n + 1}°)` : undefined
}

/** Ordine di impiego nell'auto-compilazione: prima i volontari, poi chi ha dato una disponibilità limitata, infine chi non ha espresso preferenze. */
const TIER = { volontario: 0, limitato: 1, nessuna: 2 } as const

export function autoFill(people: Person[], a: Assignments, p: Params, from: string, to: string, excludedDays: string[] = [], random: () => number = Math.random, useCost = true): Assignments {
  const result: Assignments = { ...a }
  const active = people.filter((x) => x.active)
  const excluded = new Set(excludedDays)
  const slots = ALL_SLOTS.filter((s) => s.date >= from && s.date <= to && !result[s.id] && !excluded.has(s.date))
  const ordered = [...slots.filter(isFestive), ...slots.filter((s) => !isFestive(s))]
  for (const slot of ordered) {
    const month = monthKey(slot.date)
    const valid = active.filter((x) => checkAssignment(x, slot.id, result, p).length === 0 && !preferenceWarning(x, slot.id, result))
    // le riserve entrano solo se nessun'altra risorsa può coprire lo slot, nell'ordine indicato (a parità, a caso)
    const regular = valid.filter((x) => !x.reserve)
    if (!regular.length) {
      const reserves = valid.filter((x) => x.reserve)
      if (reserves.length) {
        const best = Math.min(...reserves.map((x) => x.reserveOrder ?? Infinity))
        const tied = reserves.filter((x) => (x.reserveOrder ?? Infinity) === best)
        result[slot.id] = tied[Math.floor(random() * tied.length)].id
      }
      continue
    }
    const ranked = regular
      .map((x) => {
        const ss = personSlots(result, x.id)
        return {
          x,
          preferred: x.preferredDays?.includes(slot.date) ? 0 : 1,
          tier: TIER[availabilityOf(x)],
          inMonth: ss.filter((s) => monthKey(s.date) === month).length,
          total: ss.length,
          cost: useCost ? slotEconomics(x, slot, p).cost : 0,
        }
      })
      // prima chi ha indicato disponibilità per quel giorno, poi volontari → limitati → senza preferenza
      .sort((m, n) => m.preferred - n.preferred || m.tier - n.tier || m.inMonth - n.inMonth || m.total - n.total || m.cost - n.cost)
    if (ranked.length) result[slot.id] = ranked[0].x.id
  }
  return result
}

/**
 * Rigenera il periodo [from, to]: mantiene i turni bloccati (e quelli fuori periodo),
 * scarta gli altri e riassegna tutto il resto rispettando vincoli e disponibilità.
 * Con `useCost` falso RAL e livello non entrano nella scelta.
 */
export function regenerate(people: Person[], a: Assignments, p: Params, from: string, to: string, excludedDays: string[], pinned: string[], useCost = true): Assignments {
  const keep = new Set(pinned)
  const base = Object.fromEntries(Object.entries(a).filter(([sid]) => {
    const d = SLOT_BY_ID[sid]?.date
    return !d || d < from || d > to || keep.has(sid)
  }))
  return autoFill(people, base, p, from, to, excludedDays, Math.random, useCost)
}
