import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { parseMyShifts, rowToIntervention, type Intervention, type InterventionRow, type IvStatus, type MyShifts } from './interventions'

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as unknown
}
/** 'YYYY-MM-DDTHH:MM' → formato accettato dal database */
const ts = (s: string) => `${s.replace('T', ' ')}:00`

export const addIntervention = (slot: string, start: string, end: string, note: string) =>
  rpc('add_intervention', { p_slot: slot, p_start: ts(start), p_end: ts(end), p_note: note.trim() || null })
export const updateIntervention = (id: string, start: string, end: string, note: string, comment?: string) =>
  rpc('update_intervention', { p_id: id, p_start: ts(start), p_end: ts(end), p_note: note.trim() || null, p_comment: comment?.trim() || null })
export const deleteIntervention = (id: string) => rpc('delete_intervention', { p_id: id })
export const declareNoIntervention = (slot: string) => rpc('declare_no_intervention', { p_slot: slot })
export const clearNoIntervention = (slot: string) => rpc('clear_no_intervention', { p_slot: slot })
export const decideIntervention = (id: string, status: IvStatus, reason?: string) => rpc('decide_intervention', { p_id: id, p_status: status, p_reason: reason?.trim() || null })

/** Tutti gli interventi e i "nessun intervento" (per chi legge l'anagrafica completa), in tempo reale. */
export function useInterventions(enabled: boolean) {
  const [ivs, setIvs] = useState<Intervention[]>([])
  const [noInt, setNoInt] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('interventions').select('id, slot_id, person_id, start_at, end_at, note, status, reject_reason, resend_comment, decided_by_name, decided_at'),
      supabase.from('shift_no_intervention').select('slot_id'),
    ])
    if (a.error || b.error) { setError((a.error ?? b.error)!.message); return }
    setError(null)
    setIvs(((a.data ?? []) as InterventionRow[]).map(rowToIntervention))
    setNoInt(new Set(((b.data ?? []) as { slot_id: string }[]).map((x) => x.slot_id)))
  }, [])
  useEffect(() => {
    if (!enabled) return
    void Promise.resolve().then(reload)
    const ch = supabase.channel('interventions-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interventions' }, () => void reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_no_intervention' }, () => void reload())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [enabled, reload])
  return { ivs, noInt, error, reload }
}

/** I miei turni e interventi; si aggiornano alle modifiche, ogni 5 minuti e quando si torna sulla scheda. */
export function useMyShifts(enabled: boolean) {
  const [data, setData] = useState<MyShifts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setData(parseMyShifts(await rpc('my_shifts', {})))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    if (!enabled) return
    void Promise.resolve().then(reload)
    const timer = window.setInterval(() => void reload(), 5 * 60_000)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    const ch = supabase.channel('interventions-mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interventions' }, () => void reload())
      .subscribe()
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); void supabase.removeChannel(ch) }
  }, [enabled, reload])
  return { data, error, reload }
}
