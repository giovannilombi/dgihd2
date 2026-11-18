import { useState } from 'react'
import { fmtEur } from '../lib/economics'
import { personSlots, unavailabilityReason } from '../lib/rules'
import { HORIZON_MONTHS, monthKey, monthShort, rangeLabel, SLOT_BY_ID, toRanges } from '../lib/calendar'
import { download, slotTag } from '../lib/reports'
import { AvailabilityDialog } from './AvailabilityDialog'
import { AVAILABILITY_HELP, newId, nextColor, parseTeamText, TEMPLATE_CSV, type ImportedPerson } from '../lib/team'
import { availabilityLabel, availabilityOf, LEVELS, preferredMax, type Assignments, type Level, type Person } from '../lib/types'
import { Badge, Button, CommitInput } from './ui'
import { renumberReserves } from '../lib/store'

interface Props {
  people: Person[]
  assignments: Assignments
  onChange: (people: Person[], assignments?: Assignments) => void
  /** RAL e livello in chiaro e modificabili solo dopo aver reinserito la password. */
  revealed: boolean
}

const Masked = ({ w = 'w-20' }: { w?: string }) => (
  <span className={`inline-flex ${w} items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-400 select-none`} title="Dato oscurato: usa l'icona a forma di occhio e reinserisci la password">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3 shrink-0" aria-hidden><rect x="4" y="9" width="12" height="8.5" rx="1.8" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
    <span aria-label="oscurato" className="tracking-widest">•••••</span>
  </span>
)

