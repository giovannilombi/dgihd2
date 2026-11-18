import { HOLIDAYS, MONTH_LONG, SLOT_HOURS, daysInRange, isWeekendOrHoliday, monthKey, monthLabel, slotsForDay, toDate, weekday } from './calendar'
import { personSlots } from './rules'
import type { Assignments, Person } from './types'

const WD_LONG = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
export const UNCOVERED = '— scoperto —'

export interface ShiftDayRow {
  date: string
  dateLabel: string // 23/11/2026
  weekday: string
  type: 'Feriale' | 'Weekend' | 'Festivo'
  excluded: boolean
  note: string
  day: Person | null | undefined // undefined = slot non previsto (feriale)
  night: Person | null
}

/** Calendario turni (solo nominativi, nessun dato economico), raggruppato per mese. */
export function shiftCalendar(people: Person[], a: Assignments, excludedDays: string[] = []) {
  const excluded = new Set(excludedDays)
  const byId = Object.fromEntries(people.map((x) => [x.id, x]))
  const months = new Map<string, ShiftDayRow[]>()
  for (const date of daysInRange()) {
    const slots = slotsForDay(date)
    const festive = isWeekendOrHoliday(date)
    const d = toDate(date)
    const row: ShiftDayRow = {
      date,
      dateLabel: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`,
      weekday: WD_LONG[weekday(date)],
      type: HOLIDAYS[date] ? 'Festivo' : festive ? 'Weekend' : 'Feriale',
      excluded: excluded.has(date),
      note: HOLIDAYS[date] ?? '',
      day: festive ? byId[a[slots[0].id]] ?? null : undefined,
      night: byId[a[slots[slots.length - 1].id]] ?? null,
    }
    const k = monthKey(date)
    months.set(k, [...(months.get(k) ?? []), row])
  }
  return [...months.entries()].map(([key, rows]) => ({ key, label: monthLabel(key), rows }))
}

/** Riepilogo per persona: numero turni per mese ed elenco date (nessun dato economico). */
export function shiftsByPerson(people: Person[], a: Assignments) {
  return people
    .map((p) => {
      const slots = personSlots(a, p.id)
      const fmt = (s: (typeof slots)[number]) => {
        const d = toDate(s.date)
        return `${WD_LONG[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()].slice(0, 3)} ${s.kind === 'WD' ? 'Diurno' : 'Notte'}`
      }
      return {
        person: p,
        nov: slots.filter((s) => s.date.startsWith('2026-11')).length,
        dec: slots.filter((s) => s.date.startsWith('2026-12')).length,
        list: slots.map(fmt).join(', '),
      }
    })
    .filter((r) => r.nov + r.dec > 0 || r.person.active)
}

const tint = (hex: string, f = 0.82) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * f))
  return 'FF' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Genera il file Excel formattato con i soli turni. */
export async function buildShiftsXlsx(people: Person[], a: Assignments, excludedDays: string[] = []): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Piano Reperibilità Q4 2026'
  wb.created = new Date()

  const thin = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }
  const border = { top: thin, left: thin, bottom: thin, right: thin }
  const headFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } }

  // --- Foglio 1: calendario
  const ws = wb.addWorksheet('Calendario turni', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: '&LPiano Reperibilità Q4 2026&RPagina &P di &N' },
  })
  ws.columns = [
    { key: 'date', width: 12 }, { key: 'wd', width: 12 }, { key: 'type', width: 26 },
    { key: 'day', width: 30 }, { key: 'night', width: 30 },
  ]
  ws.mergeCells('A1:E1')
  ws.getCell('A1').value = 'Piano Reperibilità Nov – Dic 2026 · Calendario turni'
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F172A' } }
  ws.mergeCells('A2:E2')
  ws.getCell('A2').value = `Generato il ${new Date().toLocaleDateString('it-IT')} · Diurno ${SLOT_HOURS.WD} solo weekend e festivi · Notte ${SLOT_HOURS.FN}`
  ws.getCell('A2').font = { size: 9, color: { argb: 'FF64748B' } }
  const head = ws.getRow(3)
  head.values = ['Data', 'Giorno', 'Tipo', `Diurno ${SLOT_HOURS.WD}`, `Notte ${SLOT_HOURS.FN}`]
  head.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = headFill; c.border = border; c.alignment = { vertical: 'middle' } })
  head.height = 20
  ws.autoFilter = 'A3:E3'

  for (const m of shiftCalendar(people, a, excludedDays)) {
    const mr = ws.addRow([m.label.toUpperCase()])
    ws.mergeCells(`A${mr.number}:E${mr.number}`)
    mr.getCell(1).font = { bold: true, color: { argb: 'FF1E3A8A' } }
    mr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    mr.height = 18
    for (const r of m.rows) {
      if (r.excluded) {
        const row = ws.addRow([r.dateLabel, r.weekday, r.note ? `${r.type} · ${r.note}` : r.type, 'Non richiesto dal cliente', ''])
        ws.mergeCells(`D${row.number}:E${row.number}`)
        row.eachCell({ includeEmpty: true }, (c) => {
          c.border = border
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
          c.font = { color: { argb: 'FF64748B' }, italic: true }
        })
        continue
      }
      const row = ws.addRow([
        r.dateLabel, r.weekday, r.note ? `${r.type} · ${r.note}` : r.type,
        r.day === undefined ? '' : r.day?.name ?? UNCOVERED,
        r.night?.name ?? UNCOVERED,
      ])
      const festive = r.type !== 'Feriale'
      row.eachCell({ includeEmpty: true }, (c, col) => {
        c.border = border
        c.alignment = { vertical: 'middle' }
        if (festive && col <= 3) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }
      })
      if (r.type === 'Festivo') row.getCell(3).font = { bold: true, color: { argb: 'FF4338CA' } }
      ;([[4, r.day], [5, r.night]] as const).forEach(([col, p]) => {
        const c = row.getCell(col)
        if (p === undefined) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
        else if (p === null) c.font = { italic: true, color: { argb: 'FFB91C1C' } }
        else { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint(p.color) } }; c.font = { color: { argb: 'FF0F172A' } } }
      })
    }
  }

  // --- Foglio 2: riepilogo per persona
  const ws2 = wb.addWorksheet('Turni per persona', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws2.columns = [{ width: 30 }, { width: 11 }, { width: 11 }, { width: 9 }, { width: 90 }]
  const h2 = ws2.addRow(['Nome', 'Novembre', 'Dicembre', 'Totale', 'Date e fasce'])
  h2.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = headFill; c.border = border })
  for (const r of shiftsByPerson(people, a)) {
    const row = ws2.addRow([r.person.name + (r.person.active ? '' : ' (esclusa)'), r.nov, r.dec, r.nov + r.dec, r.list])
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = border
      c.alignment = { vertical: 'top', wrapText: col === 5, horizontal: col >= 2 && col <= 4 ? 'center' : undefined }
    })
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint(r.person.color) } }
    row.getCell(1).font = { bold: true }
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

const rgb = (hex: string, f = 0): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * f)) as [number, number, number]
}

/** Genera un PDF A4 con i soli turni (calendario per mese + riepilogo per persona), senza dati economici. */
export async function buildShiftsPdf(people: Person[], a: Assignments, excludedDays: string[] = []): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const BLUE: [number, number, number] = [29, 78, 216]
  const SLATE: [number, number, number] = [100, 116, 139]
  const generated = new Date().toLocaleDateString('it-IT')

  const header = (title: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 23, 42)
    doc.text('Piano Reperibilità Nov – Dic 2026', 14, 16)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...SLATE)
    doc.text(`${title} · generato il ${generated}`, 14, 22)
  }

  shiftCalendar(people, a, excludedDays).forEach((m, i) => {
    if (i > 0) doc.addPage()
    header(`Calendario turni · ${m.label}`)
    autoTable(doc, {
      startY: 27,
      head: [['Data', 'Giorno', 'Tipo', `Diurno ${SLOT_HOURS.WD}`, `Notte ${SLOT_HOURS.FN}`]],
      body: m.rows.map((r) => r.excluded
        ? [r.dateLabel, r.weekday, r.note || r.type, { content: 'Non richiesto dal cliente', colSpan: 2 }]
        : [r.dateLabel, r.weekday, r.note ? `${r.type} · ${r.note}` : r.type, r.day === undefined ? '' : r.day?.name ?? UNCOVERED, r.night?.name ?? UNCOVERED]),
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [203, 213, 225], lineWidth: 0.15, textColor: [15, 23, 42] },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 22 }, 2: { cellWidth: 40 } },
      margin: { left: 14, right: 14 },
      didParseCell: (d) => {
        if (d.section !== 'body') return
        const r = m.rows[d.row.index]
        if (r.excluded) {
          d.cell.styles.fillColor = [226, 232, 240]
          d.cell.styles.textColor = SLATE
          d.cell.styles.fontStyle = 'italic'
          return
        }
        if (r.type !== 'Feriale' && d.column.index <= 2) d.cell.styles.fillColor = [238, 242, 255]
        if (r.type === 'Festivo' && d.column.index === 2) { d.cell.styles.textColor = [67, 56, 202]; d.cell.styles.fontStyle = 'bold' }
        if (d.column.index >= 3) {
          const p = d.column.index === 3 ? r.day : r.night
          if (p === undefined) d.cell.styles.fillColor = [241, 245, 249]
          else if (p === null) { d.cell.styles.textColor = [185, 28, 28]; d.cell.styles.fontStyle = 'italic' }
          else d.cell.styles.fillColor = rgb(p.color, 0.82)
        }
      },
    })
  })

  doc.addPage()
  header('Turni per persona')
  autoTable(doc, {
    startY: 27,
    head: [['Nome', 'Nov', 'Dic', 'Tot.', 'Date e fasce']],
    body: shiftsByPerson(people, a).map((r) => [r.person.name + (r.person.active ? '' : ' (KO)'), r.nov, r.dec, r.nov + r.dec, r.list || '—']),
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [203, 213, 225], lineWidth: 0.15, textColor: [15, 23, 42], valign: 'top' },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' }, 1: { cellWidth: 12, halign: 'center' }, 2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 12, halign: 'center' } },
    margin: { left: 14, right: 14 },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 0) d.cell.styles.fillColor = rgb(shiftsByPerson(people, a)[d.row.index].person.color, 0.82)
    },
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(...SLATE)
    doc.text('Piano Reperibilità Q4 2026 · solo turni, nessun dato economico', 14, 290)
    doc.text(`Pagina ${i} di ${pages}`, 196, 290, { align: 'right' })
  }
  return doc.output('arraybuffer')
}
