import { describe, expect, it } from 'vitest'
import { dayStatusMap } from './dayStatus'
import { buildHoursPdf, buildHoursReport, buildHoursXlsx, hoursFileName, periodText, rangePeriod, shiftCategory, zipFiles } from './hoursReport'
import type { Intervention } from './interventions'
import { payPeriods } from './payrollExport'
import { DEFAULT_TEAMS } from './teams'
import { DEFAULT_PARAMS as P, type Person } from './types'

// nessun dato retributivo: le persone arrivano come per chi non ha la vista completa
const person = (id: string, team: string): Person =>
  ({ id, name: id, email: `${id}@example.com`, level: 'B1', ral: 0, active: true, color: '#000', team, salaryHidden: true })
const a = person('a', 'tech'), b = person('b', 'pm')
const assignments = {
  '2026-11-27|N': 'a', // venerdì: feriale notturno
  '2026-11-28|D': 'a', // sabato diurno
  '2026-11-28|N': 'b', // sabato notturno
  '2026-11-29|D': 'b', // domenica diurno
  '2026-11-29|N': 'a', // domenica notturno
  '2026-11-30|N': 'a', // lunedì, giorno non ancora erogato
  '2026-12-07|D': 'b', // lunedì festivo (Sant'Ambrogio)
}
const erog = (day: string, closed = false) => ({ day, erogato_at: '2026-12-01T08:00:00Z', erogato_by_name: 'x', consuntivato_at: closed ? '2026-12-02T08:00:00Z' : null, consuntivato_by_name: closed ? 'y' : null })
const days = dayStatusMap([erog('2026-11-27'), erog('2026-11-28'), erog('2026-11-29', true), erog('2026-12-07')])
const iv = (id: string, personId: string, slot: string, start: string, end: string, status: Intervention['status'] = 'approved'): Intervention =>
  ({ id, slot, personId, start, end, note: null, status, rejectReason: null, resendComment: null, decidedByName: null, decidedAt: null })
const interventions = [
  iv('z', 'a', '2026-11-27|N', '2026-11-27T18:30', '2026-11-27T20:00'), // 90' → 2 h feriali diurne
  iv('w', 'a', '2026-11-27|N', '2026-11-27T20:30', '2026-11-27T21:15'), // 45' → 1 h: oltre le prime 2 h del giorno
  iv('p', 'a', '2026-11-27|N', '2026-11-28T03:00', '2026-11-28T03:20', 'pending'),
  iv('y', 'b', '2026-11-28|N', '2026-11-28T23:00', '2026-11-29T01:00'), // sabato → domenica
  iv('x', 'a', '2026-11-29|N', '2026-11-29T23:30', '2026-11-30T00:40'), // domenica → lunedì
]
const input = { people: [a, b], assignments, params: P, days, interventions, noInt: new Set(['2026-11-28|D']), now: '2026-12-31T12:00' }
const { months } = payPeriods()
const nov = months.find((m) => m.key === '2026-11')!
const dec = months.find((m) => m.key === '2026-12')!

