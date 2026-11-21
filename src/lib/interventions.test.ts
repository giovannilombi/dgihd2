import { describe, expect, it } from 'vitest'
import { amountsVisible, canDecide, parseMyShifts, payRal, resolveTimes, shiftChip, type Intervention } from './interventions'
import { teamDir } from './teams'
import type { Person } from './types'

const iv = (id: string, status: Intervention['status']): Intervention => ({
  id, slot: '2026-11-19|N', personId: 'p', start: '2026-11-19T22:00', end: '2026-11-19T23:00', note: null, status,
  rejectReason: null, resendComment: null, decidedByName: null, decidedAt: null,
})

describe('stato degli interventi di un turno', () => {
  const after = '2026-11-20T09:00', during = '2026-11-20T08:59', before = '2026-11-19T17:59'
  it('da compilare a turno finito, poi giallo, verde, rosso o grigio', () => {
    expect(shiftChip('2026-11-19|N', [], false, before).chip).toBe('future')
    expect(shiftChip('2026-11-19|N', [], false, during).chip).toBe('running')
    expect(shiftChip('2026-11-19|N', [], false, after).chip).toBe('todo')
    expect(shiftChip('2026-11-19|N', [], true, after).chip).toBe('nothing')
    expect(shiftChip('2026-11-19|N', [iv('a', 'pending'), iv('b', 'approved')], false, after)).toEqual({ chip: 'pending', count: 2 })
    expect(shiftChip('2026-11-19|N', [iv('a', 'approved'), iv('b', 'approved')], false, after)).toEqual({ chip: 'approved', count: 2 })
    expect(shiftChip('2026-11-19|N', [iv('a', 'rejected'), iv('b', 'approved')], false, after).chip).toBe('rejected')
  })
})

describe('orari del modulo', () => {
  it('la notte prosegue al mattino del giorno dopo; la fine prima dell\'inizio è il giorno dopo', () => {
    expect(resolveTimes('2026-11-19|N', '22:40', '00:15')).toEqual({ start: '2026-11-19T22:40', end: '2026-11-20T00:15' })
    expect(resolveTimes('2026-11-19|N', '03:10', '03:35')).toEqual({ start: '2026-11-20T03:10', end: '2026-11-20T03:35' })
    expect(resolveTimes('2026-11-19|N', '08:30', '10:00')).toEqual({ start: '2026-11-20T08:30', end: '2026-11-20T10:00' })
    expect(resolveTimes('2026-11-22|D', '14:00', '15:05')).toEqual({ start: '2026-11-22T14:00', end: '2026-11-22T15:05' })
    expect(resolveTimes('2026-11-22|D', '17:30', '01:00')).toEqual({ start: '2026-11-22T17:30', end: '2026-11-23T01:00' })
    expect(resolveTimes('2026-11-19|N', '', '01:00')).toBeNull()
  })
})

describe('chi decide e chi vede gli importi', () => {
  const teams = teamDir([
    { id: 'tech', label: 'Tech', seesAll: false, directorId: 'dir', sort: 1 },
    { id: 'pm', label: 'PM', seesAll: false, directorId: null, sort: 2 },
    { id: 'hr', label: 'HR', seesAll: true, directorId: null, sort: 3 },
  ])
  const person = (id: string, team: string, extra: Partial<Person> = {}): Person => ({ id, name: id, level: 'B1', ral: 30000, active: true, color: '#000', team, ...extra })
  const director = { id: 'dir', role: 'viewer_plus' as const, team: 'tech' }
  it('director del team o super admin; mai sui propri interventi (salvo super admin)', () => {
    expect(canDecide(person('t1', 'tech'), director, teams, 'own')).toBe(true)
    expect(canDecide(person('p1', 'pm'), director, teams, 'own')).toBe(false)
    expect(canDecide(person('own', 'tech'), director, teams, 'own')).toBe(false)
    expect(canDecide(person('own', 'tech'), { id: 's', role: 'super_admin', team: null }, teams, 'own')).toBe(true)
    expect(canDecide(person('t1', 'tech'), { id: 'e', role: 'editor', team: 'tech' }, teams, null)).toBe(false)
  })
  it('importi: HR/Governance e director del team; RAL Q/ o da inserire = solo ore', () => {
    expect(amountsVisible(person('t1', 'tech'), director, teams)).toBe(true)
    expect(amountsVisible(person('p1', 'pm'), director, teams)).toBe(false)
    expect(amountsVisible(person('p1', 'pm'), { id: 'h', role: 'viewer_plus', team: 'hr' }, teams)).toBe(true)
    expect(amountsVisible(person('t1', 'tech'), { id: 'e', role: 'editor', team: 'tech' }, teams)).toBe(false)
    expect(payRal(person('a', 'tech'))).toBe(30000)
    expect(payRal(person('a', 'tech', { ralNd: true }))).toBeNull()
    expect(payRal(person('a', 'tech', { ral: 0 }))).toBeNull()
    expect(payRal(person('a', 'tech', { salaryHidden: true }))).toBeNull()
  })
})

describe('risposta di my_shifts', () => {
  it('valida turni, interventi e regole', () => {
    const d = parseMyShifts({
      me: { id: 'p', name: 'Mario Rossi', color: '#123456' },
      rules: { otMinHours: 1, otToleranceMin: 'x' },
      shifts: [{ slot: '2026-11-19|N', no_intervention: false, consuntivato: true }, { slot: 'foo' }],
      interventions: [{ id: 'i', slot: '2026-11-19|N', start: '2026-11-19T22:40', end: '2026-11-20T00:15', status: 'approved' }],
    })
    expect(d.shifts).toEqual([{ slot: '2026-11-19|N', noIntervention: false, consuntivato: true }])
    expect(d.interventions[0]).toMatchObject({ id: 'i', personId: 'p', status: 'approved', end: '2026-11-20T00:15' })
    expect(d.rules).toEqual({ otMinHours: 1 })
    expect(() => parseMyShifts(null)).toThrow()
  })
})
