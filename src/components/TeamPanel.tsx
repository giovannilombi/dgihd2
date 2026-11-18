import { useState } from 'react'
import { fmtEur } from '../lib/economics'
import { personSlots } from '../lib/rules'
import { newId, nextColor, parseTeamText } from '../lib/team'
import { LEVELS, type Assignments, type Level, type Person } from '../lib/types'
import { Badge, Button } from './ui'

interface Props {
  people: Person[]
  assignments: Assignments
  onChange: (people: Person[], assignments?: Assignments) => void
}

export function TeamPanel({ people, assignments, onChange }: Props) {
  const [importOpen, setImportOpen] = useState(false)
  const update = (id: string, patch: Partial<Person>) => onChange(people.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const add = () => onChange([...people, { id: newId(), name: `Risorsa ${people.length + 1}`, level: 'B1', ral: 30_000, active: true, color: nextColor(people) }])

  const remove = (p: Person) => {
    const n = personSlots(assignments, p.id).length
    if (n && !confirm(`${p.name} ha ${n} turni assegnati: verranno rimossi dal calendario. Continuare?`)) return
    const a = Object.fromEntries(Object.entries(assignments).filter(([, pid]) => pid !== p.id))
    onChange(people.filter((x) => x.id !== p.id), a)
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Badge</th>
              <th className="py-2 pr-3 font-medium">Nome e cognome</th>
              <th className="py-2 pr-3 font-medium">Livello CCNL</th>
              <th className="py-2 pr-3 font-medium">RAL (€)</th>
              <th className="py-2 pr-3 font-medium">Stato adesione</th>
              <th className="py-2 pr-3 text-right font-medium">Turni</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const n = personSlots(assignments, p.id).length
              return (
                <tr key={p.id} className={`border-b border-slate-100 ${p.active ? '' : 'bg-slate-50 text-slate-500'}`}>
                  <td className="py-2 pr-3">
                    <label className="relative block h-7 w-7 cursor-pointer rounded-full ring-2 ring-white shadow" style={{ background: p.color }} title="Cambia colore">
                      <input type="color" value={p.color} onChange={(e) => update(p.id, { color: e.target.value })} className="absolute inset-0 opacity-0" />
                    </label>
                  </td>
                  <td className="py-2 pr-3">
                    <input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} aria-label="Nome e cognome" className="w-full min-w-48 rounded-md px-2 py-1 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </td>
                  <td className="py-2 pr-3">
                    <select value={p.level} onChange={(e) => update(p.id, { level: e.target.value as Level })} aria-label="Livello" className="rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200">
                      {LEVELS.map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" step={500} min={0} value={p.ral} aria-label="RAL" onChange={(e) => Number.isFinite(e.target.valueAsNumber) && update(p.id, { ral: e.target.valueAsNumber })} className="num w-32 rounded-md px-2 py-1 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                    <div className="mt-0.5 text-xs text-slate-400">{fmtEur(p.ral)}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <button type="button" role="switch" aria-checked={p.active} onClick={() => update(p.id, { active: !p.active })} className="flex items-center gap-2">
                      <span className={`relative h-5 w-9 rounded-full transition-colors ${p.active ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.active ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                      {p.active ? <Badge tone="green">Attivo in rotazione</Badge> : <Badge tone="amber">Escluso su richiesta</Badge>}
                    </button>
                  </td>
                  <td className="num py-2 pr-3 text-right">{n}</td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" className="no-print text-red-700" onClick={() => remove(p)} aria-label={`Elimina ${p.name}`}>Elimina</Button>
                  </td>
                </tr>
              )
            })}
            {!people.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nessuna risorsa. Aggiungine una o importa la lista.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="no-print mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={add}>+ Aggiungi risorsa</Button>
        <Button onClick={() => setImportOpen(true)}>Importa CSV / Incolla da Excel</Button>
      </div>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={(rows, replace) => {
        const base = replace ? [] : people
        const added: Person[] = []
        for (const r of rows) added.push({ ...r, id: newId(), color: nextColor([...base, ...added]) })
        onChange([...base, ...added], replace ? {} : undefined)
        setImportOpen(false)
      }} />}
    </div>
  )
}

function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (rows: ReturnType<typeof parseTeamText>['people'], replace: boolean) => void }) {
  const [text, setText] = useState('')
  const [replace, setReplace] = useState(true)
  const parsed = parseTeamText(text)
  const readFile = async (f?: File) => f && setText(await f.text())
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="imp-title">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="imp-title" className="text-lg font-semibold">Importa team</h3>
        <p className="mt-1 text-sm text-slate-500">Incolla le righe da Excel oppure carica un CSV con colonne <strong>Nome, Livello, RAL</strong> (separatore tab, punto e virgola o virgola; intestazione opzionale).</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={'Nome\tLivello\tRAL\nMario Rossi\tB1\t32.000\nAnna Bianchi\tC2\t28.500'} className="mt-3 w-full rounded-lg p-3 font-mono text-sm ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-blue-600" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <label className="cursor-pointer text-blue-700 hover:underline">
            Carica file CSV…
            <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Sostituisci il team attuale (azzera il calendario)</label>
        </div>
        {text && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <Badge tone={parsed.people.length ? 'green' : 'amber'}>{parsed.people.length} risorse riconosciute</Badge>
            {parsed.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-red-700">{parsed.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button variant="primary" disabled={!parsed.people.length} onClick={() => onImport(parsed.people, replace)}>Importa {parsed.people.length || ''}</Button>
        </div>
      </div>
    </div>
  )
}
