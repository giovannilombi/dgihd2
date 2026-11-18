import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {}, adminCall: vi.fn() }))
const { diff, isEmpty, rowsToData } = await import('./remote')

const base = () => rowsToData(
  [{ id: 'a', name: 'Anna', color: '#2563eb', active: true, sort: 0 }, { id: 'b', name: 'Bruno', color: '#0d9488', active: true, sort: 1 }],
  [{ person_id: 'a', level: 'B1', ral: 30000, availability: 'limitato', max_per_month: 2, unavailable: ['2026-11-10'], preferred_days: [] },
   { person_id: 'b', level: 'C2', ral: 0, availability: 'nessuna', max_per_month: null, unavailable: [], preferred_days: ['2026-11-12'] }],
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
  it('viewer senza dettagli: valori neutri, nessun dato riservato', () => {
    const d = rowsToData([{ id: 'a', name: 'Anna', color: '#2563eb', active: true, sort: 0 }], null, [], [], undefined)
    expect(d.people[0].ral).toBe(0)
    expect(d.people[0].unavailable ?? []).toEqual([])
  })
  it('nessuna modifica → nessuna operazione', () => {
    expect(isEmpty(diff(base(), base()))).toBe(true)
  })
  it('invia solo ciò che è cambiato', () => {
    const prev = base()
    const next = structuredClone(prev)
    next.people[1].ral = 32000
    next.assignments['2026-11-26|N'] = 'b'
    delete next.assignments['2026-11-24|N']
    next.pinned = []
    next.excludedDays = []
    const o = diff(prev, next)
    expect(o.peopleUpsert).toEqual([])
    expect(o.detailsUpsert.map((d) => [d.person_id, d.ral])).toEqual([['b', 32000]])
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
