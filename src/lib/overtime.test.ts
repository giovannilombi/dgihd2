import { describe, expect, it } from 'vitest'
import { bandAt, callFeeText, fmtMinutes, personOvertime, recognizedHours, shiftWindow, splitIntervention } from './overtime'
import { DEFAULT_PARAMS } from './types'

const P = { ...DEFAULT_PARAMS, callFee: 5 } // compenso per intervento di prova (di default è 0)

const iv = (id: string, start: string, end: string) => ({ id, start, end })

describe('ore riconosciute: minimo 1 ora, tolleranza 10 minuti', () => {
  it('arrotonda all\'ora solo oltre la tolleranza', () => {
    expect(recognizedHours(0, P)).toBe(0)
    expect(recognizedHours(25, P)).toBe(1)
    expect(recognizedHours(60, P)).toBe(1)
    expect(recognizedHours(70, P)).toBe(1)
    expect(recognizedHours(71, P)).toBe(2)
    expect(recognizedHours(95, P)).toBe(2)
    expect(recognizedHours(130, P)).toBe(2)
    expect(recognizedHours(131, P)).toBe(3)
  })
})

describe('fasce: giorno di calendario del minuto, sabato feriale, notte 22–06', () => {
  it('classifica i minuti', () => {
    expect(bandAt('2026-11-20T21:59', P)).toBe('ferDay')
    expect(bandAt('2026-11-20T22:00', P)).toBe('ferNight')
    expect(bandAt('2026-11-21T05:59', P)).toBe('ferNight') // sabato
    expect(bandAt('2026-11-21T06:00', P)).toBe('ferDay')
    expect(bandAt('2026-11-22T10:00', P)).toBe('holDay') // domenica
    expect(bandAt('2026-12-08T23:00', P)).toBe('holNight') // Immacolata
    expect(bandAt('2026-12-07T12:00', P)).toBe('holDay') // Sant'Ambrogio (Milano)
  })
  it('notte a cavallo della mezzanotte: l\'arrotondamento va nella fascia in cui finisce', () => {
    // giovedì 19/11 22:40 → venerdì 20/11 00:15: 95' → 2 ore, +25' sul venerdì
    const c = splitIntervention(iv('a', '2026-11-19T22:40', '2026-11-20T00:15'), P)
    expect(c.minutes).toBe(95)
    expect(c.hours).toBe(2)
    expect(c.pieces).toEqual([{ date: '2026-11-19', band: 'ferNight', minutes: 80 }, { date: '2026-11-20', band: 'ferNight', minutes: 40 }])
  })
  it('sabato notte dopo mezzanotte è già domenica (festivo notturno); arrotondamento per difetto', () => {
    // sabato 28/11 23:30 → domenica 29/11 00:40: 70' → 1 ora, -10' dalla fascia finale
    const c = splitIntervention(iv('b', '2026-11-28T23:30', '2026-11-29T00:40'), P)
    expect(c.hours).toBe(1)
    expect(c.byBand).toEqual({ ferDay: 0, ferNight: 30, holDay: 0, holNight: 30 })
  })
  it('intervento breve: minimo un\'ora', () => {
    const c = splitIntervention(iv('c', '2026-11-20T03:10', '2026-11-20T03:35'), P)
    expect(c.hours).toBe(1)
    expect(c.byBand.ferNight).toBe(60)
  })
})

describe('importi: prime 2 ore feriali diurne del giorno al 25%, poi 30%; compenso per intervento', () => {
  const ral = 41000 // valore di prova
  const hourly = ral / P.hourlyDivisor
  it('somma gli interventi del giorno in ordine di orario', () => {
    // lunedì 30/11: 18:30–20:00 (90' → 2 h diurne) e 20:30–21:15 (45' → 1 h diurna) → 2 h al 25%, 1 h al 30%
    const o = personOvertime([iv('y', '2026-11-30T20:30', '2026-11-30T21:15'), iv('x', '2026-11-30T18:30', '2026-11-30T20:00')], ral, P)
    expect(o.items.map((x) => x.id)).toEqual(['x', 'y'])
    expect(o.byRate).toMatchObject({ ferDay1: 120, ferDay2: 60 })
    expect(o.items[0].amount).toBeCloseTo(2 * hourly * 1.25, 6)
    expect(o.items[1].amount).toBeCloseTo(1 * hourly * 1.3, 6)
    expect(o.calls).toBe(2)
    expect(o.callFees).toBe(10)
    expect(o.total).toBeCloseTo(2 * hourly * 1.25 + hourly * 1.3 + 10, 6)
    expect(o.hours).toBe(3)
  })
  it('festivo 55% e notturno festivo 75% dalla prima ora; notturno feriale 50%', () => {
    const o = personOvertime([iv('b', '2026-11-28T23:30', '2026-11-29T00:40')], ral, P)
    expect(o.amount).toBeCloseTo(0.5 * hourly * 1.5 + 0.5 * hourly * 1.75, 6)
  })
  it('senza paga oraria (RAL Q/ o da inserire) solo ore, nessun importo', () => {
    const o = personOvertime([iv('c', '2026-11-20T03:10', '2026-11-20T03:35')], null, P)
    expect(o.hours).toBe(1)
    expect(o.amount).toBeNull()
    expect(o.total).toBeNull()
    expect(o.items[0].amount).toBeNull()
  })
  it('i parametri del blocco B cambiano il calcolo', () => {
    const p = { ...P, otToleranceMin: 0, otMinHours: 0.5, otNightStart: 21 }
    expect(recognizedHours(61, p)).toBe(2)
    expect(recognizedHours(10, { ...p, otToleranceMin: 15 })).toBe(0.5)
    expect(bandAt('2026-11-20T21:30', p)).toBe('ferNight')
  })
})

describe('turni e formati', () => {
  it('finestra del turno', () => {
    expect(shiftWindow('2026-11-19|N')).toEqual({ start: '2026-11-19T18:00', end: '2026-11-20T09:00' })
    expect(shiftWindow('2026-11-22|D')).toEqual({ start: '2026-11-22T09:00', end: '2026-11-22T18:00' })
  })
  it('durate leggibili', () => {
    expect(fmtMinutes(95)).toBe("1 h 35'")
    expect(fmtMinutes(45)).toBe("45'")
    expect(fmtMinutes(120)).toBe('2 h')
  })
})

describe('compenso per intervento', () => {
  it('di default è 0 e nei testi è sempre "eventuale", con il valore impostato', () => {
    expect(DEFAULT_PARAMS.callFee).toBe(0)
    expect(personOvertime([iv('x', '2026-11-30T18:30', '2026-11-30T20:00')], 41000, DEFAULT_PARAMS).callFees).toBe(0)
    expect(callFeeText(0).replace(/\s/g, ' ')).toBe('eventuale compenso per intervento (ad oggi impostato in piattaforma a 0,00 €)')
    expect(callFeeText(5).replace(/\s/g, ' ')).toBe('eventuale compenso per intervento (ad oggi impostato in piattaforma a 5,00 €)')
  })
})
