import { describe, expect, it } from 'vitest'
import { ALL_SLOTS, weekday } from './calendar'
import { baseHourly, saturdayHours, slotEconomics, sundayHours } from './economics'
import { autoFill, checkAssignment, compensationsFor, existingViolations, preferenceWarning } from './rules'
import { parseTeamText, TEMPLATE_CSV } from './team'
import { normalizeWithReport } from './store'
import { buildShiftsPdf, buildShiftsXlsx } from './shiftsExport'
import { pnl } from './reports'
import { DEFAULT_PARAMS as P, type Person } from './types'

const mk = (id: string, ral: number, level: Person['level'] = 'B1'): Person => ({ id, name: id, level, ral, active: true, color: '#000' })
const fn = (d: string) => ({ date: d, kind: 'FN' as const })

describe('modello economico (tabella B1 della specifica)', () => {
  it.each([
    [26000, 11.56, 80.65, 4.05, 108.87],
    [30000, 13.34, 92.59, 4.09, 125.0],
    [34000, 15.12, 92.59, 3.61, 125.0],
    [38000, 16.9, 92.59, 3.23, 125.0],
  ])('RAL %d – notte feriale', (ral, base, ltot, hDom, cost) => {
    const e = slotEconomics(mk('x', ral), fn('2026-11-24'), P)
    expect(baseHourly(ral)).toBeCloseTo(base, 2)
    expect(e.ltot).toBeCloseTo(ltot, 2)
    expect(sundayHours(e.lcomp, ral, P)).toBeCloseTo(hDom, 2)
    expect(e.cost).toBeCloseTo(cost, 2)
  })

  it('festivo notte RAL 30k: lordo 111,11 / 4,70h dom', () => {
    const e = slotEconomics(mk('x', 30000), { date: '2026-11-29', kind: 'WN' }, P)
    expect(e.ltot).toBeCloseTo(111.11, 2)
    expect(sundayHours(e.lcomp, 30000, P)).toBeCloseTo(4.7, 2)
  })

  it('sabato a scaglioni: le prime 2h a +25%, poi +30%', () => {
    const base = baseHourly(30000)
    expect(saturdayHours(2 * base * 1.25, 30000, P)).toBeCloseTo(2, 6)
    expect(saturdayHours(2 * base * 1.25 + base * 1.3, 30000, P)).toBeCloseTo(3, 6)
  })
})

describe('calendario', () => {
  it('festivi e slot', () => {
    expect(weekday('2026-11-01')).toBe(0)
    expect(ALL_SLOTS.filter((s) => s.date === '2026-12-07')).toHaveLength(2) // Sant'Ambrogio lunedì
    expect(ALL_SLOTS.filter((s) => s.date === '2026-12-09')).toHaveLength(1)
  })
})

