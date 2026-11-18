import { ALL_SLOTS, SLOT_BY_ID, addDays, monthKey, weekSaturday, weekStart, weekSunday } from './calendar'
import { saturdayHours, slotEconomics, sundayHours } from './economics'
import type { Assignments, Params, Person, Slot } from './types'

export type RuleId = 'R0' | 'R1' | 'R2' | 'R3' | 'R3cap' | 'R4' | 'R5'

export interface Violation {
  rule: RuleId
  message: string
}

export const RULE_MESSAGES: Record<RuleId, string> = {
  R0: 'Bloccato: risorsa esclusa dalla rotazione su richiesta',
  R1: 'Bloccato: copertura massima 1 slot/giorno per garantire il riposo legale di 11h',
  R2: 'Bloccato: vietati turni consecutivi o adiacenti nel weekend (tutela riposo 11h e 35h settimanali)',
  R3: 'Bloccato: raggiunto il limite massimo di 2 turni/settimana (cap massimo di 8h di compensazione su singolo giorno weekend)',
  R3cap: 'Bloccato: le ore di compensazione della settimana supererebbero il cap giornaliero',
  R4: 'Bloccato: raggiunto il tetto massimo di 4 giornate nel mese',
  R5: 'Bloccato: recupero festivo obbligatorio avendo già coperto un turno weekend/festivo la settimana precedente',
}

export const RULE_SHORT: Record<RuleId, string> = {
  R0: 'Esclusa', R1: '1 slot/giorno', R2: 'Adiacenza', R3: 'Max 2/sett.', R3cap: 'Cap ore', R4: 'Max 4/mese', R5: 'Recupero weekend',
}

const isFestive = (s: Slot) => s.kind !== 'FN'

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
  let warning: string | undefined
  let moveReason: string | undefined
  if (hasSun) {
    day = 'sab'
    moveReason = 'Spostato su Sabato (turno di reperibilità la domenica)'
  } else if (hasNextMon) {
    if (hasSat) warning = 'Turno sia il sabato sia il lunedì successivo: ore lasciate sulla domenica, verifica HR'
    else { day = 'sab'; moveReason = 'Spostato su Sabato (evita continuità con Lunedì)' }
  }
  const hours = day === 'dom' ? sundayHours(lcomp, person.ral, p) : saturdayHours(lcomp, person.ral, p)
  return {
    week, slots, iccnl, lcomp, ltot, net, cost, day, dayDate: day === 'dom' ? sun : sat, hours,
    movedToSat: day === 'sab', moveReason, warning,
  }
}

export function compensationsFor(person: Person, a: Assignments, p: Params): WeekComp[] {
  const all = personSlots(a, person.id)
  const byWeek = new Map<string, Slot[]>()
  for (const s of all) {
    const w = weekStart(s.date)
    byWeek.set(w, [...(byWeek.get(w) ?? []), s])
  }
  return [...byWeek.values()].map((ss) => weekCompensation(person, ss, all, p))
}

/**
 * Verifica se `person` può essere assegnata a `slotId`, considerando tutte le altre
 * assegnazioni (l'eventuale assegnazione attuale dello slot viene ignorata).
 */
export function checkAssignment(person: Person, slotId: string, a: Assignments, p: Params): Violation[] {
  const slot = SLOT_BY_ID[slotId]
  const others: Assignments = { ...a }
  delete others[slotId]
  const mine = personSlots(others, person.id)
  const v: Violation[] = []
  const add = (rule: RuleId, message = RULE_MESSAGES[rule]) => v.push({ rule, message })

  if (!person.active) add('R0')

  // R1 – un solo slot nello stesso giorno
  if (mine.some((s) => s.date === slot.date)) add('R1')

  // R2 – nessun turno nel giorno precedente o successivo (copre ponti Ven→Sab e Dom→Lun)
  const prev = addDays(slot.date, -1), next = addDays(slot.date, 1)
  if (mine.some((s) => s.date === prev || s.date === next)) add('R2')

  // R3 – max 2 turni nella settimana ISO + cap ore compensazione
  const week = weekStart(slot.date)
  const sameWeek = mine.filter((s) => weekStart(s.date) === week)
  if (sameWeek.length >= 2) add('R3')
  else {
    const withNew = [...mine, slot]
    const weeks = [week, addDays(week, -7)] // un turno di lunedì può spostare al sabato la settimana precedente
    for (const w of weeks) {
      const ws = withNew.filter((s) => weekStart(s.date) === w)
      if (!ws.length) continue
      const c = weekCompensation(person, ws, withNew, p)
      if (c.hours > p.capHours + 1e-9) {
        add('R3cap', `Bloccato: le ore di compensazione della settimana salirebbero a ${c.hours.toFixed(2).replace('.', ',')} h sul ${c.day === 'dom' ? 'domenica' : 'sabato'}, oltre il cap di ${p.capHours.toString().replace('.', ',')} h/giorno (limite 2 turni/settimana)`)
        break
      }
    }
  }

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
 * Tra i candidati validi preferisce chi ha meno turni nel mese, poi in totale, poi il costo minore.
 */
export function autoFill(people: Person[], a: Assignments, p: Params, from: string, to: string): Assignments {
  const result: Assignments = { ...a }
  const active = people.filter((x) => x.active)
  const slots = ALL_SLOTS.filter((s) => s.date >= from && s.date <= to && !result[s.id])
  const ordered = [...slots.filter(isFestive), ...slots.filter((s) => !isFestive(s))]
  for (const slot of ordered) {
    const month = monthKey(slot.date)
    const ranked = active
      .filter((x) => checkAssignment(x, slot.id, result, p).length === 0)
      .map((x) => {
        const ss = personSlots(result, x.id)
        return {
          x,
          inMonth: ss.filter((s) => monthKey(s.date) === month).length,
          total: ss.length,
          cost: slotEconomics(x, slot, p).cost,
        }
      })
      .sort((m, n) => m.inMonth - n.inMonth || m.total - n.total || m.cost - n.cost)
    if (ranked.length) result[slot.id] = ranked[0].x.id
  }
  return result
}
