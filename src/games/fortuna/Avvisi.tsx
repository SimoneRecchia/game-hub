import type { ReactNode } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import type { DatiAdesivo } from '@/components/Adesivo'
import { IconGiornaliere } from '@/components/Icons'
import './Avvisi.css'
// L'adesivo del giro dopo si veste con gli altri adesivi della Fortuna, in voli.css.
import './voli.css'

/**
 * Il saldo non basta per puntare: lo si dice dove si punterebbe, con quanto
 * serve e quanto si ha, e la strada per farne — le giornaliere, i cui punti
 * sono il saldo. E' lo stesso avviso in tutti i giochi della Fortuna, una
 * targa scura con il filo d'ambra come il tabellone, in tutti e due i temi:
 * un gioco che non si puo' giocare non deve sembrare fermo, ne' rotto.
 * L'anello dice a che punto si e', e il numero dentro e' il saldo. Dice che
 * cosa serve e dove trovarlo, mai che cosa manca come un rimprovero.
 *
 * Il testo e' una regione `status`: chi legge lo schermo lo sente quando
 * compare, senza il link, che si raggiunge come gli altri.
 */
export function PochiPunti({
  servono,
  saldo,
  titolo,
  testo,
  className = '',
}: {
  /** Quanto serve per la prima puntata, o per la scheda piu' economica. */
  servono: number
  saldo: number
  /** Al posto di "Servono 10 punti": il SuperEnalotto dice quanto costa una scheda. */
  titolo?: string
  /** Al posto di "Ne hai 4". */
  testo?: string
  className?: string
}) {
  const ha = Math.max(0, saldo)
  const pieno = servono > 0 ? Math.min(1, ha / servono) : 0
  return (
    <div className={`ct-pochi ${className}`}>
      <div className="ct-pochi__dentro">
        <span className="ct-pochi__anello" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <circle className="ct-pochi__fondo" cx="20" cy="20" r="17" />
            {pieno > 0 && (
              <circle
                className="ct-pochi__pieno"
                cx="20"
                cy="20"
                r="17"
                pathLength={100}
                strokeDasharray={`${Math.max(4, pieno * 100)} 100`}
              />
            )}
          </svg>
          <span className="ct-pochi__ha u-tabnum">{ha}</span>
        </span>
        <span className="ct-pochi__testo" role="status">
          <span className="ct-pochi__titolo">
            {titolo ?? (servono === 1 ? 'Serve 1 punto' : `Servono ${servono} punti`)}
          </span>
          <span className="ct-pochi__sotto">{testo ?? (ha === 0 ? 'Si fanno con le giornaliere' : `Ne hai ${ha}`)}</span>
        </span>
        <Collegamento to={ROTTE.home} direzione="scheda" className="ct-pochi__vai">
          <IconGiornaliere size={19} />
          Gioca le giornaliere
        </Collegamento>
      </div>
    </div>
  )
}

/**
 * La puntata e' a zero e tocca a chi gioca: l'invito a mettere le fiches,
 * accanto alla mossa che aspetta, perché il gioco non sembri bloccato. Le
 * fiches da toccare lo dicono anche loro: la loro fila prende la classe
 * `CHIAMA_FICHES`, e saltano una dopo l'altra, piano, finché non se ne tocca
 * una. Non c'e' mai mentre si gira o si gioca una mano: solo quando si punta.
 */
export function InvitoPuntata({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`ct-invito ${className}`} role="status">
      <span className="ct-invito__fiche" aria-hidden="true" />
      {children}
    </p>
  )
}

/** La classe della fila di fiches che aspetta il primo tocco (Avvisi.css). */
export const CHIAMA_FICHES = 'ct-chiama'

/**
 * Un giro che non ha ridato niente: il biglietto lilla del giro dopo
 * (`ct-adesivo-ritenta`, in voli.css con gli altri adesivi della Fortuna), che
 * entra piano e non trema, senza suono — le fiches che tornano al banco hanno
 * gia' il loro. Dice una parola gentile che invita al giro dopo ("Al prossimo
 * giro"), mai che cosa si e' perso: la puntata si e' pagata quando si e'
 * giocato, e da li' in poi si racconta solo quel che torna.
 */
export const adesivoRitenta = (titolo: string, sotto?: string, durata = 1_700): Omit<DatiAdesivo, 'id'> => ({
  durata,
  tono: 'vivace',
  titolo,
  sotto,
  classe: 'ct-adesivo-ritenta',
})
