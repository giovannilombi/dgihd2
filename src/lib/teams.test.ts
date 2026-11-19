import { describe, expect, it } from 'vitest'
import { rowsToData } from './mapping'
import { checkAssignment, RULE_MESSAGES } from './rules'
import { SALARY_RULES, salaryRuleChecks } from './salaryChecks'
import { mergeConflicts, mergeViolations } from './serverChecks'
import type { AppData } from './store'
import { canSeeSalaryOf, DEFAULT_PARAMS as P, defaultResourceTeam, seesAllSalaries, type Person, type ResourceTeam } from './types'

const person = (id: string, team: ResourceTeam | null, ral: number, extra: Partial<Person> = {}): Person =>
  ({ id, name: id, level: 'B1', ral, active: true, color: '#000', team, ...extra })
const data = (people: Person[], assignments: Record<string, string> = {}): AppData =>
  ({ version: 1, params: P, people, assignments, excludedDays: [], pinned: [] })

describe('visibilità RAL per team (stessa regola della RLS)', () => {
  it('HR e Governance vedono tutti i team, anche le risorse senza team', () => {
    for (const t of ['hr', 'governance'] as const) {
      expect(seesAllSalaries(t)).toBe(true)
      expect(canSeeSalaryOf(t, 'pm')).toBe(true)
      expect(canSeeSalaryOf(t, null)).toBe(true)
    }
  })
  it('gli altri vedono solo il proprio team', () => {
    expect(canSeeSalaryOf('tech', 'tech')).toBe(true)
    expect(canSeeSalaryOf('tech', 'pm')).toBe(false)
    expect(canSeeSalaryOf('tech', null)).toBe(false)
    expect(canSeeSalaryOf('pm', 'tech')).toBe(false)
    expect(canSeeSalaryOf('tech', 'governance')).toBe(false)
    expect(canSeeSalaryOf('governance', 'governance')).toBe(true)
  })
  it('senza team non si vede nessuna RAL', () => {
    expect(canSeeSalaryOf(null, null)).toBe(false)
    expect(canSeeSalaryOf(null, 'tech')).toBe(false)
  })
  it('le nuove risorse nascono nel team di chi le crea (se è un team di risorse)', () => {
    expect(defaultResourceTeam('tech')).toBe('tech')
    expect(defaultResourceTeam('hr')).toBeNull()
    expect(defaultResourceTeam('governance')).toBe('governance')
    expect(defaultResourceTeam(null)).toBeNull()
  })
})

describe('vincoli economici calcolati dal server', () => {
  // Scenario del cap ore: RAL 26k con due notti feriali nella stessa settimana supera 8 h
  const tech = person('t1', 'tech', 26000)
  const pm = person('p1', 'pm', 26000)
  const full = data([tech, pm], { '2026-11-23|N': 'p1', '2026-11-16|N': 't1' })

  it('per un utente Tech calcola solo le persone degli altri team', () => {
    const r = salaryRuleChecks(full, 'tech')
    expect(r.blocked.p1['2026-11-25|N']).toContain('R3cap')
    expect(r.blocked.t1).toBeUndefined()
  })
  it('per HR e Governance non serve nessun calcolo sul server', () => {
    expect(salaryRuleChecks(full, 'governance')).toEqual({ blocked: {}, conflicts: {} })
    expect(salaryRuleChecks(full, 'hr')).toEqual({ blocked: {}, conflicts: {} })
  })
  it('restituisce solo identificativi di regola: nessuna RAL, ora o importo', () => {
    const r = salaryRuleChecks(full, 'tech')
    const rules = Object.values(r.blocked).flatMap((x) => Object.values(x)).flat()
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every((x) => SALARY_RULES.has(x))).toBe(true)
    const text = JSON.stringify(r)
    expect(text).not.toContain('26000')
    expect(text).not.toMatch(/message|ral|level|hours|\d+[.,]\d+/i)
  })
  it('segnala le assegnazioni esistenti in conflitto per le persone nascoste', () => {
    const clash = data([tech, pm], { '2026-11-23|N': 'p1', '2026-11-25|N': 'p1' })
    const r = salaryRuleChecks(clash, 'tech')
    expect(Object.values(r.conflicts).flat()).toContain('R3cap')
  })
  it('ignora le persone nascoste fuori rotazione', () => {
    const r = salaryRuleChecks(data([tech, { ...pm, active: false }], { '2026-11-23|N': 'p1' }), 'tech')
    expect(r.blocked.p1).toBeUndefined()
  })

  it('in pagina il cap della persona nascosta non è calcolabile: arriva dal server con un messaggio generico', () => {
    // come la vede un utente Tech: nessuna riga riservata per la persona PM
    const seen = rowsToData(
      [{ id: 'p1', name: 'p1', color: '#000000', active: true, sort: 0, team: 'pm' }],
      [], [], [{ slot_id: '2026-11-23|N', person_id: 'p1', pinned: false }], [], {},
    )
    const hidden = seen.people[0]
    expect(hidden.salaryHidden).toBe(true)
    const local = checkAssignment(hidden, '2026-11-25|N', seen.assignments, seen.params)
    expect(local.map((v) => v.rule)).not.toContain('R3cap')
    const server = salaryRuleChecks(full, 'tech')
    const merged = mergeViolations(local, server.blocked.p1['2026-11-25|N'])
    const cap = merged.find((v) => v.rule === 'R3cap')
    expect(cap?.message).toBe(RULE_MESSAGES.R3cap)
    expect(cap?.message).not.toMatch(/\d+,\d+\s*h/)
  })
  it('unisce senza duplicare le regole già calcolate in pagina', () => {
    const local = [{ rule: 'R3cap' as const, message: 'x' }]
    expect(mergeViolations(local, ['R3cap'])).toBe(local)
    expect(mergeViolations([], undefined)).toEqual([])
    const c = mergeConflicts({ a: [{ rule: 'R2', message: 'y' }] }, { blocked: {}, conflicts: { a: ['R6'], b: ['R3cap'] } })
    expect(c.a.map((v) => v.rule)).toEqual(['R2', 'R6'])
    expect(c.b.map((v) => v.rule)).toEqual(['R3cap'])
  })
})