describe('motore vincoli', () => {
  const a = mk('a', 38000)
  it('R1 stesso giorno', () => {
    expect(checkAssignment(a, '2026-11-28|N', { '2026-11-28|D': 'a' }, P).map((v) => v.rule)).toContain('R1')
  })
  it('R2 ponte venerdì notte → sabato diurno', () => {
    expect(checkAssignment(a, '2026-11-28|D', { '2026-11-27|N': 'a' }, P).map((v) => v.rule)).toContain('R2')
  })
  it('R3 terzo turno in settimana', () => {
    const r = checkAssignment(a, '2026-11-27|N', { '2026-11-23|N': 'a', '2026-11-25|N': 'a' }, P).map((v) => v.rule)
    expect(r).toContain('R3')
  })
  it('R3cap: RAL 26k con due notti feriali supera 8h', () => {
    const r = checkAssignment(mk('b', 26000), '2026-11-25|N', { '2026-11-23|N': 'b' }, P).map((v) => v.rule)
    expect(r).toContain('R3cap')
  })
  it('R4 quinto turno nel mese', () => {
    const asg = { '2026-11-02|N': 'a', '2026-11-09|N': 'a', '2026-11-16|N': 'a', '2026-11-23|N': 'a' }
    expect(checkAssignment(a, '2026-11-30|N', asg, P).map((v) => v.rule)).toContain('R4')
  })
  it('R5 weekend in settimane consecutive', () => {
    expect(checkAssignment(a, '2026-11-21|D', { '2026-11-15|D': 'a' }, P).map((v) => v.rule)).toContain('R5')
    expect(checkAssignment(a, '2026-11-28|D', { '2026-11-15|D': 'a' }, P)).toEqual([])
  })
  it('spostamento al sabato se turno il lunedì successivo', () => {
    const c = compensationsFor(a, { '2026-11-25|N': 'a', '2026-11-30|N': 'a' }, P)
    expect(c[0].day).toBe('sab')
    expect(c[0].dayDate).toBe('2026-11-28')
    expect(c[1].day).toBe('dom')
  })
  it('sabato + lunedì successivo → domenica successiva', () => {
    const c = compensationsFor(a, { '2026-11-07|D': 'a', '2026-11-09|N': 'a' }, P)
    const w1 = c.find((x) => x.week === '2026-11-02')!
    // la domenica 15 ospita anche le ore della settimana del 9 → somma entro il cap (RAL 38k)
    expect(w1.relocated).toBe('next')
    expect(w1.dayDate).toBe('2026-11-15')
    expect(w1.warning).toBeUndefined()
    expect(w1.dayTotal).toBeLessThanOrEqual(8)
  })
  it('domenica successiva occupata → domenica precedente nello stesso mese', () => {
    // turno domenica 22 rende indisponibile la domenica 22; settimana del 9: sab 14 + lun 16
    const c = compensationsFor(a, { '2026-11-14|D': 'a', '2026-11-16|N': 'a', '2026-11-22|D': 'a' }, P)
    const w = c.find((x) => x.week === '2026-11-09')!
    expect(w.relocated).toBe('prev')
    expect(w.dayDate).toBe('2026-11-08')
  })
  it('nessuna domenica disponibile → R6 blocca il turno', () => {
    // RAL 34k: lun 2 + sab 7 (7,01 h) ; lun 9 → dom 15 ha già 3,61 h → 10,62 h; dom 1 a contatto con lun 2
    const r = checkAssignment(mk('c', 34000), '2026-11-09|N', { '2026-11-02|N': 'c', '2026-11-07|D': 'c' }, P).map((v) => v.rule)
    expect(r).toContain('R6')
  })
  it('auto-compila senza violazioni', () => {
    const team = Array.from({ length: 14 }, (_, i) => mk(`p${i}`, 26000 + i * 2500))
    const res = autoFill(team, {}, P, '2026-11-01', '2026-12-31')
    expect(Object.keys(res).length).toBeGreaterThan(60)
    expect(existingViolations(team, res, P)).toEqual({})
    expect(pnl(team, res, P).total.marginPct).toBeGreaterThan(50)
  })
})

describe('import team – robustezza', () => {
  it('colonne in ordine diverso riconosciute dall\'intestazione', () => {
    const r = parseTeamText('RAL;Nome e cognome;Livello\n"32.000,00";Mario Rossi;Liv. B1')
    expect(r.people).toMatchObject([{ name: 'Mario Rossi', level: 'B1', ral: 32000, active: true }])
  })
  it('intestazione senza colonna RAL → errore bloccante', () => {
    expect(parseTeamText('Nome;Livello;Email\nMario;B1;m@x.it').fatal).toMatch(/RAL/)
  })
  it('CSV a caso → nessuna riga, errore bloccante', () => {
    const r = parseTeamText('id,prodotto,prezzo\n1,mela,0.5\n2,pera,0.7')
    expect(r.people).toHaveLength(0)
    expect(r.fatal).toBeTruthy()
  })
  it('file Excel binario → errore bloccante', () => {
    expect(parseTeamText('PK\u0003\u0004xxxx').fatal).toMatch(/Excel/)
  })
  it('RAL fuori range e duplicati', () => {
    const r = parseTeamText('Nome;Livello;RAL\nA;B1;300\nB;B1;30000\nB;C1;31000')
    expect(r.errors[0]).toMatch(/fuori/)
    expect(r.people).toHaveLength(2)
    expect(r.warnings).toHaveLength(1)
  })
  it('template scaricabile è importabile', () => {
    expect(parseTeamText(TEMPLATE_CSV).people).toHaveLength(4)
  })
})

describe('import configurazione JSON', () => {
  it('scarta dati non validi senza rompere', () => {
    const { data, warnings } = normalizeWithReport({ people: [{ id: 'a', name: 'X', level: 'B1', ral: 30000 }, { name: 1 }, 5], assignments: { '2026-11-24|N': 'a', 'foo': 'a', '2026-11-25|N': 'zzz' }, params: { netFN: 'abc', capHours: 7 } })
    expect(data.people).toHaveLength(1)
    expect(data.assignments).toEqual({ '2026-11-24|N': 'a' })
    expect(data.params.netFN).toBe(50)
    expect(data.params.capHours).toBe(7)
    expect(warnings).toHaveLength(2)
  })
  it('JSON estraneo → errore chiaro', () => {
    expect(() => normalizeWithReport({ foo: 1 })).toThrow(/people/)
    expect(() => normalizeWithReport([1, 2])).toThrow()
  })
})

