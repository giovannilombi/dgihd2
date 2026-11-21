import { ALL_SLOTS } from './calendar'
import { slotEconomics, type SlotEcon } from './economics'
import { checkAssignment, compensationsFor, existingViolations, personSlots, type RuleId, type WeekComp } from './rules'
import type { AppData } from './store'
import type { Person } from './types'
import { canSeeSalaryOf, type Me } from './roles'

/**
 * Importi e ore di una persona con RAL "Q/", calcolati dal server con la RAL media di riferimento
 * (che non lascia mai il server): settimane del consuntivo e singoli turni assegnati.
 */
export interface NdEconomics {
  weeks: WeekComp[]
  slots: Record<string, SlotEcon>
}

/**
 * Esiti dei vincoli che dipendono da RAL e livello (cap ore e domenica di recupero) per le persone
 * di cui l'utente non vede la RAL. Calcolati dal server con i dati completi: contengono solo le
 * regole violate, mai RAL, livelli, ore o importi.
 */
export interface ServerChecks {
  /** persona → slot → regole che bloccherebbero l'assegnazione */
  blocked: Record<string, Record<string, RuleId[]>>
  /** slot già assegnati in conflitto → regole violate */
  conflicts: Record<string, RuleId[]>
  /** persone del proprio team con RAL Q/ → importi e ore calcolati sul server */
  nd?: Record<string, NdEconomics>
}

/**
 * Regole che dipendono da RAL e livello, le uniche che il browser non può verificare da solo.
 * Dal 20/11/2026 (solo gettone integrativo) non ce ne sono più: cap ore e domenica di imputazione
 * appartenevano all'alternativa "recupero come straordinario", archiviata.
 */
export const SALARY_RULES: ReadonlySet<RuleId> = new Set<RuleId>()

/**
 * Il browser non può calcolare i vincoli economici di chi ha la RAL non visibile (altro team)
 * né di chi ha la RAL Q/ (la RAL media di riferimento resta sul server).
 */
export const needsServerChecks = (p: Pick<Person, 'salaryHidden' | 'ralNd'>) => !!p.salaryHidden || !!p.ralNd

/** Calcolo lato server (dati completi, RAL media inclusa) per le persone che il browser non può calcolare. */
export function salaryRuleChecks(data: AppData, me: Pick<Me, 'role' | 'team'>): ServerChecks {
  const hidden = data.people.filter((p) => !canSeeSalaryOf(me, p.team) || p.ralNd)
  const onlySalary = (rules: RuleId[]) => rules.filter((r) => SALARY_RULES.has(r))
  const blocked: ServerChecks['blocked'] = {}
  for (const p of SALARY_RULES.size ? hidden : []) {
    if (!p.active) continue
    for (const s of ALL_SLOTS) {
      const rules = onlySalary(checkAssignment(p, s.id, data.assignments, data.params).map((v) => v.rule))
      if (rules.length) (blocked[p.id] ??= {})[s.id] = rules
    }
  }
  const hiddenIds = new Set(hidden.map((p) => p.id))
  const conflicts: ServerChecks['conflicts'] = {}
  for (const [sid, vs] of SALARY_RULES.size ? Object.entries(existingViolations(data.people, data.assignments, data.params)) : []) {
    if (!hiddenIds.has(data.assignments[sid])) continue
    const rules = onlySalary(vs.map((v) => v.rule))
    if (rules.length) conflicts[sid] = rules
  }
  // importi e ore delle persone Q/ del proprio team (quelle degli altri team restano riservate)
  const nd: Record<string, NdEconomics> = {}
  for (const p of data.people.filter((x) => x.ralNd && canSeeSalaryOf(me, x.team))) {
    const mine = personSlots(data.assignments, p.id)
    if (!mine.length) continue
    nd[p.id] = {
      weeks: compensationsFor(p, data.assignments, data.params),
      slots: Object.fromEntries(mine.map((s) => [s.id, slotEconomics(p, s, data.params)])),
    }
  }
  return { blocked, conflicts, nd }
}
