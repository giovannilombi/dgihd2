import { describe, expect, it } from 'vitest'
import { ALL_SLOTS, weekday } from './calendar'
import { baseHourly, saturdayHours, slotEconomics, sundayHours } from './economics'
import { autoFill, checkAssignment, compensationsFor, existingViolations } from './rules'
import { parseTeamText } from './team'
import { pnl } from './reports'
import { DEFAULT_PARAMS as P, type Person } from './types'

const mk = (id: string, ral: number, level: Person['level'] = 'B1'): Person => ({ id, name: id, level, ral, active: true, color: '#000' })
const fn = (d: string) => ({ date: d, kind: 'FN' as const })

describe('modello economico (tabella B1 della specifica)', () => {
  it.each([
    [26000, 11.56, 80.65, 4.05, 108.87],
    [30000, 13.34, 92.59, 4.09, 125.0],
    [34000, 15.12, 92.59, 3.61, 125.0],
    [38000, 16.9, 92.59, 3.23, 125.0],
  ])('RAL %d – notte feriale', (ral, base, ltot, hDom, cost) => {
    const e = slotEconomics(mk('x', ral), fn('2026-11-24'), P)
    expect(baseHourly(ral)).toBeCloseTo(base, 2)
    expect(e.ltot).toBeCloseTo(ltot, 2)
    expect(sundayHours(e.lcomp, ral, P)).toBeCloseTo(hDom, 2)
    expect(e.cost).toBeCloseTo(cost, 2)
  })

  it('festivo notte RAL 30k: lordo 111,11 / 4,70h dom', () => {
    const e = slotEconomics(mk('x', 30000), { date: '2026-11-29', kind: 'WN' }, P)
    expect(e.ltot).toBeCloseTo(111.11, 2)
    expect(sundayHours(e.lcomp, 30000, P)).toBeCloseTo(4.7, 2)
  })

  it('sabato a scaglioni: le prime 2h a +25%, poi +30%', () => {
    const base = baseHourly(30000)
    expect(saturdayHours(2 * base * 1.25, 30000, P)).toBeCloseTo(2, 6)
    expect(saturdayHours(2 * base * 1.25 + base * 1.3, 30000, P)).toBeCloseTo(3, 6)
  })
})

describe('calendario', () => {
  it('festivi e slot', () => {
    expect(weekday('2026-11-01')).toBe(0)
    expect(ALL_SLOTS.filter((s) => s.date === '2026-12-07')).toHaveLength(2) // Sant'Ambrogio lunedì
    expect(ALL_SLOTS.filter((s) => s.date === '2026-12-09')).toHaveLength(1)
  })
})

describe('motore vincoli', () => {
  const a = mk('a', 38000)
  it('R1 stesso giorno', () => {
    expect(checkAssignment(a, '2026-11-28|N', { '2026-11-28|D': 'a' }, P).map((v) => v.rule)).toContain('R1')
  })
  it('R2 ponte venerdì notte → sabato diurno', () => {
    expect(checkAssignment(a, '2026-11-28|D', { '2026-11-27|N': 'a' }, P).map((v) => v.rule)).toContain('R2')
  })
  it('R3 terzo turno in settimana', () => {
    const r = checkAssignment(a, '2026-11-27|N', { '2026-11-23|N': 'a', '2026-11-25|N': 'a' }, P).map((v) => v.rule)
    expect(r).toContain('R3')
  })
  it('R3cap: RAL 26k con due notti feriali supera 8h', () => {
    const r = checkAssignment(mk('b', 26000), '2026-11-25|N', { '2026-11-23|N': 'b' }, P).map((v) => v.rule)
    expect(r).toContain('R3cap')
  })
  it('R4 quinto turno nel mese', () => {
    const asg = { '2026-11-02|N': 'a', '2026-11-09|N': 'a', '2026-11-16|N': 'a', '2026-11-23|N': 'a' }
    expect(checkAssignment(a, '2026-11-30|N', asg, P).map((v) => v.rule)).toContain('R4')
  })
  it('R5 weekend in settimane consecutive', () => {
    expect(checkAssignment(a, '2026-11-21|D', { '2026-11-15|D': 'a' }, P).map((v) => v.rule)).toContain('R5')
    expect(checkAssignment(a, '2026-11-28|D', { '2026-11-15|D': 'a' }, P)).toEqual([])
  })
  it('spostamento al sabato se turno il lunedì successivo', () => {
    const c = compensationsFor(a, { '2026-11-25|N': 'a', '2026-11-30|N': 'a' }, P)
    expect(c[0].day).toBe('sab')
    expect(c[0].dayDate).toBe('2026-11-28')
    expect(c[1].day).toBe('dom')
  })
  it('auto-compila senza violazioni', () => {
    const team = Array.from({ length: 14 }, (_, i) => mk(`p${i}`, 26000 + i * 2500))
    const res = autoFill(team, {}, P, '2026-11-01', '2026-12-31')
    expect(Object.keys(res).length).toBeGreaterThan(60)
    expect(existingViolations(team, res, P)).toEqual({})
    expect(pnl(team, res, P).total.marginPct).toBeGreaterThan(50)
  })
})

describe('import team', () => {
  it('Excel/CSV con intestazione e RAL italiana', () => {
    const r = parseTeamText('Nome\tLivello\tRAL\nMario Rossi\tb1\t26.000\nAnna Bianchi;C2;31.500,00\nX,ZZ,1')
    expect(r.people).toEqual([
      { name: 'Mario Rossi', level: 'B1', ral: 26000, active: true },
      { name: 'Anna Bianchi', level: 'C2', ral: 31500, active: true },
    ])
    expect(r.errors).toHaveLength(1)
  })
})
