import { useState } from 'react'
import { introClosed, setIntroClosed } from '../../lib/guides'
import { InterventionChip } from '../InterventionChip'
import { BookIcon, UiBtn } from './kit'

/**
 * In cima al calendario del Turnista: l'avviso dei turni da compilare (finché ce ne sono) e il riquadro
 * "Come funziona, in 3 passi", che si chiude e resta chiuso su questo dispositivo. La guida completa
 * resta sempre raggiungibile dal pulsante nell'intestazione.
 */
export function TurnistaIntro({ toFill, rejected, onOpenGuide, onGoInterventions }: {
  toFill: number; rejected: number; onOpenGuide: () => void; onGoInterventions: () => void
}) {
  const [closed, setClosed] = useState(introClosed)
  const close = () => { setIntroClosed(true); setClosed(true) }
  const todo = [toFill > 0 && `${toFill} ${toFill === 1 ? 'turno da compilare' : 'turni da compilare'}`, rejected > 0 && `${rejected} ${rejected === 1 ? 'intervento rifiutato da correggere' : 'interventi rifiutati da correggere'}`].filter(Boolean).join(' e ')

  return (
    <>
      {todo && (
        <section aria-label="Da fare" className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
            <InterventionChip info={{ chip: toFill > 0 ? 'todo' : 'rejected', count: rejected }} />
            <p className="text-sm text-slate-700">Hai <strong className="text-slate-900">{todo}</strong>.</p>
          </div>
          <button type="button" onClick={onGoInterventions}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto sm:py-2">
            Vai a I miei interventi
          </button>
        </section>
      )}

      {!closed && (
        <section aria-labelledby="intro-titolo" className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <button type="button" onClick={close} aria-label="Chiudi il riquadro Come funziona"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pr-10">
            <h2 id="intro-titolo" className="text-lg font-semibold text-slate-900">Come funziona, in 3 passi</h2>
            <span className="text-sm text-slate-500">Ti servono un paio di minuti a fine turno.</span>
          </div>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            <Step n={1} title="Guarda i tuoi turni" text={'Sono evidenziati in blu nel calendario e nell\'elenco "I miei turni".'}>
              <span className="rounded-md bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white">Sei di turno</span>
            </Step>
            <Step n={2} title="A fine turno, compila" text={'In "I miei interventi": "Nessun intervento" oppure "+ Intervento" con orari e nota.'}>
              <span className="flex flex-wrap gap-1.5"><UiBtn small>Nessun intervento</UiBtn><UiBtn variant="primary" small>+ Intervento</UiBtn></span>
            </Step>
            <Step n={3} title="Segui l'approvazione" text="Il capo del tuo team approva. Se rifiuta, correggi e rimanda.">
              <span className="flex flex-wrap items-center gap-1.5"><InterventionChip info={{ chip: 'pending', count: 1 }} /><span className="text-slate-300" aria-hidden>→</span><InterventionChip info={{ chip: 'approved', count: 1 }} /></span>
            </Step>
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={onOpenGuide}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto sm:py-2">
              <BookIcon /> Apri la guida completa
            </button>
            <span className="text-xs text-slate-500">Approvazioni, ore riconosciute, cosa fare se ti sei dimenticato.</span>
          </div>
        </section>
      )}
    </>
  )
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-600 text-xs font-bold text-white">{n}</span>
        <strong className="text-sm text-slate-900">{title}</strong>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">{text}</p>
      <div className="mt-auto pt-1">{children}</div>
    </li>
  )
}
