import { describe, expect, it } from 'vitest'
import { describeActivity, describeData, describePlanChange, groupBySlot, groupSteps, laterSessions, restorePreview, type DataChange, type PlanChange, type PlanSession } from './history'
import { DEFAULT_TEAMS } from './teams'

const ses = (id: number, userId: string | null, userName: string, startedAt: string): PlanSession =>
  ({ id, userId, userName, startedAt, lastAt: startedAt, closed: false, restoreOf: null, changes: 1 })
let n = 0
const ch = (sessionId: number, at: string, kind: PlanChange['kind'], slot: string | null, o: string | null, nw: string | null, day = slot?.slice(0, 10) ?? '2026-11-30'): PlanChange =>
  ({ id: ++n, sessionId, at, kind, slot, day, oldPerson: o, newPerson: nw, oldName: o ? `Nome ${o}` : null, newName: nw ? `Nome ${nw}` : null })

describe('storico dei turni', () => {
  const sessions = [ses(1, 'u1', 'Paolo', '2026-11-26T09:00:00Z'), ses(2, 'u2', 'Laura', '2026-11-26T09:10:00Z'), ses(3, 'u1', 'Paolo', '2026-11-26T11:00:00Z')]

  it('descrive ogni modifica in chiaro', () => {
    expect(describePlanChange(ch(1, '2026-11-26T09:00:00Z', 'replace', '2026-11-30|N', 'a', 'b'))).toBe('Lun 30 Nov · Notte: Nome a → Nome b')
    expect(describePlanChange(ch(1, '2026-11-26T09:00:00Z', 'assign', '2026-11-28|D', null, 'b'))).toBe('Sab 28 Nov · Diurno: assegnato a Nome b')
    expect(describePlanChange({ ...ch(1, '2026-11-26T09:00:00Z', 'unassign', '2026-11-30|N', 'x', null), oldName: null })).toBe('Lun 30 Nov · Notte: tolto (era persona eliminata)')
    expect(describePlanChange(ch(1, '2026-11-26T09:00:00Z', 'exclude', null, null, null, '2026-12-01'))).toBe('Mar 1 Dic: giorno segnato come non richiesto')
  })

  it('passaggi: le modifiche salvate insieme stanno in un unico passaggio', () => {
    const steps = groupSteps([
      ch(1, '2026-11-26T09:00:00Z', 'assign', '2026-11-30|N', null, 'a'),
      ch(1, '2026-11-26T09:00:02Z', 'pin', '2026-11-30|N', null, 'a'),
      ch(1, '2026-11-26T09:27:00Z', 'replace', '2026-11-30|N', 'a', 'b'),
    ])
    expect(steps.map((s) => s.changes.length)).toEqual([2, 1])
  })

  it('per turno: stessa persona entro 30 minuti in una voce; altra persona o pausa più lunga in voci separate', () => {
    const slot = '2026-11-30|N'
    const h = groupBySlot([
      ch(1, '2026-11-26T09:00:00Z', 'assign', slot, null, 'a'),
      ch(1, '2026-11-26T09:20:00Z', 'replace', slot, 'a', 'b'),
      ch(2, '2026-11-26T09:25:00Z', 'replace', slot, 'b', 'c'),
      ch(3, '2026-11-26T11:00:00Z', 'replace', slot, 'c', 'a'),
      ch(1, '2026-11-26T09:05:00Z', 'exclude', null, null, null, '2026-12-08'),
    ], sessions)
    const s = h.find((x) => x.slot === slot)!
    expect(s.entries.map((e) => [e.userName, e.changes.length])).toEqual([['Paolo', 2], ['Laura', 1], ['Paolo', 1]])
    expect(h.find((x) => x.slot === null)?.day).toBe('2026-12-08')
  })

  it('ripristino: annulla anche le sessioni iniziate dopo', () => {
    expect(laterSessions(sessions, sessions[0]).map((s) => s.id)).toEqual([2, 3])
    expect(laterSessions(sessions, sessions[2])).toEqual([])
  })

  it('anteprima del ripristino: cosa cambia, giorni erogati e persone eliminate esclusi', () => {
    const p = restorePreview(
      { assignments: { '2026-11-26|N': 'x', '2026-11-27|N': 'b', '2026-11-28|D': 'a', '2026-11-29|N': 'a' }, pinned: ['2026-11-28|D'], excludedDays: ['2026-12-08'] },
      { a: { '2026-11-26|N': { p: 'y', pin: false }, '2026-11-27|N': { p: 'a', pin: false }, '2026-11-28|D': { p: 'a', pin: false }, '2026-11-30|N': { p: 'gone', pin: false } }, x: ['2026-12-07'] },
      new Set(['2026-11-26']), new Set(['a', 'b', 'x', 'y']),
    )
    expect(p.slots).toEqual([
      { slot: '2026-11-27|N', from: 'b', to: 'a', pinFrom: false, pinTo: false },
      { slot: '2026-11-28|D', from: 'a', to: 'a', pinFrom: true, pinTo: false },
      { slot: '2026-11-29|N', from: 'a', to: null, pinFrom: false, pinTo: false },
    ])
    expect(p.lockedSlots).toEqual(['2026-11-26|N'])
    expect(p.missing).toEqual(['2026-11-30|N'])
    expect(p.exclude).toEqual(['2026-12-07'])
    expect(p.include).toEqual(['2026-12-08'])
  })
})

