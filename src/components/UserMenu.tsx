import { useState } from 'react'
import { roleAccess, ROLE_HELP, ROLE_LABEL, type Profile } from '../lib/roles'
import { teamLabel } from '../lib/teams'
import { useTeams } from '../lib/useTeams'
import { ChangePasswordForm } from './ChangePassword'

const initials = (p: Profile) => (p.display_name || p.email).split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')

export function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button role="menuitem" type="button" onClick={onClick}
      className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 ${danger ? 'text-red-700' : 'text-slate-700'}`}>{children}</button>
  )
}

/** Menu dell'utente nell'intestazione: livello, team, guida del profilo, cambio password, uscita. */
export function UserMenu({ profile, onLogout, onChangePassword, onOpenGuide }: { profile: Profile; onLogout: () => void; onChangePassword: (pwd: string) => Promise<void>; onOpenGuide?: () => void }) {
  const [open, setOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const role = profile.role
  const teams = useTeams()
  return (
    <>
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-left ring-1 ring-slate-200 hover:bg-slate-50">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-700 text-xs font-semibold text-white">{initials(profile)}</span>
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-40 truncate text-sm font-medium text-slate-900">{profile.display_name || profile.email}</span>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-700">{ROLE_LABEL[role]}{profile.team && <span className="text-slate-500"> · {teamLabel(teams, profile.team)}</span>}</span>
          </span>
          <span className="text-slate-400">▾</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
            <div role="menu" className="absolute right-0 z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              <div className="px-3 py-2">
                <div className="text-sm font-medium text-slate-900">{profile.display_name || '—'}</div>
                <div className="truncate text-xs text-slate-500">{profile.email}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 ring-1 ring-blue-200">Profilo: {ROLE_LABEL[role]}</span>
                  <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">Team: {profile.team ? teamLabel(teams, profile.team) : 'non assegnato'}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{ROLE_HELP[role]}</div>
                <div className="mt-0.5 text-xs text-slate-500">{roleAccess(role, profile.team, teams).ralText}</div>
              </div>
              <div className="my-1 border-t border-slate-100" />
              {onOpenGuide && <MenuItem onClick={() => { setOpen(false); onOpenGuide() }}>Guida del tuo profilo</MenuItem>}
              <MenuItem onClick={() => { setOpen(false); setPwdOpen(true) }}>Cambia password</MenuItem>
              <MenuItem danger onClick={() => { setOpen(false); onLogout() }}>Esci</MenuItem>
            </div>
          </>
        )}
      </div>
      {pwdOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="cp-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="cp-title" className="mb-3 text-lg font-semibold text-slate-900">Cambia password</h3>
            <ChangePasswordForm onSubmit={onChangePassword} onCancel={() => setPwdOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
