// Funzione server "planner": vincoli che dipendono da RAL e livello, importi delle RAL Q/ e auto-compilazione.
// Gira con accesso completo ai dati (chiave di servizio) e restituisce solo esiti:
// - persone di altri team: regole violate, mai RAL, livelli, ore o importi;
// - persone Q/ del proprio team: importi e ore già calcolati, mai la RAL media di riferimento,
//   che sta nella tabella server_params, leggibile solo dal server.
// Le regole sono le stesse dell'app (src/lib).
// Il file distribuito (index.js) si genera con: npm run build:planner
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import { rowsToData, type AssignmentRow, type DetailsRow, type PersonRow, type PrivateRow } from '../../../src/lib/mapping'
import { regenerate } from '../../../src/lib/rules'
import { salaryRuleChecks } from '../../../src/lib/salaryChecks'
import { USER_TEAMS, type UserTeam } from '../../../src/lib/types'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (message: string, status = 400) => json({ error: message }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Metodo non consentito', 405)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who } = await db.auth.getUser(token)
  if (!who?.user) return fail('Sessione non valida: accedi di nuovo.', 401)
  const { data: me } = await db.from('profiles').select('role, team, must_change_password').eq('id', who.user.id).maybeSingle()
  if (!me || me.must_change_password) return fail('Accesso non abilitato.', 403)
  const readFull = ['super_admin', 'editor', 'viewer_plus'].includes(me.role)
  const canEdit = ['super_admin', 'editor'].includes(me.role)
  if (!readFull) return fail('Operazione non disponibile per il tuo livello.', 403)

  let body: { action?: string; from?: string; to?: string }
  try { body = await req.json() } catch { return fail('Richiesta non valida') }

  // Dati completi (solo in memoria sul server)
  const [people, details, privates, assignments, excluded, settings, serverParams] = await Promise.all([
    db.from('people').select('id, name, color, active, sort, team'),
    db.from('people_details').select('person_id, availability, max_per_month, unavailable, preferred_days, reserve, reserve_order'),
    db.from('people_private').select('person_id, level, ral, ral_nd'),
    db.from('assignments').select('slot_id, person_id, pinned'),
    db.from('excluded_days').select('day'),
    db.from('settings').select('params').eq('id', 1).maybeSingle(),
    // RAL media di riferimento per le RAL Q/: tabella leggibile solo dal server
    db.from('server_params').select('nd_ral').eq('id', 1).maybeSingle(),
  ])
  for (const r of [people, details, privates, assignments, excluded, settings, serverParams]) if (r.error) return fail(r.error.message, 500)
  const data = rowsToData(
    people.data as PersonRow[], details.data as DetailsRow[], privates.data as PrivateRow[],
    assignments.data as AssignmentRow[], (excluded.data as { day: string }[]).map((x) => x.day),
    (settings.data as { params?: unknown } | null)?.params,
  )
  const ndRal = Number((serverParams.data as { nd_ral?: unknown } | null)?.nd_ral)
  if (Number.isFinite(ndRal) && ndRal > 0) data.params.ndRal = ndRal
  else delete data.params.ndRal

  if (body.action === 'violations') {
    // solo per le persone di cui l'utente NON vede RAL e livello (stessa regola della RLS)
    const myTeam = (USER_TEAMS as readonly string[]).includes(me.team) ? (me.team as UserTeam) : null
    return json(salaryRuleChecks(data, myTeam))
  }

  if (body.action === 'autofill') {
    if (!canEdit) return fail('Operazione riservata a chi può modificare.', 403)
    const from = String(body.from ?? ''), to = String(body.to ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return fail('Periodo non valido.')
    const res = regenerate(data.people, data.assignments, data.params, from, to, data.excludedDays, data.pinned)
    return json({ assignments: res })
  }

  return fail('Azione sconosciuta.')
})
