import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import type { Profile } from './roles'
import { adminCall, supabase } from './supabase'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'no-profile'; session: Session }
  | { status: 'ready'; session: Session; profile: Profile }

async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('id, email, display_name, role, must_change_password').eq('id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as Profile | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async (session: Session | null) => {
    if (!session) return setState({ status: 'signed-out' })
    try {
      const profile = await fetchProfile(session.user.id)
      setState(profile ? { status: 'ready', session, profile } : { status: 'no-profile', session })
    } catch {
      setState({ status: 'no-profile', session })
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => refresh(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setState({ status: 'signed-out' })
      else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void refresh(session)
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) throw new Error(error.message.includes('Invalid login') ? 'Email o password non corrette.' : error.message)
  }
  const signOut = () => supabase.auth.signOut({ scope: 'local' })

  /** Cambio password (obbligatorio al primo accesso): passa dalla funzione server che azzera il flag. */
  const changePassword = async (password: string) => {
    await adminCall({ action: 'change_password', password })
    const { data } = await supabase.auth.getSession()
    await refresh(data.session)
  }

  return { state, signIn, signOut, changePassword }
}

/** Verifica la password dell'utente corrente senza cambiare sessione di lavoro (sblocco RAL, export). */
export async function verifyOwnPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return !error
}
