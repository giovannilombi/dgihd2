import { describe, expect, it } from 'vitest'
import { canEdit, canReadFull, ROLES } from './roles'
import { mySlots, parseTurnistaCalendar, slotCell } from './shiftsView'
import { DEFAULT_TEAMS } from './teams'

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
    expect(canReadFull('hr')).toBe(true)
    expect(canReadFull('pm')).toBe(false)
    expect(canEdit('hr')).toBe(false)
    expect(canEdit('director')).toBe(true)
  })
})

describe('cosa vede ogni livello (conferma dei cambi di livello)', () => {
  it('le RAL dipendono da livello e team, come nel database', async () => {
    const { roleAccess } = await import('./roles')
    expect(roleAccess('director', 'tech', DEFAULT_TEAMS).ral).toBe('team')
    expect(roleAccess('director', 'tech', DEFAULT_TEAMS).ralText).toMatch(/team Tech/)
    expect(roleAccess('governance', 'governance', DEFAULT_TEAMS).ral).toBe('all')
    expect(roleAccess('hr', 'hr', DEFAULT_TEAMS).ral).toBe('all')
    expect(roleAccess('hr', null, DEFAULT_TEAMS).ral).toBe('all')
    expect(roleAccess('director', null, DEFAULT_TEAMS).ral).toBe('none')
    expect(roleAccess('pm', 'pm', DEFAULT_TEAMS).ral).toBe('none')
    expect(roleAccess('pm', 'pm', DEFAULT_TEAMS).sees.join(' ')).toMatch(/Approva e rifiuta gli interventi di tutti i team/)
    expect(roleAccess('super_admin', 'tech', DEFAULT_TEAMS).managesUsers).toBe(true)
  })
  it('Viewer e Turnista non vedono RAL qualunque sia il team', async () => {
    const { roleAccess } = await import('./roles')
    for (const t of ['tech', 'hr', 'governance', null] as const) {
      expect(roleAccess('turnista', t, DEFAULT_TEAMS).ral).toBe('none')
      expect(roleAccess('viewer', t, DEFAULT_TEAMS).ral).toBe('none')
    }
    expect(roleAccess('turnista', 'tech', DEFAULT_TEAMS, 'own').sees.join(' ')).toMatch(/Turno coperto/)
    expect(roleAccess('turnista', 'tech', DEFAULT_TEAMS, 'all').sees.join(' ')).toMatch(/nomi/)
  })
  it('ordina i livelli dal più ampio al più ristretto', async () => {
    const { roleRank } = await import('./roles')
    expect(['turnista', 'super_admin', 'viewer', 'director', 'pm', 'hr'].sort((a, b) => roleRank(a as never) - roleRank(b as never))).toEqual(['super_admin', 'director', 'hr', 'pm', 'viewer', 'turnista'])
  })
})

describe('visibilità dei Turnisti (generale, per persona)', () => {
  it('l\'impostazione generale vale per tutti; "per persona" usa la Visibilità di ciascuno', async () => {
    const { effectiveNames, parseNamesSetting } = await import('./shiftsView')
    expect(effectiveNames('all', 'own')).toBe('all')
    expect(effectiveNames('own', 'all')).toBe('own')
    expect(effectiveNames('per_user', 'all')).toBe('all')
    expect(effectiveNames('per_user', 'own')).toBe('own')
    expect(effectiveNames('per_user', undefined)).toBe('own') // in assenza di scelta: solo i propri
    expect(parseNamesSetting('per_user')).toBe('per_user')
    expect(parseNamesSetting('qualcosa')).toBe('all')
  })
})
