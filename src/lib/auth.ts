// Protezione d'accesso lato client: il bundle contiene solo l'hash SHA-256 di "utente:password".
// È un cancello contro l'accesso casuale, non una cifratura dei dati (l'app è statica, senza server).
const CREDENTIAL_HASH = 'c37d44fc502366ff6928b3c9fd00d41c6834946e7a6a6583da1d0bed2b62e638'
const SESSION_KEY = 'reperibilita-q4-2026:auth'

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyCredentials(user: string, password: string) {
  return (await sha256Hex(`${user.trim().toLowerCase()}:${password}`)) === CREDENTIAL_HASH
}

export const isAuthenticated = () => {
  try { return sessionStorage.getItem(SESSION_KEY) === CREDENTIAL_HASH } catch { return false }
}
export const setAuthenticated = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(SESSION_KEY, CREDENTIAL_HASH)
    else sessionStorage.removeItem(SESSION_KEY)
  } catch { /* storage non disponibile */ }
}