export function TeamPanel({ people, assignments, onChange, revealed }: Props) {
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const editingPerson = people.find((x) => x.id === editing)

  /** Salva ferie e disponibilità; i turni già assegnati nei giorni di ferie vengono liberati (con conferma). */
  const saveAvailability = (id: string, unavailable: string[], preferred: string[]) => {
    const clash = Object.entries(assignments).filter(([sid, pid]) => pid === id && unavailabilityReason(unavailable, SLOT_BY_ID[sid]))
    if (clash.length && !confirm(`${clash.length} ${clash.length === 1 ? 'turno assegnato cade' : 'turni assegnati cadono'} nei giorni di non disponibilità (o nella notte che li precede) e ${clash.length === 1 ? 'verrà liberato' : 'verranno liberati'}:\n${clash.map(([sid]) => '• ' + slotTag(sid)).join('\n')}\n\nContinuare?`)) return
    const nextPeople = people.map((x) => (x.id === id ? { ...x, unavailable: unavailable.length ? unavailable : undefined, preferredDays: preferred.length ? preferred : undefined } : x))
    if (clash.length) {
      const drop = new Set(clash.map(([sid]) => sid))
      onChange(nextPeople, Object.fromEntries(Object.entries(assignments).filter(([sid]) => !drop.has(sid))))
    } else onChange(nextPeople)
    setEditing(null)
  }
  const update = (id: string, patch: Partial<Person>) => onChange(people.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const add = () => onChange([...people, { id: newId(), name: `Risorsa ${people.length + 1}`, level: 'B1', ral: 30_000, active: true, color: nextColor(people), availability: 'nessuna' }])

  const remove = (p: Person) => {
    const n = personSlots(assignments, p.id).length
    if (n && !confirm(`${p.name} ha ${n} turni assegnati: verranno rimossi dal calendario. Continuare?`)) return
    const a = Object.fromEntries(Object.entries(assignments).filter(([, pid]) => pid !== p.id))
    onChange(people.filter((x) => x.id !== p.id), a)
  }

  const missingRal = people.filter((x) => !(x.ral > 0)).length
  const counts = {
    volontario: people.filter((x) => x.active && availabilityOf(x) === 'volontario').length,
    limitato: people.filter((x) => x.active && availabilityOf(x) === 'limitato').length,
    nessuna: people.filter((x) => x.active && availabilityOf(x) === 'nessuna').length,
    ko: people.filter((x) => !x.active).length,
  }
  const renderRow = (p: Person) => {
              const ps = personSlots(assignments, p.id)
              const n = ps.length
              const perMonth = HORIZON_MONTHS.map((m) => ({ m, n: ps.filter((x) => monthKey(x.date) === m).length })).filter((x) => x.n > 0)
              const max = p.active ? preferredMax(p) : undefined
              return (
                <tr key={p.id} className={`border-b border-slate-100 ${p.active ? '' : 'bg-slate-50 text-slate-500'}`}>
                  <td className="py-2 pr-3 pl-3" style={p.active && p.reserve ? { boxShadow: 'inset 3px 0 0 #7c3aed' } : undefined}>
                    <label className="relative block h-7 w-7 cursor-pointer rounded-full ring-2 ring-white shadow" style={{ background: p.color }} title="Cambia colore">
                      <input type="color" value={p.color} onChange={(e) => update(p.id, { color: e.target.value })} className="absolute inset-0 opacity-0" />
                    </label>
                  </td>
                  <td className="py-2 pr-3">
                    <CommitInput value={p.name} onCommit={(v) => update(p.id, { name: v.replace(/\s+/g, ' ').trim() })} validate={(v) => v.trim().length >= 1 && v.trim().length <= 80}
                      aria-label="Nome e cognome" title="Il nome si salva uscendo dal campo o premendo Invio (Esc annulla)" maxLength={80}
                      className="w-full min-w-48 rounded-md px-2 py-1 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </td>
                  <td className="py-2 pr-3">
                    {revealed ? (
                      <select value={p.level} onChange={(e) => update(p.id, { level: e.target.value as Level })} aria-label="Livello" className="rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200">
                        {LEVELS.map((l) => <option key={l}>{l}</option>)}
                      </select>
                    ) : <Masked w="w-16" />}
                  </td>
                  <td className="py-2 pr-3">
                    {revealed ? (
                      <>
                        <CommitInput type="number" step={500} min={0} value={p.ral} aria-label="RAL" onCommit={(v) => update(p.id, { ral: Number(v) })} validate={(v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1_000_000}
                          className="num w-32 rounded-md px-2 py-1 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                        <div className={`mt-0.5 text-xs ${p.ral > 0 ? 'text-slate-400' : 'font-medium text-amber-700'}`}>{p.ral > 0 ? fmtEur(p.ral) : 'Da inserire'}</div>
                      </>
                    ) : <Masked w="w-32" />}
                  </td>
                  <td className="py-2 pr-3">
                    <select aria-label={`Ruolo di ${p.name}`} value={roleOf(p)} onChange={(e) => setRole(p, e.target.value as RoleValue)}
                      title="Le riserve vengono impiegate dall'auto-compilazione solo se nessun primario è disponibile"
                      className={`rounded-md px-2 py-1 text-sm font-medium ring-1 ring-inset ${ROLE_STYLE[roleOf(p)]}`}>
                      <option value="primary">Primario</option>
                      <option value="reserve">Riserva</option>
                      <option value="ko">KO · non in rotazione</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select aria-label={`Disponibilità di ${p.name}`} disabled={!p.active} value={availValue(p)}
                      onChange={(e) => update(p.id, parseAvailValue(e.target.value))}
                      className="rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
                      <option value="volontario">Volontario (senza limite)</option>
                      <option value="max1">Max 1 turno/mese</option>
                      <option value="max2">Max 2 turni/mese</option>
                      <option value="max3">Max 3 turni/mese</option>
                      <option value="nessuna">Nessuna preferenza</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <button type="button" onClick={() => setEditing(p.id)} className="group/cal flex flex-col items-start gap-1 rounded-md px-2 py-1 text-left ring-1 ring-inset ring-slate-200 hover:bg-slate-50" aria-label={`Gestisci disponibilità di ${p.name}`}>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5" aria-hidden><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 2.5v4M13 2.5v4" strokeLinecap="round" /></svg>
                        Gestisci
                      </span>
                      {(p.unavailable?.length ?? 0) > 0 && <Badge tone="red" title={toRanges(p.unavailable!).map(rangeLabel).join('\n')}>Non disp. {toRanges(p.unavailable!).length === 1 ? rangeLabel(toRanges(p.unavailable!)[0]) : `${p.unavailable!.length} gg`}</Badge>}
                      {(p.preferredDays?.length ?? 0) > 0 && <Badge tone="green" title={toRanges(p.preferredDays!).map(rangeLabel).join('\n')}>Disponibile {p.preferredDays!.length} gg</Badge>}
                    </button>
                  </td>
                  <td className="num py-2 pr-3 text-right" title="Conteggio automatico dei turni assegnati nel calendario (max 4 al mese)">
                    <div className="font-medium text-slate-800">{n}</div>
                    <div className="text-xs whitespace-nowrap text-slate-400">
                      {perMonth.length ? perMonth.map(({ m, n: k }, i) => (
                        <span key={m} className={max !== undefined && k > max ? 'font-medium text-amber-700' : ''}>{i > 0 && ' · '}{monthShort(m)} {k}{max !== undefined ? `/${max}` : ''}</span>
                      )) : '—'}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" className="no-print text-red-700" onClick={() => remove(p)} aria-label={`Elimina ${p.name}`}>Elimina</Button>
                  </td>
                </tr>
              )
  }

  const reserves = people.filter((p) => p.active && p.reserve).sort((a, b) => (a.reserveOrder ?? 99) - (b.reserveOrder ?? 99))

  /** Cambia il ruolo: le nuove riserve vanno in fondo alla lista; chi va in KO esce dalle riserve. */
  const setRole = (p: Person, role: RoleValue) => {
    const maxOrder = Math.max(0, ...people.filter((x) => x.active && x.reserve).map((x) => x.reserveOrder ?? 0))
    const patch: Partial<Person> =
      role === 'primary' ? { active: true, reserve: false, reserveOrder: undefined }
      : role === 'reserve' ? { active: true, reserve: true, reserveOrder: p.active && p.reserve ? p.reserveOrder : maxOrder + 1 }
      : { active: false, reserve: false, reserveOrder: undefined }
    onChange(renumberReserves(people.map((x) => (x.id === p.id ? { ...x, ...patch } : x))))
  }
  /** Sposta una riserva di una posizione (−1 = su, +1 = giù). */
  const moveReserve = (p: Person, dir: -1 | 1) => {
    const idx = reserves.findIndex((x) => x.id === p.id)
    const other = reserves[idx + dir]
    if (!other) return
    onChange(people.map((x) => (x.id === p.id ? { ...x, reserveOrder: other.reserveOrder } : x.id === other.id ? { ...x, reserveOrder: p.reserveOrder } : x)))
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="blue">{people.filter((x) => x.active && !x.reserve).length} primari</Badge>
        <Badge tone="violet">{reserves.length} {reserves.length === 1 ? 'riserva' : 'riserve'}</Badge>
        <Badge tone="red">{counts.ko} KO</Badge>
        <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
        <Badge tone="slate">{counts.volontario} {counts.volontario === 1 ? 'volontario' : 'volontari'}</Badge>
        <Badge tone="slate">{counts.limitato} con limite</Badge>
        <Badge tone="slate">{counts.nessuna} senza preferenza</Badge>
        {missingRal > 0 && <Badge tone="amber" title="Con RAL a zero gli importi sono stimati e le ore di straordinario non sono calcolabili">{missingRal} RAL da inserire</Badge>}
        <span className="text-xs text-slate-500">L'auto-compilazione impiega prima i volontari, poi chi ha un limite (senza superarlo), infine chi non ha espresso preferenze; le riserve solo se nessun primario è disponibile.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 pl-3 font-medium">Badge</th>
              <th className="py-2 pr-3 font-medium">Nome e cognome</th>
              <th className="py-2 pr-3 font-medium">Livello CCNL</th>
              <th className="py-2 pr-3 font-medium">RAL (€)</th>
              <th className="py-2 pr-3 font-medium" title="Primario: in rotazione. Riserva: usata solo se nessun primario è disponibile. KO: fuori rotazione">Ruolo</th>
              <th className="py-2 pr-3 font-medium" title="Usata dall'auto-compilazione: prima i volontari, poi chi ha un limite (rispettato), infine chi non ha espresso preferenze">Disponibilità</th>
              <th className="py-2 pr-3 font-medium" title="Ferie/assenze (blocco assoluto) e giorni di disponibilità (preferenza)">Calendario personale</th>
              <th className="py-2 pr-3 text-right font-medium" title="Calcolato automaticamente dal calendario (Sezione C): non modificabile">Turni assegnati</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => renderRow(p))}
            {!people.length && <tr><td colSpan={9} className="py-6 text-center text-slate-500">Nessuna risorsa. Aggiungine una o importa la lista.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="no-print mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={add}>+ Aggiungi risorsa</Button>
        <Button onClick={() => setImportOpen(true)}>Importa CSV / Incolla da Excel</Button>
      </div>

      <div className="mt-8 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Riserve <span className="text-sm font-normal text-slate-500">({reserves.length})</span></h3>
          <p className="max-w-3xl text-xs text-slate-600">Usate dall'auto-compilazione <strong>solo se nessun primario può coprire lo slot</strong>, in quest'ordine. Per togliere una riserva cambia il suo ruolo nella tabella sopra.</p>
        </div>
        {reserves.length ? (
          <ol className="mt-3 grid gap-1.5">
            {reserves.map((p, idx) => {
              const n = personSlots(assignments, p.id).length
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-violet-200 bg-white px-3 py-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-600 text-xs font-semibold text-white" title={`Riserva n. ${idx + 1}`}>{idx + 1}</span>
                  <span className="flex flex-col">
                    <button type="button" onClick={() => moveReserve(p, -1)} disabled={idx === 0} aria-label={`Sposta ${p.name} su`} className="rounded px-1 text-[10px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-25">▲</button>
                    <button type="button" onClick={() => moveReserve(p, 1)} disabled={idx === reserves.length - 1} aria-label={`Sposta ${p.name} giù`} className="rounded px-1 text-[10px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-25">▼</button>
                  </span>
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: p.color }} />
                  <span className="min-w-40 font-medium text-slate-900">{p.name}</span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>{availabilityLabel(p)}</span>
                    {(p.unavailable?.length ?? 0) > 0 && <Badge tone="red" title={toRanges(p.unavailable!).map(rangeLabel).join('\n')}>Non disp. {p.unavailable!.length} gg</Badge>}
                  </span>
                  <span className="num text-xs text-slate-500">{n} {n === 1 ? 'turno' : 'turni'}</span>
                </li>
              )
            })}
          </ol>
        ) : <p className="mt-2 text-sm text-slate-500">Nessuna riserva. Per aggiungerne una, imposta il ruolo "Riserva" nella tabella sopra.</p>}
      </div>
      {editingPerson && <AvailabilityDialog person={editingPerson} onClose={() => setEditing(null)} onSave={(u, pr) => saveAvailability(editingPerson.id, u, pr)} />}
      {importOpen && <ImportDialog revealed={revealed} existing={people} onClose={() => setImportOpen(false)} onImport={(rows, replace) => {
        const base = replace ? [] : people
        const added: Person[] = []
        for (const r of rows) added.push({ ...r, id: newId(), color: nextColor([...base, ...added]) })
        onChange([...base, ...added], replace ? {} : undefined)
        setImportOpen(false)
      }} />}
    </div>
  )
}

