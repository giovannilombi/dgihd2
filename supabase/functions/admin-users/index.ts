// Gestione account del Piano reperibilità ARM.
// - change_password: qualsiasi utente autenticato cambia la propria password (obbligatorio al primo accesso)
// - list / create / reset / set_role / set_team / delete: solo super admin
// - process_requests: elabora la coda public.admin_requests (chiamata firmata dal database con il token del Vault)
// La chiave di servizio resta lato server: non è mai inviata al browser.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ROLES = ['super_admin', 'editor', 'viewer_plus', 'viewer'] as const
type Role = (typeof ROLES)[number]
const TEAMS = ['tech', 'design', 'pm', 'director', 'hr', 'governance'] as const
type Team = (typeof TEAMS)[number]
/** Team valido, oppure null (nessun team: RAL e livello non visibili). */
const parseTeam = (t: unknown): Team | null | undefined =>
  t === null || t === undefined || t === '' ? null : TEAMS.includes(t as Team) ? (t as Team) : undefined

const ANIMALI = [
  'airone', 'alce', 'alpaca', 'anatra', 'antilope', 'aquila', 'armadillo', 'asino', 'balena', 'barbagianni',
  'bisonte', 'bradipo', 'bruco', 'bufalo', 'cammello', 'camaleonte', 'canguro', 'capibara', 'capra', 'capriolo',
  'castoro', 'cavallo', 'cervo', 'cicogna', 'cigno', 'cinghiale', 'civetta', 'coccinella', 'colibri', 'coniglio',
  'corvo', 'criceto', 'delfino', 'donnola', 'dromedario', 'elefante', 'ermellino', 'fagiano', 'falco', 'fenicottero',
  'foca', 'formica', 'furetto', 'gabbiano', 'gallo', 'gambero', 'gazza', 'gazzella', 'geco', 'ghepardo',
  'ghiro', 'giaguaro', 'giraffa', 'gorilla', 'granchio', 'grillo', 'gufo', 'iena', 'koala', 'lama',
  'leone', 'leopardo', 'lepre', 'libellula', 'lince', 'lontra', 'lucertola', 'lupo', 'marmotta', 'medusa',
  'merlo', 'montone', 'orso', 'ornitorinco', 'panda', 'pantera', 'pappagallo', 'passero', 'pavone', 'pellicano',
  'pinguino', 'piccione', 'polpo', 'procione', 'puma', 'quaglia', 'rana', 'renna', 'riccio', 'rinoceronte',
  'rondine', 'salamandra', 'scoiattolo', 'squalo', 'stambecco', 'struzzo', 'tapiro', 'tartaruga', 'tasso', 'tigre',
  'tonno', 'tricheco', 'trota', 'tucano', 'upupa', 'volpe', 'zebra',
]

/** Password temporanea "animale-animale-NN" con generatore crittografico. */
function tempPassword() {
  const rnd = (n: number) => {
    const max = Math.floor(0x100000000 / n) * n
    const buf = new Uint32Array(1)
    do crypto.getRandomValues(buf); while (buf[0] >= max)
    return buf[0] % n
  }
  const a = ANIMALI[rnd(ANIMALI.length)]
  let b = ANIMALI[rnd(ANIMALI.length)]
  while (b === a) b = ANIMALI[rnd(ANIMALI.length)]
  return `${a}-${b}-${String(rnd(100)).padStart(2, '0')}`
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (message: string, status = 400) => json({ error: message }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Metodo non consentito', 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // --- Coda richieste dal database (firmata con token interno custodito nel Vault) ---
  const cliToken = req.headers.get('x-cli-token')
  if (cliToken) {
    const { data: valid } = await admin.rpc('verify_cli_token', { t: cliToken })
    if (valid !== true) return fail('Firma non valida.', 401)
    return json({ processed: await processQueue(admin) })
  }

  // Identità del chiamante dal token di sessione
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who, error: whoErr } = await admin.auth.getUser(token)
  if (whoErr || !who?.user) return fail('Sessione non valida: accedi di nuovo.', 401)
  const caller = who.user

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return fail('Richiesta non valida') }
  const action = String(body.action ?? '')

  const { data: me } = await admin.from('profiles').select('role, must_change_password').eq('id', caller.id).maybeSingle()
  if (!me) return fail('Account senza profilo: contatta il super admin.', 403)

  // --- Cambio password personale (anche con password temporanea) ---
  if (action === 'change_password') {
    const password = String(body.password ?? '')
    if (password.length < 10) return fail('La nuova password deve avere almeno 10 caratteri.')
    if (/^[a-z]+-[a-z]+-\d{2}$/.test(password)) return fail('Scegli una password diversa da quella temporanea.')
    const { error } = await admin.auth.admin.updateUserById(caller.id, { password })
    if (error) return fail(`Cambio password non riuscito: ${error.message}`)
    await admin.from('profiles').update({ must_change_password: false }).eq('id', caller.id)
    return json({ ok: true })
  }

  // --- Da qui solo super admin che ha già cambiato la password temporanea ---
  if (me.role !== 'super_admin' || me.must_change_password) return fail('Operazione riservata al super admin.', 403)

  const superAdmins = async () => (await admin.from('profiles').select('id').eq('role', 'super_admin')).data?.length ?? 0
  const validRole = (r: unknown): r is Role => ROLES.includes(r as Role)

  if (action === 'list') {
    const { data: profiles, error } = await admin.from('profiles').select('id, email, display_name, role, team, must_change_password, created_at').order('created_at')
    if (error) return fail(error.message, 500)
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const lastSeen = new Map((users?.users ?? []).map((u) => [u.id, u.last_sign_in_at]))
    return json({ users: (profiles ?? []).map((p) => ({ ...p, last_sign_in_at: lastSeen.get(p.id) ?? null })) })
  }

  if (action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const displayName = String(body.display_name ?? '').trim().slice(0, 80)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email non valida.')
    if (!validRole(body.role)) return fail('Livello non valido.')
    const team = parseTeam(body.team)
    if (team === undefined) return fail('Team non valido.')
    const password = tempPassword()
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) return fail(error?.message?.includes('already') ? 'Esiste già un account con questa email.' : `Creazione non riuscita: ${error?.message}`)
    const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, email, display_name: displayName, role: body.role, team, must_change_password: true })
    if (pErr) {
      await admin.auth.admin.deleteUser(data.user.id)
      return fail(`Creazione non riuscita: ${pErr.message}`, 500)
    }
    return json({ ok: true, user_id: data.user.id, temp_password: password })
  }

  const userId = String(body.user_id ?? '')
  const { data: target } = await admin.from('profiles').select('id, role').eq('id', userId).maybeSingle()
  if (!target) return fail('Utente non trovato.', 404)

  if (action === 'reset') {
    const password = tempPassword()
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return fail(`Reset non riuscito: ${error.message}`)
    // con must_change_password=true il database non restituisce più dati finché la password non viene cambiata
    await admin.from('profiles').update({ must_change_password: true }).eq('id', userId)
    return json({ ok: true, temp_password: password })
  }

  if (action === 'set_role') {
    if (!validRole(body.role)) return fail('Livello non valido.')
    if (target.role === 'super_admin' && body.role !== 'super_admin' && (await superAdmins()) <= 1) return fail('Deve restare almeno un super admin.')
    const { error } = await admin.from('profiles').update({ role: body.role }).eq('id', userId)
    if (error) return fail(error.message, 500)
    return json({ ok: true })
  }

  if (action === 'set_team') {
    const team = parseTeam(body.team)
    if (team === undefined) return fail('Team non valido.')
    const { error } = await admin.from('profiles').update({ team }).eq('id', userId)
    if (error) return fail(error.message, 500)
    return json({ ok: true })
  }

  if (action === 'delete') {
    if (target.role === 'super_admin' && (await superAdmins()) <= 1) return fail('Deve restare almeno un super admin.')
    if (userId === caller.id && target.role !== 'super_admin') return fail('Non puoi eliminare il tuo account.')
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return fail(`Eliminazione non riuscita: ${error.message}`, 500)
    return json({ ok: true })
  }

  return fail('Azione sconosciuta.')
})

