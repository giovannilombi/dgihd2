import { describe, expect, it } from 'vitest'
import { ALL_SLOTS, daysInRange, toRanges, weekday } from './calendar'
import { baseHourly, calcRal, saturdayHours, slotEconomics, sundayHours } from './economics'
import { autoFill, checkAssignment, compensationsFor, existingViolations, preferenceWarning, regenerate } from './rules'
import { parseTeamText, TEMPLATE_CSV } from './team'
import { normalizeWithReport, renumberReserves } from './store'
import { buildShiftsPdf, buildShiftsXlsx, shiftCalendar, shiftsByPerson } from './shiftsExport'
import { exportableMonths, exportFileName, validateRange } from './exportRange'
import { fullReportCsv, payroll, pnl } from './reports'
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
    const ws2 = wb.getWorksheet('Turni per persona')!
    const totCol = (ws2.getRow(1).values as unknown[]).indexOf('Totale')
    expect(ws2.getRow(2).getCell(totCol).value).toBe(1)
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

describe('turni bloccati', () => {
  it('la rigenerazione mantiene i bloccati e ricalcola gli altri', () => {
    const team = Array.from({ length: 10 }, (_, i) => mk(`p${i}`, 26000 + i * 2500))
    const first = autoFill(team, {}, P, '2026-11-01', '2026-12-31')
    // l'utente cambia a mano un turno e lo blocca
    const manual = { ...first, '2026-11-24|N': 'p9' }
    const res = regenerate(team, manual, P, '2026-11-01', '2026-12-31', [], ['2026-11-24|N'])
    expect(res['2026-11-24|N']).toBe('p9')
    expect(existingViolations(team, res, P)).toEqual({})
  })
  it('i turni non bloccati vengono ricalcolati', () => {
    const team = [mk('a', 30000), mk('b', 30000)]
    const res = regenerate(team, { '2026-11-24|N': 'a', '2026-11-26|N': 'b' }, P, '2026-11-01', '2026-12-31', [], ['2026-11-26|N'])
    expect(res['2026-11-26|N']).toBe('b')
    expect(Object.keys(res).length).toBeGreaterThan(2)
  })
  it('import JSON scarta i blocchi senza assegnazione', () => {
    const { data } = normalizeWithReport({ people: [{ id: 'a', name: 'X', level: 'B1', ral: 30000 }], assignments: { '2026-11-24|N': 'a' }, pinned: ['2026-11-24|N', '2026-11-25|N'] })
    expect(data.pinned).toEqual(['2026-11-24|N'])
  })
})

describe('ferie e giorni di disponibilità', () => {
  it('in ferie la persona non è mai assegnabile (R7), nemmeno dall\'auto-compilazione', () => {
    const ferie = { ...mk('f', 30000), unavailable: daysInRange('2026-11-09', '2026-11-22') }
    expect(checkAssignment(ferie, '2026-11-10|N', {}, P).map((v) => v.rule)).toContain('R7')
    const res = autoFill([ferie, mk('g', 30000)], {}, P, '2026-11-01', '2026-12-31')
    expect(Object.entries(res).some(([sid, pid]) => pid === 'f' && sid >= '2026-11-09' && sid <= '2026-11-22|Z')).toBe(false)
  })
  it('ferie da mercoledì a giovedì: bloccate la notte mar→mer e la notte gio→ven', () => {
    const f = { ...mk('f', 30000), unavailable: ['2026-11-25', '2026-11-26'] }
    const rule = (sid: string) => checkAssignment(f, sid, {}, P).map((v) => v.rule)
    expect(rule('2026-11-24|N')).toContain('R7') // notte prima (mar→mer)
    expect(rule('2026-11-26|N')).toContain('R7') // notte dopo l'ultimo giorno (gio→ven)
    expect(rule('2026-11-23|N')).not.toContain('R7')
    expect(rule('2026-11-27|N')).not.toContain('R7')
  })
  it('ferie da lunedì: bloccata la notte domenica→lunedì ma non il diurno di domenica', () => {
    const f = { ...mk('f', 30000), unavailable: ['2026-11-30'] }
    expect(checkAssignment(f, '2026-11-29|N', {}, P).map((v) => v.rule)).toContain('R7')
    expect(checkAssignment(f, '2026-11-29|D', {}, P).map((v) => v.rule)).not.toContain('R7')
  })
  it('nei giorni indicati come disponibili la persona viene scelta per prima', () => {
    const vol = { ...mk('v', 30000), availability: 'volontario' as const }
    const pref = { ...mk('p', 30000), preferredDays: ['2026-11-24'] }
    const res = autoFill([vol, pref], {}, P, '2026-11-24', '2026-11-24')
    expect(res['2026-11-24|N']).toBe('p')
  })
  it('import JSON: la data in ferie prevale sulla disponibilità', () => {
    const { data } = normalizeWithReport({ people: [{ id: 'a', name: 'X', level: 'B1', ral: 30000, unavailable: ['2026-11-10', 'x'], preferredDays: ['2026-11-10', '2026-11-11'] }] })
    expect(data.people[0].unavailable).toEqual(['2026-11-10'])
    expect(data.people[0].preferredDays).toEqual(['2026-11-11'])
  })
  it('raggruppa le date in periodi', () => {
    expect(toRanges(['2026-11-03', '2026-11-01', '2026-11-02', '2026-11-10'])).toEqual([
      { from: '2026-11-01', to: '2026-11-03', days: 3 }, { from: '2026-11-10', to: '2026-11-10', days: 1 },
    ])
  })
})