const MAX_FILE_BYTES = 1_000_000

function ImportDialog({ revealed, existing, onClose, onImport }: { revealed: boolean; existing: Person[]; onClose: () => void; onImport: (rows: ImportedPerson[], replace: boolean) => void }) {
  const [text, setText] = useState('')
  const [fileError, setFileError] = useState('')
  const [fileName, setFileName] = useState('')
  const [replace, setReplace] = useState(true)
  const parsed = parseTeamText(text)
  const existingNames = new Set(existing.map((x) => x.name.trim().toLowerCase()))
  const clashes = replace ? [] : parsed.people.filter((x) => existingNames.has(x.name.toLowerCase()))
  const warnings = [...parsed.warnings, ...clashes.map((x) => `"${x.name}" è già presente nel team attuale`)]

  const readFile = async (f?: File) => {
    setFileError('')
    if (!f) return
    setFileName(f.name)
    if (/\.(xlsx|xls|numbers|ods)$/i.test(f.name)) return setFileError('Hai caricato un foglio di calcolo: da Excel usa "Salva con nome → CSV UTF-8", oppure copia le celle e incollale nel riquadro.')
    if (!/\.(csv|txt|tsv)$/i.test(f.name)) return setFileError(`Formato "${f.name.split('.').pop()}" non supportato: carica un file .csv (scarica il template).`)
    if (f.size > MAX_FILE_BYTES) return setFileError('File troppo grande (oltre 1 MB): verifica di aver scelto il file giusto.')
    try {
      setText(await f.text())
    } catch {
      setFileError('Impossibile leggere il file. Riprova oppure incolla il contenuto nel riquadro.')
    }
  }

  const status = fileError || parsed.fatal
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="imp-title">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="imp-title" className="text-lg font-semibold">Importa team</h3>
            <p className="mt-1 text-sm text-slate-500">Colonne richieste: <strong>Nome, Livello, RAL</strong>; facoltativa <strong>Disponibilità</strong>. Livelli ammessi: {LEVELS.join(', ')}.</p>
            <p className="mt-0.5 text-xs text-slate-500">Disponibilità: {AVAILABILITY_HELP}.</p>
          </div>
          <Button onClick={() => download('template-team-reperibilita.csv', TEMPLATE_CSV, 'text/csv;charset=utf-8')}>↓ Scarica template CSV</Button>
        </div>
        <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
          <li>Scarica il template e compilalo in Excel, una riga per persona.</li>
          <li>Salvalo come CSV e caricalo qui, oppure copia le celle da Excel e incollale nel riquadro.</li>
        </ol>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setFileError(''); setFileName('') }} rows={6} placeholder={'Nome\tLivello\tRAL\nMario Rossi\tB1\t32.000\nAnna Bianchi\tC2\t28.500'} aria-label="Contenuto da importare" className="mt-3 w-full rounded-lg p-3 font-mono text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <label className="cursor-pointer font-medium text-blue-700 hover:underline">
            Carica file CSV…{fileName && <span className="ml-1 font-normal text-slate-500">({fileName})</span>}
            <input type="file" accept=".csv,.txt,.tsv,text/csv" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Sostituisci il team attuale (azzera il calendario)</label>
        </div>

        {status && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">⚠ {status}</p>}

        {!status && text.trim() && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge tone={parsed.people.length ? 'green' : 'red'}>{parsed.people.length} righe valide</Badge>
              {parsed.errors.length > 0 && <Badge tone="red">{parsed.errors.length} righe scartate</Badge>}
              {warnings.length > 0 && <Badge tone="amber">{warnings.length} avvisi</Badge>}
            </div>
            {parsed.people.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-lg ring-1 ring-slate-200">
                <table className="num w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-1.5 font-medium">Nome</th><th className="py-1.5 font-medium">Livello</th><th className="px-3 py-1.5 text-right font-medium">RAL</th><th className="pr-3 py-1.5 font-medium">Disponibilità</th></tr></thead>
                  <tbody>{parsed.people.map((x, i) => <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1">{x.name}</td><td className="py-1">{revealed ? x.level : '•••'}</td><td className="px-3 py-1 text-right">{revealed ? fmtEur(x.ral) : '•••••'}</td><td className="pr-3 py-1">{availabilityLabel(x)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {(parsed.errors.length > 0 || warnings.length > 0) && (
              <ul className="max-h-32 space-y-0.5 overflow-auto rounded-lg bg-slate-50 p-2.5 text-xs">
                {parsed.errors.map((e) => <li key={e} className="text-red-700">✕ {e}</li>)}
                {warnings.map((w) => <li key={w} className="text-amber-800">! {w}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {!status && parsed.errors.length > 0 && parsed.people.length > 0 && <span className="mr-auto text-xs text-slate-500">Le righe scartate non verranno importate.</span>}
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button variant="primary" disabled={!!status || !parsed.people.length} onClick={() => onImport(parsed.people, replace)}>
            Importa {parsed.people.length || ''} {parsed.people.length === 1 ? 'risorsa' : 'risorse'}
          </Button>
        </div>
      </div>
    </div>
  )
}

const availValue = (p: Person) => availabilityOf(p) === 'limitato' ? `max${preferredMax(p)}` : availabilityOf(p)
const parseAvailValue = (v: string): Partial<Person> =>
  v.startsWith('max') ? { availability: 'limitato', maxPerMonth: Number(v.slice(3)) } : { availability: v as Person['availability'], maxPerMonth: undefined }

type RoleValue = 'primary' | 'reserve' | 'ko'
const roleOf = (p: Person): RoleValue => (!p.active ? 'ko' : p.reserve ? 'reserve' : 'primary')
const ROLE_STYLE: Record<RoleValue, string> = {
  primary: 'bg-blue-50 text-blue-800 ring-blue-200',
  reserve: 'bg-violet-50 text-violet-800 ring-violet-200',
  ko: 'bg-red-50 text-red-700 ring-red-200',
}
