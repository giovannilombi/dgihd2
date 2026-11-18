// Endpoint per servizi di monitoraggio (es. UptimeRobot): esegue una query sul database per
// mantenerlo attivo (i progetti gratuiti vanno in pausa dopo 7 giorni senza attività).
// Non restituisce alcun dato.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await db.rpc('ping')
  return new Response(error ? 'errore' : String(data), {
    status: error ? 503 : 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
