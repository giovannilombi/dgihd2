import { describe, expect, it } from 'vitest'
import { slotEconomics } from './economics'
import { diff, rowsToData } from './mapping'
import { payroll, pnl } from './reports'
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
    expect(salaryRuleChecks(full, 'governance')).toEqual({ blocked: {}, conflicts: {}, nd: {} })
    expect(salaryRuleChecks(full, 'hr')).toEqual({ blocked: {}, conflicts: {}, nd: {} })
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

describe('RAL Q/: la media di riferimento resta sul server', () => {
  // 41000 è un valore di prova (quello reale vive solo nel database, tabella server_params)
  const serverParams = { ...P, ndRal: 41000 }
  const q = person('q1', 'tech', 0, { ralNd: true })
  const t = person('t1', 'tech', 30000)
  const serverData = { ...data([q, t], { '2026-11-23|N': 'q1', '2026-11-24|N': 't1' }), params: serverParams }

  it('il server restituisce vincoli, importi e ore delle persone Q/ del proprio team, mai la RAL media', () => {
    const r = salaryRuleChecks(serverData, 'tech')
    expect(r.nd?.q1.weeks).toHaveLength(1)
    expect(r.nd?.q1.slots['2026-11-23|N'].cost).toBeGreaterThan(0)
    expect(r.nd?.q1.weeks[0].hours).toBeGreaterThan(0)
    expect(r.nd?.t1).toBeUndefined() // le RAL visibili si calcolano in pagina
    expect(JSON.stringify(r)).not.toContain('41000')
    expect(JSON.stringify(r)).not.toMatch(/ndRal|"ral"/)
  })
  it('importi delle persone Q/ di altri team: mai restituiti', () => {
    expect(salaryRuleChecks(serverData, 'pm').nd).toEqual({})
  })
  it('anche i vincoli economici delle persone Q/ arrivano dal server', () => {
    const busy = { ...serverData, assignments: { '2026-11-23|N': 'q1' } }
    // RAL bassa di prova: due notti nella stessa settimana superano il cap
    const r = salaryRuleChecks({ ...busy, params: { ...P, ndRal: 26000 } }, 'tech')
    expect(r.blocked.q1['2026-11-25|N']).toContain('R3cap')
  })

  it('in pagina, senza i dati del server, la persona Q/ resta "in calcolo" (nessun importo con valori inventati)', () => {
    const local = data([q, t], { '2026-11-23|N': 'q1', '2026-11-24|N': 't1' }) // params senza ndRal, come nel browser
    expect(payroll(local.people, local.assignments, local.params).flatMap((m) => m.rows.map((r) => r.person.id))).toEqual(['t1'])
    const pl = pnl(local.people, local.assignments, local.params)
    expect(pl.total.costPending).toBe(1)
    expect(pl.total.complete).toBe(false)
  })
  it('con i dati del server consuntivo e conto economico usano gli importi calcolati sul server', () => {
    const local = data([q, t], { '2026-11-23|N': 'q1', '2026-11-24|N': 't1' })
    const nd = salaryRuleChecks(serverData, 'tech').nd
    const rows = payroll(local.people, local.assignments, local.params, nd).flatMap((m) => m.rows)
    const qRow = rows.find((r) => r.person.id === 'q1')!
    expect(qRow.weeks[0].days[0].cost).toBeCloseTo(nd!.q1.slots['2026-11-23|N'].cost, 6)
    const pl = pnl(local.people, local.assignments, local.params, [], undefined, nd)
    expect(pl.total.costPending).toBe(0)
    expect(pl.total.cost).toBeCloseTo(nd!.q1.slots['2026-11-23|N'].cost + slotEconomics(t, { date: '2026-11-24', kind: 'FN' }, P).cost, 6)
  })
  it('il browser non scrive mai la RAL media nei parametri condivisi (es. import di un vecchio JSON)', () => {
    const prev = data([], {})
    const ops = diff(prev, { ...prev, params: { ...P, ndRal: 41000, capHours: 7 } })
    expect(ops.params).toBeDefined()
    expect(JSON.stringify(ops.params)).not.toContain('ndRal')
  })
})