describe('RAL non ancora inserita', () => {
  it('persona con RAL 0: importabile, assegnabile, ore non calcolabili', () => {
    const { data } = normalizeWithReport({ people: [{ id: 'z', name: 'Z', level: 'B1', ral: 0 }] })
    expect(data.people).toHaveLength(1)
    const z = data.people[0]
    expect(checkAssignment(z, '2026-11-24|N', { '2026-11-23|N': 'z' }, P).map((v) => v.rule)).not.toContain('R3cap')
    const c = compensationsFor(z, { '2026-11-24|N': 'z' }, P)
    expect(Number.isNaN(c[0].hours)).toBe(true)
    expect(c[0].lcomp).toBeGreaterThan(0)
    const res = autoFill([z], {}, P, '2026-11-01', '2026-11-30')
    expect(Object.keys(res).length).toBeGreaterThan(0)
  })
})

describe('export per periodo', () => {
  it('nome file AAAAMMGG-ARM-HD2-daX_aY', () => {
    expect(exportFileName('csv', { from: '2026-11-01', to: '2026-11-30' }, new Date(2026, 10, 18))).toBe('20261118-ARM-HD2-da20261101_a20261130.csv')
  })
  it('mesi scaricabili e validazione intervallo', () => {
    expect(exportableMonths().map((m) => [m.from, m.to])).toEqual([['2026-11-01', '2026-11-30'], ['2026-12-01', '2026-12-31'], ['2027-01-01', '2027-01-31'], ['2027-02-01', '2027-02-28']])
    expect(validateRange({ from: '2026-12-10', to: '2026-12-01' })).toMatch(/precedente/)
    expect(validateRange({ from: '2026-10-01', to: '2026-12-01' })).toMatch(/periodo pianificato/)
    expect(validateRange({ from: '2026-11-05', to: '2026-11-20' })).toBeUndefined()
  })
  it('turni e report limitati al periodo', () => {
    const team = [mk('a', 30000)]
    const asg = { '2026-11-24|N': 'a', '2026-12-02|N': 'a' }
    const dec = { from: '2026-12-01', to: '2026-12-31' }
    const r = shiftsByPerson(team, asg, dec)[0]
    expect(r.total).toBe(1)
    expect(r.perMonth).toEqual([1])
    const cal = shiftCalendar(team, asg, [], dec)
    expect(cal.map((m) => m.key)).toEqual(['2026-12'])
    const csv = fullReportCsv(team, asg, P, [], dec)
    expect(csv).toContain('Mer 2 Dic')
    expect(csv).not.toContain('Mar 24 Nov')
  })
})

describe('riserve', () => {
  it('usate solo se nessun altro è disponibile, nell\'ordine indicato', () => {
    const regular = mk('r', 38000) // RAL alta: due notti nella stessa settimana restano entro il cap di 8 h
    const res1 = { ...mk('x1', 30000), reserve: true, reserveOrder: 1 }
    const res2 = { ...mk('x2', 30000), reserve: true, reserveOrder: 2 }
    // stesso giorno: la regolare copre il primo slot disponibile, la riserva 1 interviene solo quando la regolare è bloccata
    const out = autoFill([res2, res1, regular], {}, P, '2026-11-23', '2026-11-25')
    expect(out['2026-11-23|N']).toBe('r')
    expect(out['2026-11-24|N']).toBe('x1') // la regolare è bloccata (giorno adiacente): prima la riserva n.1
    expect(out['2026-11-25|N']).toBe('r')
  })
  it('a parità di ordine la scelta è casuale tra le riserve', () => {
    const a = { ...mk('a', 30000), reserve: true, reserveOrder: 1 }
    const b = { ...mk('b', 30000), reserve: true, reserveOrder: 1 }
    expect(autoFill([a, b], {}, P, '2026-11-24', '2026-11-24', [], () => 0.1)['2026-11-24|N']).toBe('a')
    expect(autoFill([a, b], {}, P, '2026-11-24', '2026-11-24', [], () => 0.9)['2026-11-24|N']).toBe('b')
  })
  it('numerazione delle riserve 1..n', () => {
    const ps = renumberReserves([{ ...mk('a', 1), reserve: true, reserveOrder: 5 }, mk('b', 1), { ...mk('c', 1), reserve: true }, { ...mk('d', 1), reserve: true, reserveOrder: 2 }])
    expect(ps.map((p) => [p.id, p.reserveOrder])).toEqual([['a', 2], ['b', undefined], ['c', 3], ['d', 1]])
  })
})

