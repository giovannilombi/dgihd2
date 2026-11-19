import { describe, expect, it } from 'vitest'
import { canEdit, canReadFull, ROLES } from './roles'
import { mySlots, parseTurnistaCalendar, slotCell } from './shiftsView'

const raw = {
  mode: 'own',
  me: { id: 'me1', name: 'ZZ Test', color: '#123456' },
  excluded: ['2026-12-24', 3],
  slots: [
    { slot: '2026-11-29|N', mine: true, name: 'ZZ Test', color: '#123456' },
    { slot: '2026-11-26|N', mine: true, name: 'ZZ Test', color: '#123456' },
    { slot: '2026-11-28|D', mine: false },
    { slot: '2031-01-01|N', mine: false },
    { slot: 42 },
  ],
}

describe('vista Turnista', () => {
  it('valida la risposta del server e scarta le voci non valide', () => {
    const c = parseTurnistaCalendar(raw)
    expect(c.mode).toBe('own')
    expect(c.me?.name).toBe('ZZ Test')
    expect(c.excluded).toEqual(['2026-12-24'])
    expect(Object.keys(c.slots).sort()).toEqual(['2026-11-26|N', '2026-11-28|D', '2026-11-29|N'])
    expect(() => parseTurnistaCalendar(null)).toThrow()
    expect(parseTurnistaCalendar({ mode: 'altro' }).mode).toBe('all')
  })

  it('elenca i propri turni in ordine di data', () => {
    expect(mySlots(parseTurnistaCalendar(raw)).map((s) => s.id)).toEqual(['2026-11-26|N', '2026-11-29|N'])
  })

  it('mostra il proprio turno, il nome, "Turno coperto" o nessuno', () => {
    expect(slotCell({ slot: 'x', mine: true, name: 'ZZ Test' }).text).toBe('Sei di turno')
    expect(slotCell({ slot: 'x', mine: false, name: 'ZZ Altro', color: '#000000' })).toEqual({ tone: 'named', text: 'ZZ Altro', color: '#000000' })
    expect(slotCell({ slot: 'x', mine: false })).toEqual({ tone: 'covered', text: 'Turno coperto' })
    expect(slotCell(undefined).tone).toBe('empty')
  })

  it('il Turnista non legge i dati completi e non modifica', () => {
    expect(ROLES).toContain('turnista')
    expect(canReadFull('turnista')).toBe(false)
    expect(canEdit('turnista')).toBe(false)
    expect(canReadFull('viewer')).toBe(false)
    expect(canReadFull('viewer_plus')).toBe(true)
  })
})
