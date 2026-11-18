import { useState } from 'react'
import { PasswordDialog } from './TeamGate'

/**
 * Stato "dati visibili" della pagina anagrafica: vive solo finché la pagina resta aperta.
 * Cambiando sezione il componente viene smontato e RAL/livello tornano oscurati.
 */
export function useRevealSensitive() {
  const [revealed, setRevealed] = useState(false)
  const [asking, setAsking] = useState(false)
  const toggle = () => (revealed ? setRevealed(false) : setAsking(true))
  const dialog = asking ? (
    <PasswordDialog
      title="Mostra RAL e livello"
      description="Per rendere visibili e modificabili RAL e livello reinserisci la password dell'anagrafica."
      onSuccess={() => { setAsking(false); setRevealed(true) }}
      onClose={() => setAsking(false)}
    />
  ) : null
  return { revealed, toggle, dialog }
}