describe('riepilogo per le paghe senza importi', () => {
  it('categorie: tipo di turno e giorno di riferimento; il sabato festivo conta come festivo', () => {
    expect(shiftCategory({ date: '2026-11-27', kind: 'FN' })).toBe('FN')
    expect(shiftCategory({ date: '2026-11-28', kind: 'WD' })).toBe('SAT_D')
    expect(shiftCategory({ date: '2026-11-28', kind: 'WN' })).toBe('SAT_N')
    expect(shiftCategory({ date: '2026-11-29', kind: 'WD' })).toBe('HOL_D')
    expect(shiftCategory({ date: '2026-11-29', kind: 'WN' })).toBe('HOL_N')
    expect(shiftCategory({ date: '2026-12-07', kind: 'WD' })).toBe('HOL_D') // lunedì festivo
    expect(shiftCategory({ date: '2026-12-26', kind: 'WN' })).toBe('HOL_N') // Santo Stefano di sabato
  })

  const x = buildHoursReport(input, nov)

  it('solo giorni erogati, con orari e stato; tutte le persone anche senza RAL', () => {
    expect(x.shifts.map((s) => [s.slot, s.cat, s.state])).toEqual([
      ['2026-11-27|N', 'FN', 'erogato'], ['2026-11-28|D', 'SAT_D', 'erogato'], ['2026-11-28|N', 'SAT_N', 'erogato'],
      ['2026-11-29|D', 'HOL_D', 'consuntivato'], ['2026-11-29|N', 'HOL_N', 'consuntivato'],
    ])
    expect(x.shifts[4]).toMatchObject({ start: '2026-11-29T18:00', end: '2026-11-30T09:00' })
    const ra = x.people.find((r) => r.person.id === 'a')!
    expect(ra.shifts).toEqual({ FN: 1, SAT_D: 1, SAT_N: 0, HOL_D: 0, HOL_N: 1 })
    expect(ra.totalShifts).toBe(3)
    expect(x.people.find((r) => r.person.id === 'b')!.shifts).toEqual({ FN: 0, SAT_D: 0, SAT_N: 1, HOL_D: 1, HOL_N: 0 })
  })

  it('interventi: minuti effettivi per fascia del minuto, ore riconosciute per voce', () => {
    const byId = (id: string) => x.interventions.find((o) => o.iv.id === id)!
    // domenica 23:30 → lunedì 00:40: dopo mezzanotte è lunedì, notturno feriale
    expect(byId('x')).toMatchObject({ cat: 'HOL_N', minutes: 70, hours: 1, effective: { holNight: 30, ferNight: 40, ferDay: 0, holDay: 0 } })
    expect(byId('x').byRate).toMatchObject({ holNight: 30, ferNight: 30 }) // l'arrotondamento toglie dalla fascia in cui finisce
    // sabato 23:00 → domenica 01:00: dopo mezzanotte è domenica, notturno festivo
    expect(byId('y').effective).toMatchObject({ ferNight: 60, holNight: 60 })
    // prime 2 ore feriali diurne del giorno, poi le successive
    expect(byId('z')).toMatchObject({ minutes: 90, hours: 2, effective: { ferDay: 90 } })
    expect(byId('z').byRate).toMatchObject({ ferDay1: 120, ferDay2: 0 })
    expect(byId('w').byRate).toMatchObject({ ferDay1: 0, ferDay2: 60 })
    expect(x.interventions.some((o) => o.iv.id === 'p')).toBe(false)
    const ra = x.people.find((r) => r.person.id === 'a')!
    expect(ra).toMatchObject({ interventions: 3, minutes: 205, hours: 4 })
    expect(ra.effective).toEqual({ ferDay: 135, ferNight: 40, holDay: 0, holNight: 30 })
  })

  it('avvisi: turni non erogati, turni finiti da compilare, interventi in approvazione', () => {
    expect(x.notes).toEqual([
      '1 turno in giorni non ancora erogati: non incluso.',
      '2 turni finiti senza interventi dichiarati né "Nessun intervento".',
      '1 intervento in approvazione: non incluso.',
    ])
  })

  it('filtro per team e periodo', () => {
    const pm = buildHoursReport(input, nov, 'pm')
    expect(pm.people.map((r) => r.person.id)).toEqual(['b'])
    expect(pm.interventions.map((o) => o.iv.id)).toEqual(['y'])
    expect(buildHoursReport(input, dec).shifts.map((s) => [s.slot, s.cat])).toEqual([['2026-12-07|D', 'HOL_D']])
  })

  it('Excel: 3 fogli, nessun importo, dato retributivo o regola di calcolo', async () => {
    const buf = await buildHoursXlsx(x, DEFAULT_TEAMS, P)
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Riepilogo per persona', 'Turni di reperibilità', 'Interventi'])
    for (const ws of wb.worksheets) {
      const values: string[] = []
      ws.eachRow((r) => r.eachCell((c) => values.push(String(c.value))))
      expect(values.some((v) => /€|\bRAL\b|livell|maggiorazion|indennit|%/i.test(v))).toBe(false)
    }
    expect(hoursFileName(nov, new Date(2026, 11, 3))).toBe('20261203-ARM-HD2-paghe-ore-novembre-2026.xlsx')
  })

  it('previsionale: anche i turni programmati non ancora erogati; gli interventi restano solo gli effettuati', async () => {
    const f = buildHoursReport(input, nov, null, { forecast: true })
    expect(f.forecast).toBe(true)
    expect(f.shifts.find((s) => s.slot === '2026-11-30|N')).toMatchObject({ state: 'programmato', cat: 'FN' })
    const ra = f.people.find((r) => r.person.id === 'a')!
    expect(ra.shifts).toEqual({ FN: 1, SAT_D: 1, SAT_N: 0, HOL_D: 0, HOL_N: 1 })
    expect(ra.planned).toEqual({ FN: 1, SAT_D: 0, SAT_N: 0, HOL_D: 0, HOL_N: 0 })
    expect([ra.totalShifts, ra.totalPlanned]).toEqual([3, 1])
    expect(f.interventions.map((o) => o.iv.id)).toEqual(x.interventions.map((o) => o.iv.id))
    expect(f.notes.some((n) => /non ancora erogati/.test(n))).toBe(false)
    expect(x.people.find((r) => r.person.id === 'a')!.totalPlanned).toBe(0)

    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await buildHoursXlsx(f, DEFAULT_TEAMS, P))
    const cells = (name: string) => { const v: string[] = []; wb.getWorksheet(name)!.eachRow((r) => r.eachCell((c) => v.push(String(c.value)))); return v }
    expect(cells('Riepilogo per persona')).toEqual(expect.arrayContaining(['Turni di reperibilità effettuati feriale notturno', 'Turni di reperibilità programmati feriale notturno', 'Turni di reperibilità programmati totali']))
    expect(cells('Turni di reperibilità').filter((v) => v === 'Programmato')).toHaveLength(1)
    expect(hoursFileName(nov, new Date(2026, 11, 3), true)).toBe('20261203-ARM-HD2-previsionale-novembre-2026.xlsx')
  })

  it('Excel: prima le ore riconosciute per fascia CCNL, poi la durata effettiva', async () => {
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await buildHoursXlsx(x, DEFAULT_TEAMS, P))
    const head = (name: string) => { let h: string[] = []; wb.getWorksheet(name)!.eachRow((r) => { const v = (r.values as unknown[]).slice(1).map(String); if (v[0] === 'Persona') h = v }); return h }
    const iv = head('Interventi')
    expect(iv.slice(iv.indexOf('Fine') + 1, iv.indexOf('Fine') + 8)).toEqual([
      'Ore riconosciute feriale diurno, prime 2 h (06–22)', 'Ore riconosciute feriale diurno, ore successive (06–22)', 'Ore riconosciute notturno feriale (22–06)',
      'Ore riconosciute festivo diurno (06–22)', 'Ore riconosciute festivo notturno (22–06)', 'Ore riconosciute totali', 'Durata effettiva (min)',
    ])
    const r1 = head('Riepilogo per persona')
    expect(r1.indexOf('Ore riconosciute totali')).toBeLessThan(r1.indexOf('Ore effettive totali'))
  })

  it('reperibilità con il tipo di gettone e gli interventi del turno; report di una sola persona', () => {
    const s13 = x.shifts.find((s) => s.slot === '2026-11-27|N')!
    expect(s13).toMatchObject({ cat: 'FN', ivCount: 2, ivHours: 3 })
    expect(x.shifts.find((s) => s.slot === '2026-11-28|D')).toMatchObject({ ivCount: 0, ivHours: 0 })
    const one = buildHoursReport(input, nov, null, { person: 'b' })
    expect(one.people.map((r) => r.person.id)).toEqual(['b'])
    expect(one.shifts.every((s) => s.person.id === 'b')).toBe(true)
    expect(one.interventions.map((o) => o.iv.id)).toEqual(['y'])
  })

  it('periodo da data a data: indicato nei file e nel nome', async () => {
    const r = rangePeriod('2026-11-27', '2026-11-28')
    expect(periodText(r)).toBe('Dal 27/11/2026 al 28/11/2026')
    expect(periodText(nov)).toBe('Novembre 2026 (dal 01/11/2026 al 30/11/2026)')
    const xr = buildHoursReport(input, r)
    expect(xr.shifts.map((s) => s.slot)).toEqual(['2026-11-27|N', '2026-11-28|D', '2026-11-28|N'])
    const d = new Date(2026, 11, 3)
    expect(hoursFileName(r, d)).toBe('20261203-ARM-HD2-paghe-ore-da20261127_a20261128.xlsx')
    expect(hoursFileName(nov, d, false, 'pdf', 'Àlba Rossi')).toBe('20261203-ARM-HD2-paghe-ore-novembre-2026-alba-rossi.pdf')
    expect(hoursFileName(nov, d, true, 'zip')).toBe('20261203-ARM-HD2-previsionale-novembre-2026.zip')
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await buildHoursXlsx(xr, DEFAULT_TEAMS, P))
    const sub: string[] = []
    wb.getWorksheet('Turni di reperibilità')!.eachRow((row) => sub.push(String(row.getCell(1).value)))
    expect(sub.some((v) => v.startsWith('Periodo: Dal 27/11/2026 al 28/11/2026'))).toBe(true)
  })

  it('PDF e archivio con un file per persona', async () => {
    const pdf = new Uint8Array(await buildHoursPdf(x, DEFAULT_TEAMS, P))
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    const single = new Uint8Array(await buildHoursPdf(buildHoursReport(input, nov, null, { person: 'a' }), DEFAULT_TEAMS, P))
    expect(single.length).toBeGreaterThan(1000)
    const zip = await zipFiles([{ name: 'a.pdf', data: single.buffer }, { name: 'b.xlsx', data: await buildHoursXlsx(buildHoursReport(input, nov, null, { person: 'b' }), DEFAULT_TEAMS, P) }])
    const { unzipSync } = await import('fflate')
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(['a.pdf', 'b.xlsx'])
  })

  it('filtro per persone: tabella, dettagli e avvisi solo delle persone scelte', () => {
    const only = buildHoursReport(input, nov, null, { persons: ['b'] })
    expect(only.people.map((r) => r.person.id)).toEqual(['b'])
    expect(only.shifts.every((s) => s.person.id === 'b')).toBe(true)
    expect(only.notes.some((n) => /in approvazione/.test(n))).toBe(false) // l'intervento in approvazione è di a
    expect(buildHoursReport(input, nov, null, { persons: [] }).people).toHaveLength(2)
  })
})
