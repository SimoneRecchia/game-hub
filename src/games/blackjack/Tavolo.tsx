import { forwardRef, useId, type CSSProperties, type Ref } from 'react'
import { Avatar } from '@/components/Avatar'
import { conSegno } from '@shared/ruota'
import { esitoMano, type EsitoMano } from '@shared/blackjack'
import type { PostoVistaBJ } from '@shared/types'
import { Fiche, coloreFiche } from './Fiches'
import { Mano } from './Mano'
import './Panno.css'
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

/*
 * Il panno, disegnato come nel mockup in un riquadro di 374 per 472: dritto
 * dalla parte del banco, una mezza ellisse dalla parte dei giocatori, con il
 * bordo di legno. Le scritte e i fili sono archi dello stesso centro (187, 22),
 * cosi' restano alla stessa distanza da un capo all'altro; la linea
 * dell'assicurazione e' una fascia larga lungo il suo arco, fra due fili d'oro,
 * e si accende quando il banco la offre. Tutto il resto del tavolo si misura
 * nelle stesse unita' (`--u` in BlackjackTavolo.css), quindi sta dove sta nel
 * mockup a qualunque misura.
 */
const FORMA = 'M0 0H374V250A187 222 0 0 1 0 250Z'

export function Panno({ offerta = false, sala = false }: { offerta?: boolean; sala?: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={`bj-panno${offerta ? ' is-offerta' : ''}`} viewBox="0 0 374 472" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-feltro`} cx="50%" cy="34%" r="70%">
          <stop offset="0%" stopColor="#1a7d4c" />
          <stop offset="62%" stopColor="#136341" />
          <stop offset="100%" stopColor="#0b4a2e" />
        </radialGradient>
        <path id={`${id}-scritta`} d="M21.5 137.9A202 202 0 0 0 352.5 137.9" />
        <path id={`${id}-linea`} d="M16.0 180.3A233 233 0 0 0 358.0 180.3" />
      </defs>
      <path className="bj-panno__ombra" d={FORMA} />
      <path className="bj-panno__bordo" d={FORMA} />
      <path className="bj-panno__feltro" d={FORMA} fill={`url(#${id}-feltro)`} />
      <path className="bj-panno__oro" d="M10 10H364V248A177 212 0 0 1 10 248Z" />
      <path className="bj-panno__filo" d="M34.6 128.7A186 186 0 0 0 339.4 128.7" />
      <path className="bj-panno__filo" d="M16.6 141.3A208 208 0 0 0 357.4 141.3" />
      <path className="bj-panno__linea" d="M16.0 174.3A229 229 0 0 0 358.0 174.3" />
      <path className="bj-panno__filo is-oro" d="M16.0 157.2A218 218 0 0 0 358.0 157.2" />
      <path className="bj-panno__filo is-oro" d="M16.0 190.4A240 240 0 0 0 358.0 190.4" />
      <text className="bj-panno__scritta">
        <textPath href={`#${id}-scritta`} startOffset="50%">
          IL BLACKJACK PAGA 1 A 1
        </textPath>
      </text>
      <text className="bj-panno__scritta is-linea">
        <textPath href={`#${id}-linea`} startOffset="50%">
          L’ASSICURAZIONE PAGA 2 A 1
        </textPath>
      </text>
      <text className="bj-panno__scritta is-piccola" x="187" y="150">
        IL BANCO STA SU TUTTI I 17
      </text>
      <g className="bj-panno__rastrelliera">
        <rect x="118" y="-6" width="138" height="30" rx="7" />
        {[125, 142, 159, 176, 193, 210, 227].map((x, i) => (
          <rect key={x} className={`is-${(i % 4) + 1}`} x={x} y="-2" width="14" height="21" rx="3" />
        ))}
      </g>
      <g className="bj-panno__scarti">
        <rect className="bj-panno__scatola is-vuota" x="8" y="4" width="60" height="76" rx="9" />
        <rect className="bj-panno__carta" x="16" y="16" width="44" height="58" rx="6" transform="rotate(-6 38 45)" />
        <rect className="bj-panno__carta" x="16" y="12" width="44" height="58" rx="6" transform="rotate(4 38 41)" />
      </g>
      <g className="bj-panno__sabot">
        <rect className="bj-panno__scatola" x="306" y="4" width="60" height="76" rx="9" />
        <rect className="bj-panno__carta" x="314" y="12" width="44" height="62" rx="6" />
        <path className="bj-panno__righe" d="M320 20l32 46M330 18l24 36M318 34l22 34" />
      </g>
      {/* Nella sala il tavolo e' vuoto: niente posto dell'assicurazione. */}
      {!sala && <circle className="bj-panno__cerchio is-assicurazione" cx="139" cy="428" r="15" />}
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

/*
 * Il sabot, la rastrelliera e gli scarti sono disegnati nel panno: qui ci sono
 * i loro punti, invisibili, da dove partono e dove arrivano le carte e le
 * fiches che volano.
 */

/** La bocca del sabot, in alto a destra: le carte escono da qui. */
export const Sabot = forwardRef(function Sabot(_: unknown, bocca: Ref<HTMLSpanElement>) {
  return <span className="bj-punto is-sabot" ref={bocca} aria-hidden="true" />
})

/** La rastrelliera del banco: da dove si paga e dove finisce quel che si perde. */
export const Rastrelliera = forwardRef(function Rastrelliera(_: unknown, ref: Ref<HTMLSpanElement>) {
  return <span className="bj-punto is-rastrelliera" ref={ref} aria-hidden="true" />
})

/** Il porta scarti, in alto a sinistra: le carte raccolte a fine giro ci volano dentro. */
export const Scarti = forwardRef(function Scarti(_: unknown, ref: Ref<HTMLSpanElement>) {
  return <span className="bj-punto is-scarti" ref={ref} aria-hidden="true" />
})

/** Le chiavi delle carte di una mano, per il piano. */
export const chiaviMano = (giro: number, posto: number, id: number, n: number) =>
  Array.from({ length: n }, (_, i) => chiaveCarta(giro, posto, id, i))

/** L'esito di ogni mano di un posto, a giro chiuso; niente prima. */
export function esitiDelPosto(p: PostoVistaBJ, banco: readonly string[], chiuso: boolean): (EsitoMano | null)[] {
  return p.mani.map((m) => (chiuso && p.delta !== null ? esitoMano(m, banco) : null))
}

/**
 * Da che parte del tavolo sta un posto: le carte e la puntata stanno dalla
 * parte del centro, dove al tavolo vero ognuno ha il cerchio della sua puntata.
 */
export type LatoPosto = 'sinistra' | 'destra'

/**
 * Il posto di un altro giocatore: chi e', le sue mani piccole, la sua puntata
 * in una fiche sul suo cerchio e, a giro chiuso, quel che ha vinto o perso. Il
 * turno ha l'anello che si consuma con il tempo.
 *
 * Ogni pezzo del posto sta nel suo punto del panno (`data-posto` in
 * BlackjackTavolo.css): l'avatar, le carte, il cerchio della puntata. Gli
 * interni stanno dove li mette il mockup, ai lati delle mie carte; gli esterni
 * piu' in alto, sotto gli scarti e il sabot, con le carte verso il banco.
 */
export function PostoAltro({
  posto,
  indice,
  lato,
  arco,
  turno,
  banco,
  chiuso,
  carte,
  tempo,
}: {
  posto: PostoVistaBJ
  indice: number
  lato: LatoPosto
  /** Quale dei quattro punti del panno, da sinistra: dove sta lo dice il CSS. */
  arco: number
  turno: { posto: number; mano: number } | null
  banco: readonly string[]
  chiuso: boolean
  carte: CarteInGioco
  /** Il tempo del turno, se tocca a lui e conta: quanto resta e quanto era. */
  tempo: { resta: number; tutto: number } | null
}) {
  const mio = turno?.posto === indice
  const esiti = esitiDelPosto(posto, banco, chiuso)
  /** Quel che ha vinto o perso: c'e' solo a giro chiuso, quando le mani sono state pagate. */
  const delta = chiuso ? posto.delta : null
  return (
    <div
      className={`bj-altro is-${lato}${posto.mani.length > 1 ? ' is-divise' : ''}${mio ? ' is-turno' : ''}${
        posto.via ? ' is-via' : ''
      }${posto.presente ? '' : ' is-assente'}`}
      data-posto={arco}
    >
      <span className="bj-altro__cerchio" />
      <span className="bj-altro__avatar">
        <Avatar nickname={posto.giocatore.nickname} color={posto.giocatore.avatarColor} size={42} />
        {tempo && <AnelloTempo {...tempo} />}
      </span>
      <span className="bj-altro__nome">{posto.giocatore.displayName}</span>
      {posto.mani.length > 0 && (
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
      )}
      <div className="bj-altro__puntata">
        {posto.puntata > 0 && delta === null && (
          <Fiche
            key={posto.puntata}
            valore={posto.puntata}
            className="bj-altro__fiche"
            style={{ '--fiche': coloreFiche(posto.puntata) } as CSSProperties}
          />
        )}
        {posto.assicurazione > 0 && delta === null && (
          <span className="bj-altro__assicurazione u-tabnum" aria-label={`Assicurazione ${posto.assicurazione}`}>
            <SegnoAssicurazione />
            {posto.assicurazione}
          </span>
        )}
        {delta !== null && (
          <span className={`bj-altro__delta u-tabnum${delta > 0 ? ' is-piu' : delta < 0 ? ' is-meno' : ''}`}>
            {delta === 0 ? 'Pari' : conSegno(delta)}
          </span>
        )}
      </div>
    </div>
  )
}

/** Un posto libero: il cerchio sul panno, dove starebbe l'avatar, e il cerchio vuoto della puntata. */
export function PostoLibero({ lato, arco }: { lato: LatoPosto; arco: number }) {
  return (
    <div className={`bj-altro is-libero is-${lato}`} data-posto={arco}>
      <span className="bj-altro__cerchio" />
      <span className="bj-altro__avatar">
        <span className="bj-altro__vuoto" />
      </span>
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

/** La barra del tempo che resta, sotto la riga sopra i comandi: le puntate degli altri, o il turno. */
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
