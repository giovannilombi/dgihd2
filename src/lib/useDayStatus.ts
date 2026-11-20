import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { dayStatusMap, type DayStatusMap, type DayStatusRow } from './dayStatus'

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as unknown
}

/** Azioni sui giorni: le regole (chi, quando) le applica il database. */
export const markDayErogato = (day: string) => rpc('mark_day_erogato', { p_day: day })
export const consuntivaDay = (day: string) => rpc('consuntiva_day', { p_day: day })
export const consuntivaMonth = async (month: string) => Number(await rpc('consuntiva_month', { p_month: month })) || 0
export const unlockDay = async (day: string, note?: string) => String(await rpc('unlock_day', { p_day: day, p_note: note?.trim() || null }))

/** Giorni erogati e consuntivati, aggiornati in tempo reale. */
export function useDayStatus(enabled: boolean) {
  const [days, setDays] = useState<DayStatusMap>({})
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const { data, error: err } = await supabase.from('day_status').select('day, erogato_at, erogato_by_name, consuntivato_at, consuntivato_by_name')
    if (err) { setError(err.message); return }
    setError(null)
    setDays(dayStatusMap((data ?? []) as DayStatusRow[]))
  }, [])
  useEffect(() => {
    if (!enabled) return
    void Promise.resolve().then(reload)
    const ch = supabase.channel('day-status').on('postgres_changes', { event: '*', schema: 'public', table: 'day_status' }, () => void reload()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [enabled, reload])
  return { days, error, reload }
}