describe('conto economico', () => {
  it('ricavo = giornate richieste × tariffa, anche senza turni coperti; costo solo dei turni assegnati', () => {
    const blocked = ['2026-11-24', '2026-11-29'] // un feriale e una domenica non richiesti
    const novDic = { from: '2026-11-01', to: '2026-12-31' }
    const empty = pnl([mk('a', 30000)], {}, P, blocked, novDic)
    // Nov–Dic 2026: 61 giorni, di cui 20 tra sabati/domeniche/festivi → 41 feriali
    expect(empty.total.ferialiRichiesti).toBe(41 - 1)
    expect(empty.total.festiviRichiesti).toBe(20 - 1)
    expect(empty.total.revenue).toBe(40 * P.revenueFeriale + 19 * P.revenueFestivo)
    expect(empty.total.cost).toBe(0)
    const one = pnl([mk('a', 30000)], { '2026-11-25|N': 'a' }, P, blocked, novDic)
    expect(one.total.revenue).toBe(empty.total.revenue)
    expect(one.total.cost).toBeCloseTo(125, 2)
    expect(one.total.marginPct).toBeCloseTo((one.total.revenue - 125) / one.total.revenue * 100, 6)
  })
  it('ricavo con copertura: feriale coperto conta, sab/dom/festivo solo se h24; margine solo se il periodo è completo', () => {
    const a = mk('a', 38000), b = mk('b', 38000)
    const wk = { from: '2026-11-23', to: '2026-11-29' } // settimana lun 23 – dom 29
    const r1 = pnl([a, b], { '2026-11-24|N': 'a', '2026-11-28|D': 'b' }, P, [], wk).total
    expect(r1.revenueCovered).toBe(P.revenueFeriale) // il sabato ha solo il diurno: non conta
    expect([r1.ferialiCoperti, r1.festiviCoperti]).toEqual([1, 0])
    expect(r1.complete).toBe(false)
    // tutto coperto: margine calcolabile
    const full: Record<string, string> = {}
    for (const s of ALL_SLOTS.filter((x) => x.date >= wk.from && x.date <= wk.to)) full[s.id] = s.date.endsWith('4') || s.date.endsWith('6') || s.date.endsWith('8') ? 'a' : 'b'
    const r2 = pnl([a, b], full, P, [], wk).total
    expect(r2.complete).toBe(true)
    expect(r2.revenueCovered).toBe(r2.revenue)
  })
})

describe('periodo esteso a gennaio–febbraio 2027', () => {
  it('festività di gennaio e calendario fino al 28 febbraio', () => {
    expect(ALL_SLOTS.filter((x) => x.date === '2027-01-06')).toHaveLength(2) // Epifania (mercoledì) → diurno + notte
    expect(ALL_SLOTS.filter((x) => x.date === '2027-01-07')).toHaveLength(1)
    expect(ALL_SLOTS.at(-1)!.date).toBe('2027-02-28')
  })
  it('vincoli a cavallo dell\'anno: max 4 turni nel mese di gennaio', () => {
    const a = mk('a', 38000)
    const asg = { '2027-01-04|N': 'a', '2027-01-11|N': 'a', '2027-01-18|N': 'a', '2027-01-25|N': 'a' }
    expect(checkAssignment(a, '2027-01-27|N', asg, P).map((v) => v.rule)).toContain('R4')
    expect(checkAssignment(a, '2027-02-01|N', asg, P).map((v) => v.rule)).not.toContain('R4')
  })
})

