import { describe, expect, it } from 'vitest'
import { dayPerms, dayState, dayStatusMap, isDirectorOf, lockedSlots, romeToday, shortName, type Me } from './dayStatus'
import { teamDir } from './teams'
import { normalizeWithReport } from './store'
import { DEFAULT_PARAMS, type Person } from './types'

const teams = teamDir([
  { id: 'tech', label: 'Tech', seesAll: false, directorId: 'dir-tech', sort: 1 },
  { id: 'pm', label: 'PM', seesAll: false, directorId: null, sort: 2 },
  { id: 'hr', label: 'HR', seesAll: true, directorId: null, sort: 3 },
])
const person = (id: string, team: string): Person => ({ id, name: id, level: 'B1', ral: 0, active: true, color: '#000', team })
const people = [person('t1', 'tech'), person('p1', 'pm')]
// sabato 19/12/2026: diurno a t1, notte a p1; lunedì 21/12: notte a p1
const a = { '2026-12-19|D': 't1', '2026-12-19|N': 'p1', '2026-12-21|N': 'p1' }
const days = dayStatusMap([
  { day: '2026-12-19', erogato_at: '2026-12-20T08:00:00Z', erogato_by_name: 'Paolo Gialli', consuntivato_at: null, consuntivato_by_name: null },
  { day: '2026-12-14', erogato_at: '2026-12-15T08:00:00Z', erogato_by_name: 'x', consuntivato_at: '2026-12-31T08:00:00Z', consuntivato_by_name: 'y' },
])

describe('stato dei giorni', () => {
  it('aperto, erogato, consuntivato', () => {
    expect(dayState(days, '2026-12-19')).toBe('erogato')
    expect(dayState(days, '2026-12-14')).toBe('consuntivato')
    expect(dayState(days, '2026-12-21')).toBe('aperto')
  })
  it('i turni dei giorni erogati restano fissi', () => {
    expect(lockedSlots(days, a).sort()).toEqual(['2026-12-19|D', '2026-12-19|N'])
  })
  it('data di oggi in Italia anche a cavallo della mezzanotte UTC', () => {
    expect(romeToday(new Date('2026-12-19T23:30:00Z'))).toBe('2026-12-20')
    expect(romeToday(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01')
    expect(romeToday(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02')
  })
  it('nome breve di chi ha segnato', () => {
    expect(shortName('Paolo Gialli')).toBe('P. Gialli')
    expect(shortName('qa.test@example.com')).toBe('qa.test')
    expect(shortName('Mario')).toBe('Mario')
  })
})

describe('permessi sui giorni (stesse regole del database)', () => {
  const me = (id: string, role: Me['role'], team: string | null): Me => ({ id, role, team })
  it('Full edit e super admin segnano erogato; solo il super admin sblocca', () => {
    expect(dayPerms('2026-12-21', me('e', 'editor', 'pm'), teams, people, a)).toEqual({ mark: true, close: true, unlock: false })
    expect(dayPerms('2026-12-21', me('s', 'super_admin', null), teams, people, a)).toEqual({ mark: true, close: true, unlock: true })
  })
  it('il director segna e sblocca solo i giorni con un turno del suo team', () => {
    const d = me('dir-tech', 'viewer_plus', 'tech')
    expect(isDirectorOf(teams, 'tech', d)).toBe(true)
    expect(dayPerms('2026-12-19', d, teams, people, a)).toEqual({ mark: true, close: true, unlock: true })
    expect(dayPerms('2026-12-21', d, teams, people, a)).toEqual({ mark: false, close: false, unlock: false })
  })
  it('un director non più valido (altro team o livello senza accesso completo) non ha permessi', () => {
    expect(isDirectorOf(teams, 'tech', me('dir-tech', 'viewer_plus', 'pm'))).toBe(false)
    expect(isDirectorOf(teams, 'tech', me('dir-tech', 'viewer', 'tech'))).toBe(false)
  })
  it('chi legge tutto in un team che vede tutto (HR) consuntiva ma non segna né sblocca', () => {
    expect(dayPerms('2026-12-21', me('h', 'viewer_plus', 'hr'), teams, people, a)).toEqual({ mark: false, close: true, unlock: false })
    expect(dayPerms('2026-12-21', me('v', 'viewer', 'hr'), teams, people, a)).toEqual({ mark: false, close: false, unlock: false })
  })
})

describe('parametri degli straordinari', () => {
  it('valori CCNL di default e valori salvati letti dal database', () => {
    expect(DEFAULT_PARAMS).toMatchObject({ otDayFirst: 0.25, otDayFirstHours: 2, otDayNext: 0.3, otNight: 0.5, otHoliday: 0.55, otHolidayNight: 0.75, otNightStart: 22, otNightEnd: 6, otMinHours: 1, otToleranceMin: 10, callFee: 5, hourlyDivisor: 2249 })
    const { data } = normalizeWithReport({ people: [], params: { otHoliday: 0.5, callFee: 'x', otNight: -1 } })
    expect(data.params.otHoliday).toBe(0.5)
    expect(data.params.callFee).toBe(5)
    expect(data.params.otNight).toBe(0.5)
  })
})
