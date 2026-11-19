import { ALL_SLOTS } from './calendar'
import { checkAssignment, existingViolations, type RuleId } from './rules'
import type { AppData } from './store'
import { canSeeSalaryOf, type UserTeam } from './types'

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
}

/** Regole che dipendono da RAL e livello: le uniche che il browser non può verificare da solo. */
export const SALARY_RULES: ReadonlySet<RuleId> = new Set<RuleId>(['R3cap', 'R6'])

/** Calcolo lato server (dati completi) per le persone nascoste all'utente del team indicato. */
export function salaryRuleChecks(data: AppData, myTeam: UserTeam | null): ServerChecks {
  const hidden = data.people.filter((p) => !canSeeSalaryOf(myTeam, p.team))
  const onlySalary = (rules: RuleId[]) => rules.filter((r) => SALARY_RULES.has(r))
  const blocked: ServerChecks['blocked'] = {}
  for (const p of hidden) {
    if (!p.active) continue
    for (const s of ALL_SLOTS) {
      const rules = onlySalary(checkAssignment(p, s.id, data.assignments, data.params).map((v) => v.rule))
      if (rules.length) (blocked[p.id] ??= {})[s.id] = rules
    }
  }
  const hiddenIds = new Set(hidden.map((p) => p.id))
  const conflicts: ServerChecks['conflicts'] = {}
  for (const [sid, vs] of Object.entries(existingViolations(data.people, data.assignments, data.params))) {
    if (!hiddenIds.has(data.assignments[sid])) continue
    const rules = onlySalary(vs.map((v) => v.rule))
    if (rules.length) conflicts[sid] = rules
  }
  return { blocked, conflicts }
}
