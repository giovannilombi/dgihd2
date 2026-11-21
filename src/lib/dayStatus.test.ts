import { describe, expect, it } from 'vitest'
import { dayPerms, dayShiftEnd, dayState, dayStatusMap, lockedSlots, romeNow, romeToday, shiftEnded, shortName, type Me } from './dayStatus'
import { isDirectorOf } from './roles'
import { normalizeWithReport } from './store'
import { DEFAULT_PARAMS, type Person } from './types'

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
  it('si segna erogato dalla fine dell\'ultimo turno assegnato del giorno (ora italiana)', () => {
    // sabato 19/12: diurno 09–18 e notte 18–09 → fine domenica 20/12 alle 09:00
    expect(dayShiftEnd('2026-12-19', a)).toBe('2026-12-20T09:00')
    expect(dayShiftEnd('2026-12-19', { '2026-12-19|D': 't1' })).toBe('2026-12-19T18:00')
    expect(dayShiftEnd('2026-12-22', a)).toBeNull()
    expect(romeNow(new Date('2026-12-20T07:59:00Z'))).toBe('2026-12-20T08:59')
    expect(shiftEnded('2026-12-19', a, new Date('2026-12-20T07:59:00Z'))).toBe(false)
    expect(shiftEnded('2026-12-19', a, new Date('2026-12-20T08:00:00Z'))).toBe(true)
    expect(shiftEnded('2026-12-19', { '2026-12-19|D': 't1' }, new Date('2026-12-19T17:00:00Z'))).toBe(true)
    // ora legale: 09:00 a Roma = 07:00 UTC
    expect(shiftEnded('2026-07-01', { '2026-07-01|N': 't1' }, new Date('2026-07-02T06:59:00Z'))).toBe(false)
    expect(shiftEnded('2026-07-01', { '2026-07-01|N': 't1' }, new Date('2026-07-02T07:00:00Z'))).toBe(true)
  })
  it('nome breve di chi ha segnato', () => {
    expect(shortName('Paolo Gialli')).toBe('P. Gialli')
    expect(shortName('qa.test@example.com')).toBe('qa.test')
    expect(shortName('Mario')).toBe('Mario')
  })
})

describe('permessi sui giorni (stesse regole del database)', () => {
  const me = (id: string, role: Me['role'], team: string | null): Me => ({ id, role, team })
  it('Space admin, Governance e Director segnano erogato e consuntivano; sblocca lo space admin', () => {
    expect(dayPerms('2026-12-21', me('g', 'governance', 'governance'), people, a)).toEqual({ mark: true, close: true, unlock: false })
    expect(dayPerms('2026-12-21', me('s', 'super_admin', null), people, a)).toEqual({ mark: true, close: true, unlock: true })
  })
  it('il Director sblocca solo i giorni con un turno del suo team', () => {
    const d = me('d', 'director', 'tech')
    expect(isDirectorOf('tech', d)).toBe(true)
    expect(dayPerms('2026-12-19', d, people, a)).toEqual({ mark: true, close: true, unlock: true })
    expect(dayPerms('2026-12-21', d, people, a)).toEqual({ mark: true, close: true, unlock: false })
  })
  it('lo Space admin assegnato a un team ne è il capo', () => {
    expect(isDirectorOf('pm', me('s', 'super_admin', 'pm'))).toBe(true)
    expect(isDirectorOf('tech', me('s', 'super_admin', 'pm'))).toBe(false)
  })
  it('è Director di un team solo con profilo Director e quel team', () => {
    expect(isDirectorOf('tech', me('d', 'director', 'pm'))).toBe(false)
    expect(isDirectorOf('tech', me('d', 'governance', 'tech'))).toBe(false)
    expect(isDirectorOf(null, me('d', 'director', null))).toBe(false)
  })
  it('HR consuntiva ma non segna né sblocca; PM e Viewer nessuna azione', () => {
    expect(dayPerms('2026-12-21', me('h', 'hr', 'hr'), people, a)).toEqual({ mark: false, close: true, unlock: false })
    expect(dayPerms('2026-12-21', me('p', 'pm', 'pm'), people, a)).toEqual({ mark: false, close: false, unlock: false })
    expect(dayPerms('2026-12-21', me('v', 'viewer', 'hr'), people, a)).toEqual({ mark: false, close: false, unlock: false })
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