type Admin = ReturnType<typeof createClient>

/** Esegue le richieste in attesa nella coda e ne registra l'esito (password temporanea inclusa). */
async function processQueue(admin: Admin) {
  const { data: pending } = await admin.from('admin_requests').select('*').eq('status', 'pending').order('id')
  let n = 0
  for (const r of (pending ?? []) as { id: number; action: string; email: string; display_name: string; role: Role | null; team: string | null }[]) {
    const done = (patch: Record<string, unknown>) =>
      admin.from('admin_requests').update({ ...patch, processed_at: new Date().toISOString() }).eq('id', r.id)
    try {
      const email = r.email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email non valida.')
      if (r.action === 'create') {
        if (!r.role || !ROLES.includes(r.role)) throw new Error('Livello non valido.')
        const team = parseTeam(r.team)
        if (team === undefined) throw new Error('Team non valido.')
        const password = tempPassword()
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
        if (error || !data.user) throw new Error(error?.message?.includes('already') ? 'Esiste già un account con questa email.' : `Creazione non riuscita: ${error?.message}`)
        const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, email, display_name: r.display_name.trim().slice(0, 80), role: r.role, team, must_change_password: true })
        if (pErr) { await admin.auth.admin.deleteUser(data.user.id); throw new Error(pErr.message) }
        await done({ status: 'done', temp_password: password })
      } else {
        const { data: target } = await admin.from('profiles').select('id, role').eq('email', email).maybeSingle()
        if (!target) throw new Error('Utente non trovato.')
        const superAdmins = (await admin.from('profiles').select('id').eq('role', 'super_admin')).data?.length ?? 0
        if (r.action === 'reset') {
          const password = tempPassword()
          const { error } = await admin.auth.admin.updateUserById(target.id, { password })
          if (error) throw new Error(error.message)
          await admin.from('profiles').update({ must_change_password: true }).eq('id', target.id)
          await done({ status: 'done', temp_password: password })
        } else if (r.action === 'set_role') {
          if (!r.role || !ROLES.includes(r.role)) throw new Error('Livello non valido.')
          if (target.role === 'super_admin' && r.role !== 'super_admin' && superAdmins <= 1) throw new Error('Deve restare almeno un super admin.')
          await admin.from('profiles').update({ role: r.role }).eq('id', target.id)
          await done({ status: 'done' })
        } else if (r.action === 'set_team') {
          const team = parseTeam(r.team)
          if (team === undefined) throw new Error('Team non valido.')
          await admin.from('profiles').update({ team }).eq('id', target.id)
          await done({ status: 'done' })
        } else if (r.action === 'delete') {
          if (target.role === 'super_admin' && superAdmins <= 1) throw new Error('Deve restare almeno un super admin.')
          const { error } = await admin.auth.admin.deleteUser(target.id)
          if (error) throw new Error(error.message)
          await done({ status: 'done' })
        }
      }
    } catch (e) {
      await done({ status: 'error', error: (e as Error).message })
    }
    n++
  }
  return n
}
