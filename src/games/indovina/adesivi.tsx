import type { DatiAdesivo } from '@/components/Adesivo'
import type { VistaIndovina } from '@shared/types'

/** Gli adesivi di Indovina chi: com'e' finita, nel rosso del gioco. */

export const ADESIVO_FINE_MS = 2_200

const ROSSO = 'linear-gradient(155deg, var(--indovina-1), var(--indovina-2) 80%)'

export function adesivoFine(v: VistaIndovina): Omit<DatiAdesivo, 'id'> | null {
  if (v.stato !== 'finita' || !v.vincitore) return null
  const segreto = v.suoSegreto !== null ? v.personaggi.voci[v.suoSegreto]?.nome : null
  const suo = v.avversario?.displayName ?? 'L’altro'
  const vinto = v.vincitore === 'io'
  const base = { durata: ADESIVO_FINE_MS, colore: vinto ? ROSSO : 'var(--indovina-2)' }
  switch (v.motivo) {
    case 'indovinato':
      return vinto
        ? { ...base, tono: 'vivace', titolo: 'Indovinato!', sotto: segreto ? `Era ${segreto}` : undefined, suono: 'vittoria' }
        : { ...base, tono: 'bordato', titolo: `${suo} ha indovinato`, suono: 'sconfitta' }
    case 'sbagliato':
      return vinto
        ? { ...base, tono: 'vivace', titolo: 'Hai vinto!', sotto: `${suo} ha sbagliato`, suono: 'vittoria' }
        : { ...base, tono: 'bordato', titolo: 'Sbagliato', sotto: segreto ? `Era ${segreto}` : undefined, suono: 'sconfitta' }
    case 'resa':
    case 'assenza':
      return vinto
        ? { ...base, tono: 'vivace', titolo: 'Hai vinto!', sotto: `${suo} ha lasciato la partita`, suono: 'vittoria' }
        : { ...base, tono: 'bordato', titolo: 'Partita chiusa', suono: 'esce' }
    default:
      return null
  }
}
