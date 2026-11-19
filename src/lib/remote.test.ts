import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {}, adminCall: vi.fn() }))
const { diff, isEmpty, rowsToData } = await import('./remote')

const base = () => rowsToData(
  [{ id: 'a', name: 'Anna', color: '#2563eb', active: true, sort: 0, team: 'tech' }, { id: 'b', name: 'Bruno', color: '#0d9488', active: true, sort: 1, team: 'pm' }],
  [{ person_id: 'a', availability: 'limitato', max_per_month: 2, unavailable: ['2026-11-10'], preferred_days: [], reserve: false, reserve_order: null },
   { person_id: 'b', availability: 'nessuna', max_per_month: null, unavailable: [], preferred_days: ['2026-11-12'], reserve: true, reserve_order: 1 }],
  [{ person_id: 'a', level: 'B1', ral: 30000, ral_nd: false }, { person_id: 'b', level: 'C2', ral: 0, ral_nd: true }],
  [{ slot_id: '2026-11-24|N', person_id: 'a', pinned: true }],
  ['2026-12-07'],
  { netFN: 55 },
)

describe('database ↔ app', () => {
  it('converte le righe nel modello dell\'app', () => {
    const d = base()
    expect(d.people.map((p) => [p.name, p.level, p.ral, p.availability, p.maxPerMonth])).toEqual([['Anna', 'B1', 30000, 'limitato', 2], ['Bruno', 'C2', 0, 'nessuna', undefined]])
    expect(d.people[0].unavailable).toEqual(['2026-11-10'])
    expect(d.assignments).toEqual({ '2026-11-24|N': 'a' })
    expect(d.pinned).toEqual(['2026-11-24|N'])
    expect(d.excludedDays).toEqual(['2026-12-07'])
    expect(d.params.netFN).toBe(55)
    expect(d.params.netWN).toBe(60) // default per i parametri mancanti
  })
  it('team letto dal database; persona senza riga riservata visibile = dati nascosti', () => {
    const d = rowsToData(
      [{ id: 'a', name: 'Anna', color: '#2563eb', active: true, sort: 0, team: 'tech' }, { id: 'b', name: 'Bruno', color: '#0d9488', active: true, sort: 1, team: 'design' }],
      [], [{ person_id: 'a', level: 'B2', ral: 31000, ral_nd: false }], [], [], {})
    expect(d.people.map((p) => [p.team, !!p.salaryHidden, p.ral])).toEqual([['tech', false, 31000], ['design', true, 0]])
    // le modifiche a una persona nascosta non scrivono mai i dati riservati
    const next = structuredClone(d)
    next.people[1].name = 'Bruno B.'
    const o = diff(d, next)
    expect(o.peopleUpsert.map((r) => r.id)).toEqual(['b'])
    expect(o.privateUpsert).toEqual([])
  })
  it('viewer senza dettagli: valori neutri, nessun dato riservato', () => {
    const d = rowsToData([{ id: 'a', name: 'Anna', color: '#2563eb', active: true, sort: 0, team: 'tech' }], null, null, [], [], undefined)
    expect(d.people[0].ral).toBe(0)
    expect(d.people[0].unavailable ?? []).toEqual([])
  })
  it('riserva letta e riscritta', () => {
    const d = base()
    expect([d.people[1].reserve, d.people[1].reserveOrder]).toEqual([true, 1])
    expect(diff(d, { ...d, people: d.people.map((p) => p.id === 'b' ? { ...p, reserve: false, reserveOrder: undefined } : p) }).detailsUpsert)
      .toMatchObject([{ person_id: 'b', reserve: false, reserve_order: null }])
  })
  it('nessuna modifica → nessuna operazione', () => {
    expect(isEmpty(diff(base(), base()))).toBe(true)
  })
  it('invia solo ciò che è cambiato', () => {
    const prev = base()
    const next = structuredClone(prev)
    next.people[1].ral = 32000
    next.people[1].ralNd = false
    next.assignments['2026-11-26|N'] = 'b'
    delete next.assignments['2026-11-24|N']
    next.pinned = []
    next.excludedDays = []
    const o = diff(prev, next)
    expect(o.peopleUpsert).toEqual([])
    expect(o.detailsUpsert).toEqual([])
    expect(o.privateUpsert.map((d) => [d.person_id, d.ral, d.ral_nd])).toEqual([['b', 32000, false]])
    expect(o.assignmentsUpsert).toEqual([{ slot_id: '2026-11-26|N', person_id: 'b', pinned: false }])
    expect(o.assignmentsDelete).toEqual(['2026-11-24|N'])
    expect(o.excludedRemove).toEqual(['2026-12-07'])
    expect(o.params).toBeUndefined()
  })
  it('blocco/sblocco di un turno aggiorna solo il flag', () => {
    const prev = base()
    const o = diff(prev, { ...prev, pinned: [] })
    expect(o.assignmentsUpsert).toEqual([{ slot_id: '2026-11-24|N', person_id: 'a', pinned: false }])
  })
  it('eliminazione persona', () => {
    const prev = base()
    const o = diff(prev, { ...prev, people: prev.people.filter((p) => p.id !== 'b') })
    expect(o.peopleDelete).toEqual(['b'])
  })
})