describe('RAL N/D', () => {
  it('nei calcoli usa la RAL media dei parametri, senza toccare la RAL della persona', () => {
    const params = { ...P, ndRal: 41000 } // valore di prova
    const nd = { ...mk('n', 0), ralNd: true }
    expect(calcRal(nd, params)).toBe(41000)
    expect(slotEconomics(nd, { date: '2026-11-24', kind: 'FN' }, params).ltot).toBeCloseTo(slotEconomics(mk('x', 41000), { date: '2026-11-24', kind: 'FN' }, params).ltot, 6)
    const c = compensationsFor(nd, { '2026-11-24|N': 'n' }, params)
    expect(Number.isFinite(c[0].hours)).toBe(true)
  })
  it('senza valore medio nei parametri si comporta come RAL da inserire', () => {
    const nd = { ...mk('n', 0), ralNd: true }
    expect(calcRal(nd, P)).toBe(0)
    expect(Number.isNaN(compensationsFor(nd, { '2026-11-24|N': 'n' }, P)[0].hours)).toBe(true)
  })
  it('import JSON conserva N/D e il valore medio', () => {
    const { data } = normalizeWithReport({ people: [{ id: 'a', name: 'X', level: 'B1', ral: 0, ralNd: true }], params: { ndRal: 41000 } })
    expect(data.people[0].ralNd).toBe(true)
    expect(data.params.ndRal).toBe(41000)
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

describe('consuntivo: dettaglio per giorno', () => {
  it('le righe dei singoli turni sommano ai totali di settimana e mese (CCNL + gettone = totale lordo)', () => {
    const x = mk('x', 30000)
    const a = { '2026-11-23|N': 'x', '2026-11-29|D': 'x', '2026-12-02|N': 'x' }
    const months = payroll([x], a, P)
    for (const m of months) {
      for (const r of m.rows) {
        let iccnl = 0, lcomp = 0, ltot = 0, net = 0
        for (const w of r.weeks) {
          const days = w.slots.map((s) => slotEconomics(x, s, P))
          const sum = (k: 'iccnl' | 'lcomp' | 'ltot' | 'net') => days.reduce((n, e) => n + e[k], 0)
          expect(sum('iccnl')).toBeCloseTo(w.iccnl, 6)
          expect(sum('lcomp')).toBeCloseTo(w.lcomp, 6)
          expect(sum('ltot')).toBeCloseTo(w.ltot, 6)
          expect(sum('net')).toBeCloseTo(w.net, 6)
          for (const e of days) expect(e.iccnl + e.lcomp).toBeCloseTo(e.ltot, 6)
          iccnl += w.iccnl; lcomp += w.lcomp; ltot += w.ltot; net += w.net
        }
        expect(r.totals.iccnl).toBeCloseTo(iccnl, 6)
        expect(r.totals.lcomp).toBeCloseTo(lcomp, 6)
        expect(r.totals.ltot).toBeCloseTo(ltot, 6)
        expect(r.totals.net).toBeCloseTo(net, 6)
      }
    }
  })
})

describe('report CSV: dettaglio per giorno', () => {
  const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').map((l) => l.split(';'))
  it('una riga per turno, poi totale settimana e totale mese', () => {
    const x = mk('x', 30000)
    const csv = fullReportCsv([x], { '2026-11-26|N': 'x', '2026-11-29|D': 'x' }, P)
    const rows = lines(csv).filter((r) => r[1] === 'x')
    expect(rows.map((r) => r[3])).toEqual(['Turno', 'Turno', 'Totale settimana', 'Totale mese'])
    const header = lines(csv).find((r) => r[3] === 'Riga')!
    const col = (name: string) => header.indexOf(name)
    const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'))
    const [t1, t2, week] = rows
    for (const k of ['Indennità CCNL lorda', 'Gettone di disponibilità lordo (preferibile)', 'Lordo totale', 'Netto garantito']) {
      expect(num(t1[col(k)]) + num(t2[col(k)])).toBeCloseTo(num(week[col(k)]), 1)
    }
    expect(num(t1[col('Indennità CCNL lorda')]) + num(t1[col('Gettone di disponibilità lordo (preferibile)')])).toBeCloseTo(num(t1[col('Lordo totale')]), 1)
  })
  it('senza RAL nessun NaN; le persone di altri team non compaiono nel consuntivo', () => {
    const noRal = mk('n', 0)
    const hidden = { ...mk('h', 0), salaryHidden: true }
    const csv = fullReportCsv([noRal, hidden], { '2026-11-24|N': 'n', '2026-11-26|N': 'h' }, P)
    expect(csv).not.toContain('NaN')
    expect(csv).toContain('non calcolabile (RAL da inserire)')
    expect(lines(csv).some((r) => r[1] === 'h')).toBe(false)
  })
})
