import { describe, expect, it } from 'vitest'
import { accountFor, canCreateAccount, createTurnistaAccounts, type AccountInfo } from './accounts'
import { detailsRow, diff, rowsToData } from './mapping'
import { normalizeWithReport } from './store'
import type { Person } from './types'

const person = (id: string, email?: string): Person => ({ id, name: `ZZ ${id}`, level: 'B1', ral: 30000, active: true, color: '#000000', email })
const account = (id: string, email: string, extra: Partial<AccountInfo> = {}): AccountInfo => ({
  id, email, display_name: id, role: 'turnista', team: null, must_change_password: false, created_at: '2026-11-19', last_sign_in_at: null, ...extra,
})

describe('account delle risorse', () => {
  it('riconosce l\'account dal collegamento esplicito, altrimenti dall\'email', () => {
    const accounts = [account('u1', 'ZZ.Uno@Esempio.it'), account('u2', 'altro@esempio.it', { person_id: 'p2', role: 'editor' })]
    expect(accountFor(person('p1', 'zz.uno@esempio.it'), accounts)?.id).toBe('u1')
    expect(accountFor(person('p2', 'diversa@esempio.it'), accounts)?.id).toBe('u2')
    expect(accountFor(person('p3', 'nessuno@esempio.it'), accounts)).toBeUndefined()
    expect(accountFor(person('p4'), accounts)).toBeUndefined()
  })

  it('si crea l\'account solo a chi ha l\'email e non ne ha già uno', () => {
    const accounts = [account('u1', 'zz.uno@esempio.it')]
    expect(canCreateAccount(person('p1', 'zz.uno@esempio.it'), accounts)).toBe(false)
    expect(canCreateAccount(person('p2', 'zz.due@esempio.it'), accounts)).toBe(true)
    expect(canCreateAccount(person('p3'), accounts)).toBe(false)
  })

  it('la creazione in blocco prosegue anche se una persona dà errore', async () => {
    const people = [person('a', 'a@esempio.it'), person('b', 'b@esempio.it'), person('c', 'c@esempio.it')]
    const r = await createTurnistaAccounts(people, async (p) => {
      if (p.id === 'b') throw new Error('Esiste già un account con questa email.')
      return { name: p.name, email: p.email as string, password: 'zz-test-00' }
    })
    expect(r.created.map((c) => c.email)).toEqual(['a@esempio.it', 'c@esempio.it'])
    expect(r.errors).toEqual(['ZZ b: Esiste già un account con questa email.'])
  })
})

describe('email della risorsa', () => {
  it('viene normalizzata (minuscolo, senza spazi) e scartata se non valida', () => {
    const { data } = normalizeWithReport({ people: [
      { id: 'a', name: 'A', level: 'B1', ral: 30000, email: ' ZZ.A@Esempio.IT ' },
      { id: 'b', name: 'B', level: 'B1', ral: 30000, email: 'non-una-email' },
    ] })
    expect(data.people[0].email).toBe('zz.a@esempio.it')
    expect(data.people[1].email).toBeUndefined()
  })

  it('viaggia con la scheda: letta dal database e salvata quando cambia', () => {
    const d = rowsToData(
      [{ id: 'a', name: 'A', color: '#000000', active: true, sort: 0, team: 'tech' }],
      [{ person_id: 'a', availability: 'nessuna', max_per_month: null, unavailable: [], preferred_days: [], reserve: false, reserve_order: null, email: 'zz.a@esempio.it' }],
      [], [], [], {},
    )
    expect(d.people[0].email).toBe('zz.a@esempio.it')
    expect(detailsRow(d.people[0]).email).toBe('zz.a@esempio.it')
    const next = { ...d, people: [{ ...d.people[0], email: 'zz.nuova@esempio.it' }] }
    expect(diff(d, next).detailsUpsert).toEqual([expect.objectContaining({ person_id: 'a', email: 'zz.nuova@esempio.it' })])
    expect(diff(d, d).detailsUpsert).toEqual([])
  })
})
