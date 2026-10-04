import { forwardRef, type CSSProperties, type ReactNode, type Ref } from 'react'
import { Avatar } from '@/components/Avatar'
import { conSegno } from '@shared/ruota'
import { esitoMano, type EsitoMano } from '@shared/blackjack'
import type { PostoVistaBJ } from '@shared/types'
import { Fiche, PilaFiches, coloreFiche, scomponi } from './Fiches'
import { Mano } from './Mano'
import { chiaveCarta, type ArrivoCarta } from './piano'

/**
 * I pezzi del tavolo che si vedono e basta: il panno con le scritte, il sabot,
 * la rastrelliera del banco, gli scarti, e i posti degli altri. Lo stato lo
 * tiene la pagina (pages/BlackjackTavolo.tsx).
 */

export interface CarteInGioco {
  giro: number
  arrivi: ReadonlyMap<string, ArrivoCarta>
  inArrivo: ReadonlySet<string>
  onAtterra: (chiave: string) => void
}

/**
 * Le scritte sul panno, lungo l'arco, come sui tavoli veri: quanto paga il
 * blackjack, come gioca il banco, e la linea dell'assicurazione, che si
 * accende quando il banco la offre (`offerta`).
 */
export function Scritte({ offerta = false }: { offerta?: boolean }) {
  return (
    <svg
      className={`bj-scritte${offerta ? ' is-offerta' : ''}`}
      viewBox="0 0 400 136"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <path id="bj-arco-grande" d="M 26 22 Q 200 104 374 22" />
        <path id="bj-arco-piccolo" d="M 70 60 Q 200 122 330 60" />
        <path id="bj-arco-assicurazione" d="M 88 92 Q 200 153 312 92" />
      </defs>
      <path d="M 44 44 Q 200 122 356 44" className="bj-scritte__filo" />
      <text className="bj-scritte__grande">
        <textPath href="#bj-arco-grande" startOffset="50%" textAnchor="middle">
          IL BLACKJACK PAGA 1 A 1
        </textPath>
      </text>
      <text className="bj-scritte__piccola">
        <textPath href="#bj-arco-piccolo" startOffset="50%" textAnchor="middle">
          IL BANCO STA SU TUTTI I 17
        </textPath>
      </text>
      <g className="bj-scritte__linea">
        <path d="M 80 76 Q 200 136 320 76" className="bj-scritte__bordo" />
        <path d="M 98 100 Q 200 160 302 100" className="bj-scritte__bordo" />
        <text className="bj-scritte__assicurazione">
          <textPath href="#bj-arco-assicurazione" startOffset="50%" textAnchor="middle">
            L’ASSICURAZIONE PAGA 2 A 1
          </textPath>
        </text>
      </g>
    </svg>
  )
}