describe('export turni Excel', () => {
  it('genera un xlsx leggibile senza dati economici', async () => {
    const ExcelJS = (await import('exceljs')).default
    const team = [mk('a', 30000), mk('b', 34000)]
    const buf = await buildShiftsXlsx(team, { '2026-11-24|N': 'a', '2026-11-28|D': 'b' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet('Calendario turni')!
    const values = ws.getSheetValues().flat().filter(Boolean).map(String)
    expect(values).toContain('a')
    expect(values.some((v) => /€|RAL|costo/i.test(v))).toBe(false)
    expect(wb.getWorksheet('Turni per persona')!.getRow(2).getCell(4).value).toBe(1)
  })
})

describe('giorni non richiesti', () => {
  it('auto-compila e P&L ignorano i giorni bloccati', () => {
    const team = Array.from({ length: 14 }, (_, i) => mk(`p${i}`, 26000 + i * 2500))
    const blocked = ['2026-11-24', '2026-11-28']
    const res = autoFill(team, {}, P, '2026-11-01', '2026-12-31', blocked)
    expect(Object.keys(res).some((sid) => blocked.includes(sid.slice(0, 10)))).toBe(false)
    const full = pnl(team, res, P).total.slotsTotal
    expect(pnl(team, res, P, blocked).total.slotsTotal).toBe(full - 3)
  })
  it('import JSON rimuove turni sui giorni bloccati', () => {
    const { data } = normalizeWithReport({ people: [{ id: 'a', name: 'X', level: 'B1', ral: 30000 }], assignments: { '2026-11-24|N': 'a' }, excludedDays: ['2026-11-24', 'xx'] })
    expect(data.excludedDays).toEqual(['2026-11-24'])
    expect(data.assignments).toEqual({})
  })
})

describe('disponibilità', () => {
  const vol = { ...mk('v', 30000), availability: 'volontario' as const }
  const lim = { ...mk('l', 30000), availability: 'limitato' as const, maxPerMonth: 1 }
  const non = mk('n', 30000)
  it('auto-compila: volontari prima, limite rispettato', () => {
    const res = autoFill([non, lim, vol], {}, P, '2026-11-01', '2026-12-31')
    const count = (id: string, m: string) => Object.entries(res).filter(([sid, pid]) => pid === id && sid.startsWith(m)).length
    expect(count('v', '2026-11')).toBe(4)
    expect(count('l', '2026-11')).toBeLessThanOrEqual(1)
    expect(count('l', '2026-12')).toBeLessThanOrEqual(1)
  })
  it('avviso oltre disponibilità, non bloccante', () => {
    const asg = { '2026-11-03|N': 'l' }
    expect(preferenceWarning(lim, '2026-11-10|N', asg)).toMatch(/max 1/)
    expect(checkAssignment(lim, '2026-11-10|N', asg, P)).toEqual([])
    expect(preferenceWarning(vol, '2026-11-10|N', asg)).toBeUndefined()
  })
  it('import colonna Disponibilità', () => {
    const r = parseTeamText(TEMPLATE_CSV)
    expect(r.people.map((x) => [x.availability, x.maxPerMonth, x.active])).toEqual([
      ['volontario', undefined, true], ['limitato', 2, true], ['nessuna', undefined, true], ['nessuna', undefined, false],
    ])
    expect(parseTeamText('Nome;Livello;RAL;Disponibilità\nA;B1;30000;forse').warnings[0]).toMatch(/non riconosciuta/)
  })
})

describe('export turni PDF', () => {
  it('genera un PDF valido', async () => {
    const buf = await buildShiftsPdf([mk('a', 30000)], { '2026-11-24|N': 'a' }, ['2026-11-25'])
    const head = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5))
    expect(head).toBe('%PDF-')
  })
})

describe('import team', () => {
  it('Excel/CSV con intestazione e RAL italiana', () => {
    const r = parseTeamText('Nome\tLivello\tRAL\nMario Rossi\tb1\t26.000\nAnna Bianchi\tC2\t31.500,00\nX\tZZ\t1')
    expect(r.people).toMatchObject([
      { name: 'Mario Rossi', level: 'B1', ral: 26000, active: true },
      { name: 'Anna Bianchi', level: 'C2', ral: 31500, active: true },
    ])
    expect(r.errors).toHaveLength(1)
  })
})