describe('storico dei dati', () => {
  const ctx = { teams: DEFAULT_TEAMS, personName: (id: string) => (id === 'p1' ? 'Mario Rossi' : undefined) }
  const dc = (over: Partial<DataChange>): DataChange => ({ id: 1, at: '2026-11-26T09:00:00Z', userName: 'Paolo', area: 'anagrafica', action: 'update', targetId: 'p1', targetName: 'Mario Rossi', changes: {}, restricted: false, ...over })

  it('parametri con etichette, unità e tabella indennità cella per cella', () => {
    const d = describeData(dc({
      area: 'parametri', targetName: 'Parametri', changes: {
        netFN: [50, 55], otNight: [0.5, 0.6], otNightStart: [22, 21],
        indemnity: [{ g1: { feriale: 5.87, sabato: 8.83, domenica: 9.55 } }, { g1: { feriale: 5.87, sabato: 9, domenica: 9.55 } }],
      },
    }), ctx)
    expect(d.lines).toEqual([
      'Netto di riferimento, notte feriale: 50,00 € → 55,00 €',
      'Straordinario notturno feriale: 50% → 60%',
      'Inizio fascia notturna: 22:00 → 21:00',
      'Indennità CCNL livelli D1, D2, C1, sabato: 8,83 → 9',
    ])
  })

  it('anagrafica e account in chiaro; ferie come giorni aggiunti e tolti', () => {
    const d = describeData(dc({ changes: { availability: ['nessuna', 'volontario'], team: ['tech', 'design'], unavailable: [['2026-12-01'], ['2026-12-01', '2026-12-02']] } }), ctx)
    expect(d.title).toBe('Modificata la risorsa Mario Rossi')
    expect(d.lines).toEqual(['Disponibilità: nessuna preferenza → volontario', 'Team: Tech → Design', 'Giorni non disponibile: aggiunti Mer 2 Dic'])
    const a = describeData(dc({ area: 'account', targetName: 'Laura', changes: { role: ['pm', 'director'], person_id: [null, 'p1'] } }), ctx)
    expect(a.lines).toEqual(['Profilo: PM → Director', 'Scheda collegata: — → Mario Rossi'])
    const ins = describeData(dc({ action: 'insert', changes: { name: [null, 'Mario Rossi'], active: [null, true] } }), ctx)
    expect(ins).toEqual({ title: 'Aggiunta la risorsa Mario Rossi', lines: ['Nome: Mario Rossi', 'In rotazione: sì'] })
  })

  it('livello e RAL: solo quali campi, mai i valori', () => {
    const d = describeData(dc({ restricted: true, changes: { ral: true, level: true } }), ctx)
    expect(d.title).toBe('Mario Rossi: livello o RAL modificati')
    expect(d.lines.join(' ')).not.toMatch(/\d/)
  })
})

describe('attività', () => {
  it('giorni e interventi in chiaro, con motivo e orari', () => {
    const base = { key: 'k', at: '2026-11-26T09:00:00Z', userName: 'Paolo', day: '2026-11-30', slot: '2026-11-30|N', personName: 'Mario Rossi', start: '2026-11-30T23:30', end: '2026-12-01T00:40', note: null }
    expect(describeActivity({ ...base, kind: 'erogato', slot: null }).title).toBe('Giorno segnato erogato: Lun 30 Nov')
    expect(describeActivity({ ...base, kind: 'sblocco_erogato', slot: null, note: 'turno scambiato' }).detail).toBe('Motivo: turno scambiato')
    expect(describeActivity({ ...base, kind: 'iv_rejected', note: 'manca il ticket' })).toEqual({
      title: 'Intervento rifiutato', detail: 'Mario Rossi · turno Lun 30 Nov · Notte 23:30–Mar 1 Dic 00:40 · motivo: manca il ticket',
    })
  })
})