/** Il segno dell'assicurazione: uno scudo, sul bottone e sul panno. */
export function SegnoAssicurazione({ className = '' }: { className?: string }) {
  return (
    <svg className={`bj-scudo ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 20 5.6v5.7c0 4.9-3.3 8.7-8 10.2-4.7-1.5-8-5.3-8-10.2V5.6z" />
      <path d="m8.4 12.2 2.5 2.5 4.8-5" className="bj-scudo__spunta" />
    </svg>
  )
}

/**
 * Il posto della mia assicurazione, accanto alla puntata: si accende quando il
 * banco la offre, tiene la fiche quando ci si assicura e, a giro chiuso, dice
 * com'e' andata con la sua fascia. Senza offerta e senza fiche non c'e'. La
 * fiche e' una sola, con l'importo: la meta' della puntata non e' sempre un
 * taglio, e pagata 2 a 1 diventa il triplo.
 */
export const PostoAssicurazione = forwardRef(function PostoAssicurazione(
  {
    importo,
    offerta,
    esito,
    pila,
  }: {
    importo: number
    offerta: boolean
    esito: 'pagata' | 'persa' | null
    /** La fiche a giro chiuso: pagata 2 a 1, o andata via. */
    pila: 'ferma' | 'vinta' | 'via'
  },
  ref: Ref<HTMLDivElement>,
) {
  if (!offerta && importo === 0) return null
  const valore = pila === 'vinta' ? importo * 3 : importo
  return (
    <div className={`bj-assicurazione${offerta ? ' is-offerta' : ''}${esito ? ` is-${esito}` : ''}`} ref={ref}>
      {importo === 0 ? (
        <SegnoAssicurazione className="bj-assicurazione__segno" />
      ) : (
        pila !== 'via' && (
          <Fiche
            key={valore}
            valore={valore}
            className={`bj-assicurazione__fiche${pila === 'vinta' ? ' is-vinta' : ''}`}
            style={{ '--fiche': coloreFiche(valore) } as CSSProperties}
          />
        )
      )}
      {esito && (
        <span className={`bj-assicurazione__esito is-${esito}`} key={esito}>
          {esito === 'pagata' ? 'Pagata' : 'Persa'}
        </span>
      )}
    </div>
  )
})

/** Il sabot, in alto a destra: le carte escono dalla bocca. */
export const Sabot = forwardRef(function Sabot(_: unknown, bocca: Ref<HTMLSpanElement>) {
  return (
    <div className="bj-sabot" aria-hidden="true">
      <span className="bj-sabot__cassa" />
      <span className="bj-sabot__bocca" ref={bocca} />
    </div>
  )
})

/** La rastrelliera del banco: le fiches in colonna, da dove si paga e dove finisce quel che si perde. */
export const Rastrelliera = forwardRef(function Rastrelliera(_: unknown, ref: Ref<HTMLDivElement>) {
  const colonne = [500, 100, 50, 25, 10, 25, 50, 100]
  return (
    <div className="bj-rastrelliera" ref={ref} aria-hidden="true">
      {colonne.map((v, i) => (
        <span key={i} className={`bj-rastrelliera__colonna is-${v}`} />
      ))}
    </div>
  )
})

/** Il porta scarti, in alto a sinistra: le carte raccolte a fine giro ci volano dentro. */
export const Scarti = forwardRef(function Scarti(_: unknown, ref: Ref<HTMLDivElement>) {
  return <div className="bj-scarti" ref={ref} aria-hidden="true" />
})

/** Le chiavi delle carte di una mano, per il piano. */
export const chiaviMano = (giro: number, posto: number, id: number, n: number) =>
  Array.from({ length: n }, (_, i) => chiaveCarta(giro, posto, id, i))

/** L'esito di ogni mano di un posto, a giro chiuso; niente prima. */
export function esitiDelPosto(p: PostoVistaBJ, banco: readonly string[], chiuso: boolean): (EsitoMano | null)[] {
  return p.mani.map((m) => (chiuso && p.delta !== null ? esitoMano(m, banco) : null))
}

/**
 * Il posto di un altro giocatore: le sue mani piccole, chi e', la sua puntata
 * e, a giro chiuso, quel che ha vinto o perso. Il turno ha l'anello che si
 * consuma con il tempo.
 */
export function PostoAltro({
  posto,
  indice,
  turno,
  banco,
  chiuso,
  carte,
  tempo,
  style,
}: {
  posto: PostoVistaBJ
  indice: number
  turno: { posto: number; mano: number } | null
  banco: readonly string[]
  chiuso: boolean
  carte: CarteInGioco
  /** Il tempo del turno, se tocca a lui e conta: quanto resta e quanto era. */
  tempo: { resta: number; tutto: number } | null
  style?: CSSProperties
}) {
  const mio = turno?.posto === indice
  const esiti = esitiDelPosto(posto, banco, chiuso)
  return (
    <div
      className={`bj-altro${mio ? ' is-turno' : ''}${posto.via ? ' is-via' : ''}${posto.presente ? '' : ' is-assente'}`}
      style={style}
    >
      <div className="bj-altro__mani">
        {posto.mani.map((m, o) => (
          <Mano
            key={m.id ?? o}
            carte={m.carte}
            chiavi={chiaviMano(carte.giro, indice, m.id ?? o, m.carte.length)}
            arrivi={carte.arrivi}
            inArrivo={carte.inArrivo}
            onAtterra={carte.onAtterra}
            divisa={m.divisa}
            esito={esiti[o]}
            attiva={mio && turno?.mano === o && posto.mani.length > 1}
            className="bj-mano--piccola"
          />
        ))}
      </div>
      <div className="bj-altro__chi">
        <span className="bj-altro__avatar">
          <Avatar nickname={posto.giocatore.nickname} color={posto.giocatore.avatarColor} size={30} />
          {tempo && <AnelloTempo {...tempo} />}
        </span>
        <span className="bj-altro__nome">{posto.giocatore.displayName}</span>
      </div>
      {posto.puntata > 0 && !(chiuso && posto.delta !== null) && (
        <PilaFiches pezzi={scomponi(posto.puntata)} massimo={5} className="bj-altro__pila" />
      )}
      {posto.assicurazione > 0 && !(chiuso && posto.delta !== null) && (
        <span className="bj-altro__assicurazione u-tabnum" aria-label={`Assicurazione ${posto.assicurazione}`}>
          <SegnoAssicurazione />
          {posto.assicurazione}
        </span>
      )}
      {chiuso && posto.delta !== null && (
        <span className={`bj-altro__delta u-tabnum${posto.delta > 0 ? ' is-piu' : posto.delta < 0 ? ' is-meno' : ''}`}>
          {posto.delta === 0 ? 'Pari' : conSegno(posto.delta)}
        </span>
      )}
    </div>
  )
}

/** Un posto libero: un cerchio sul panno. */
export function PostoLibero({ style }: { style?: CSSProperties }) {
  return (
    <div className="bj-altro is-libero" style={style}>
      <span className="bj-altro__cerchio" />
      <span className="bj-altro__nome">Libero</span>
    </div>
  )
}

/** L'anello del tempo attorno a chi deve decidere: si consuma fino alla scadenza. */
export function AnelloTempo({ resta, tutto }: { resta: number; tutto: number }) {
  const frazione = Math.max(0, Math.min(1, resta / tutto))
  return (
    <svg className={`bj-anello${resta < 5_000 ? ' is-poco' : ''}`} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" className="bj-anello__fondo" />
      <circle
        cx="20"
        cy="20"
        r="18"
        className="bj-anello__tempo"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset={100 - frazione * 100}
      />
    </svg>
  )
}

/**
 * Una riga di stato sopra i comandi: di chi e' il turno, quanto manca, che
 * cosa succede. Il conto alla rovescia si vede e non si legge: un lettore di
 * schermo lo ripeterebbe a ogni secondo.
 */
export function Stato({ children, tempo }: { children: ReactNode; tempo?: { resta: number; tutto: number } | null }) {
  return (
    <div className="bj-stato">
      <span className="bj-stato__testo" aria-live={tempo ? 'off' : 'polite'}>
        {children}
      </span>
      {tempo && <BarraTempo {...tempo} />}
    </div>
  )
}

/** La barra del tempo che resta: sotto la riga di stato, o sotto l'assicurazione quando prende il suo posto. */
export function BarraTempo({ resta, tutto }: { resta: number; tutto: number }) {
  return (
    <span className="bj-stato__barra" aria-hidden="true">
      <span
        className={`bj-stato__pieno${resta < 5_000 ? ' is-poco' : ''}`}
        style={{ transform: `scaleX(${Math.max(0, Math.min(1, resta / tutto))})` }}
      />
    </span>
  )
}
