import type { DaySlot } from '@shared/types'
import { IconCheck, IconClose, IconLock } from '@/components/Icons'
import {
  ALTEZZA,
  LARGHEZZA,
  TAPPE,
  aSinistra,
  avanzamento,
  dettaglioTappa,
  nomeTappa,
  statoTappa,
  tracciato,
} from './percorso'
import './Percorso.css'

interface Props {
  day: DaySlot[]
  /** La parola aperta al tocco. */
  onOpen: (slot: number) => void
  /** Chiamato quando si tocca una tappa ancora chiusa. */
  onBlocked: (slot: number) => void
}

/**
 * La mappa delle cinque parole della giornata.
 *
 * Una serpentina di cinque tappe unite da un tracciato: pieno fin dove si e'
 * arrivati, tratteggiato dopo. La forma dice la regola senza spiegarla — le
 * parole si aprono una per volta — e la dice meglio di qualunque frase, perché
 * una strada la si legge in un colpo d'occhio.
 *
 * Il tracciato e' un SVG solo, non un elemento per tratto: le tappe non stanno
 * su una griglia, e cinque segmenti ruotati singolarmente non si toccherebbero
 * mai davvero agli estremi. Con `pathLength={1}` la parte piena si misura in
 * frazioni del percorso, quindi arriva esattamente sulla tappa raggiunta senza
 * che il codice sappia quanto e' lunga la curva.
 */
export function Percorso({ day, onOpen, onBlocked }: Props) {
  const d = tracciato(TAPPE)
  const fatto = avanzamento(day)

  return (
    <div className="mappa">
      <svg
        className="mappa__tracciato"
        viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}
        /*
         * `none`: il tracciato si stira per riempire il riquadro, invece di
         * conservare il suo rapporto.
         *
         * Serve perché le tappe sono posizionate in percentuale del riquadro:
         * col comportamento normale ("meet") su un riquadro di rapporto diverso
         * l'SVG si sarebbe centrato con due bande vuote, e la curva non sarebbe
         * piu' passata per i nodi. Cosi' invece il riquadro puo' prendere la
         * larghezza e l'altezza che ha davvero — che su uno schermo piccolo e' la
         * differenza fra etichette dentro la scheda e etichette che sbordano. Lo
         * spessore della linea si scala di conseguenza, di un dieci per cento fra
         * un tratto ripido e uno piatto: a tre pixel e mezzo non si vede.
         */
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className="mappa__resto" d={d} />
        {/*
          La parte percorsa sta sopra e copre il tratteggio sotto. A giornata
          intatta non si disegna affatto: un tratto di lunghezza zero con la
          punta arrotondata diventa un puntino, e quel puntino compariva in mezzo
          al lucchetto dell'ultima tappa — dove il tratteggio finisce.
        */}
        {fatto > 0 && (
          <path className="mappa__fatto" d={d} pathLength={1} strokeDasharray={`${fatto} 1`} />
        )}
      </svg>

      <ol className="mappa__tappe">
        {day.map((t, i) => {
          const punto = TAPPE[i]
          const stato = statoTappa(t)
          const bloccata = stato === 'bloccata'
          const sinistra = aSinistra(punto)

          return (
            <li
              className={`tappa tappa--${sinistra ? 'sx' : 'dx'}`}
              key={t.slot}
              style={{
                /*
                 * Le tappe a destra si ancorano con `right`, non con `left`.
                 * Non e' un dettaglio: la larghezza di un elemento assoluto in
                 * shrink-to-fit e' limitata dallo spazio fra il lato ancorato e
                 * il bordo opposto. Con `left: 72%` l'etichetta aveva ventotto
                 * per cento di riquadro in cui stare e "2ª parola" andava a
                 * capo su due righe; con `right` lo spazio e' quello vero, dal
                 * nodo verso il centro.
                 */
                ...(sinistra
                  ? { left: `${punto.x}%` }
                  : { right: `${LARGHEZZA - punto.x}%` }),
                top: `${(punto.y / ALTEZZA) * 100}%`,
                // Le tappe entrano una dopo l'altra, dall'alto: il ritardo dice
                // in che ordine si percorrono.
                ['--i' as string]: String(i),
              }}
            >
              <button
                type="button"
                /*
                 * Niente `disabled` né `aria-disabled` sulle tappe chiuse.
                 * Verificato: marcandole disabilitate il tocco non arriva piu',
                 * quindi la spiegazione ("prima finisci la 2ª") non compariva
                 * mai e il bottone sembrava rotto. L'aspetto dice che e'
                 * inattivo, l'etichetta dice perché.
                 */
                className={`nodo nodo--${stato}`}
                aria-label={`${nomeTappa(t.slot)}: ${dettaglioTappa(t)}`}
                onClick={() => (bloccata ? onBlocked(t.slot) : onOpen(t.slot))}
              >
                <span className="nodo__faccia">
                  {stato === 'vinta' ? (
                    <IconCheck size={26} />
                  ) : stato === 'persa' ? (
                    <IconClose size={22} />
                  ) : bloccata ? (
                    <IconLock size={20} />
                  ) : (
                    <span className="nodo__numero">{t.slot}</span>
                  )}
                </span>
              </button>

              <span className="tappa__testo">
                <span className="tappa__nome">{nomeTappa(t.slot)}</span>
                <span className="tappa__dettaglio">{dettaglioTappa(t)}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
