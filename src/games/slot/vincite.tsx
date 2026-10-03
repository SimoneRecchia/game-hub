import { memo, useMemo, type CSSProperties } from 'react'
import type { NomeSuono } from '@/lib/suoni'
import type { CategoriaQuiz } from '@shared/quiz'
import type { CombinazioneSlot } from '@shared/slot'
import { Simbolo, TesseraCategoria } from './simboli'

/**
 * Ogni vincita della slot ha il suo momento, come nelle slot vere, dove una
 * ciliegia che ridà la puntata suona e si muove quanto un premio: e' quel che
 * fa sentire vincitori anche quando non si e' vinto niente. Qui ogni
 * combinazione ha il suo nome sul display, il suo suono, la sua animazione del
 * simbolo (in `Slot.css`, sotto `data-vince`) e i suoi pezzi che saltano fuori:
 * le scintille della ciliegia, le ciliegie lanciate, le gocce dei limoni, le
 * fette d'arancia, le bolle delle prugne, gli acini, le onde delle campane, le
 * scariche del BAR, le stelle dei sette, i punti di domanda.
 */

/** Una combinazione della linea, o i tre punti di domanda. */
export type TipoVincita = CombinazioneSlot | 'Q'

/** Come si muovono i pezzi: a raggiera, lanciati in alto e giu', rimbalzando, verso l'alto, o in onde. */
type Moto = 'scoppio' | 'arco' | 'rimbalzo' | 'sale' | 'onde'

interface Vincita {
  /** Sul display, al posto di "Vincita". */
  nome: string
  suono: NomeSuono
  moto: Moto
  /** Quanti pezzi per simbolo. */
  pezzi: number
  /** Fin dove arrivano, in centesimi del mobile: di lato, in alto, e quanto ricadono. */
  fino: readonly [number, number, number]
  /** I gradi di cui girano, al massimo. */
  giro: number
  /** Il ritardo massimo fra un pezzo e l'altro, in secondi. */
  sparsi: number
}

export const VINCITE: Record<TipoVincita, Vincita> = {
  C1: { nome: 'Ciliegia', suono: 'ciliegia', moto: 'scoppio', pezzi: 8, fino: [14, 12, 0], giro: 0, sparsi: 0.08 },
  C2: { nome: 'Due ciliegie', suono: 'ciliegie', moto: 'arco', pezzi: 5, fino: [13, 11, 15], giro: 90, sparsi: 0.15 },
  C3: { nome: 'Tre ciliegie', suono: 'ciliegie', moto: 'arco', pezzi: 7, fino: [16, 15, 16], giro: 120, sparsi: 0.2 },
  L: { nome: 'Limoni', suono: 'limoni', moto: 'arco', pezzi: 7, fino: [16, 7, 12], giro: 60, sparsi: 0.12 },
  O: { nome: 'Arance', suono: 'arance', moto: 'arco', pezzi: 5, fino: [14, 11, 14], giro: 540, sparsi: 0.15 },
  P: { nome: 'Prugne', suono: 'prugne', moto: 'sale', pezzi: 6, fino: [6, 22, 0], giro: 0, sparsi: 0.6 },
  U: { nome: 'Uva', suono: 'uva', moto: 'rimbalzo', pezzi: 8, fino: [14, 8, 12], giro: 0, sparsi: 0.25 },
  B: { nome: 'Campane', suono: 'campane', moto: 'onde', pezzi: 3, fino: [0, 0, 0], giro: 0, sparsi: 0 },
  R: { nome: 'BAR', suono: 'bar', moto: 'scoppio', pezzi: 10, fino: [16, 16, 0], giro: 0, sparsi: 0.7 },
  '7': { nome: 'Sette', suono: 'sette', moto: 'sale', pezzi: 9, fino: [9, 24, 0], giro: 180, sparsi: 1.2 },
  Q: { nome: 'Domanda', suono: 'tripla', moto: 'sale', pezzi: 5, fino: [8, 20, 0], giro: 30, sparsi: 0.4 },
}

/** Una vincita da mostrare sui rulli: quale, e le caselle che la fanno. */
export interface VincitaRulli {
  tipo: TipoVincita
  /** Le caselle da accendere: [rullo, riga]. */
  caselle: ReadonlyArray<readonly [number, number]>
  /** La categoria della domanda, che i punti di domanda mostrano girandosi. */
  categoria?: CategoriaQuiz
}

/** Un numero fra 0 e 1, sempre lo stesso per lo stesso seme: i pezzi sparsi, ma sempre allo stesso modo. */
function caso(seme: number): number {
  const x = Math.sin(seme * 12.9898 + 78.233) * 43_758.5453
  return x - Math.floor(x)
}

interface Pezzo {
  x: number
  y: number
  h: number
  g: number
  t: number
  s: number
}

/** I pezzi di un simbolo: dove vanno, quanto salgono, quanto girano, quando partono. */
function pezziDi(tipo: TipoVincita, k: number): Pezzo[] {
  const v = VINCITE[tipo]
  const [largo, alto, giu] = v.fino
  const seme = tipo.charCodeAt(0) * 31 + (tipo.charCodeAt(1) || 0) * 7 + k * 101
  return Array.from({ length: v.pezzi }, (_, i) => {
    const r = (j: number) => caso(seme + i * 13 + j)
    const fra = (j: number) => r(j) * 2 - 1
    const pezzo: Pezzo = { x: 0, y: 0, h: 0, g: fra(3) * v.giro, t: r(4) * v.sparsi, s: 0.7 + r(5) * 0.6 }
    if (v.moto === 'scoppio') {
      // A raggiera, con le direzioni distribuite e un poco storte; la scarica punta dove va.
      const angolo = ((i + r(1) * 0.6) / v.pezzi) * Math.PI * 2
      const quanto = 0.65 + r(2) * 0.35
      pezzo.x = Math.cos(angolo) * largo * quanto
      pezzo.y = Math.sin(angolo) * alto * quanto
      pezzo.g = (angolo * 180) / Math.PI
    } else if (v.moto === 'arco' || v.moto === 'rimbalzo') {
      // Di lato, un po' a destra e un po' a sinistra, alternati: in alto e poi giu'.
      const verso = i % 2 === 0 ? 1 : -1
      pezzo.x = verso * largo * (0.35 + r(1) * 0.65)
      pezzo.h = alto * (0.6 + r(2) * 0.4)
      pezzo.y = giu * (0.7 + r(6) * 0.3)
    } else if (v.moto === 'sale') {
      pezzo.x = fra(1) * largo
      pezzo.y = -alto * (0.6 + r(2) * 0.4)
    } else {
      // Le onde partono una dopo l'altra, a passo fisso.
      pezzo.t = (i * 1.1) / v.pezzi
    }
    return pezzo
  })
}

/** Quel che salta fuori da un simbolo che paga: ogni combinazione il suo. */
export const Pezzi = memo(function Pezzi({ tipo, k }: { tipo: TipoVincita; k: number }) {
  const pezzi = useMemo(() => pezziDi(tipo, k), [tipo, k])
  return (
    <span className="slot-pezzi" data-tipo={tipo} data-moto={VINCITE[tipo].moto}>
      {pezzi.map((p, i) => (
        <i
          key={i}
          style={
            {
              '--x': p.x.toFixed(2),
              '--y': p.y.toFixed(2),
              '--h': p.h.toFixed(2),
              '--g': `${p.g.toFixed(0)}deg`,
              '--t': p.t.toFixed(3),
              '--s': p.s.toFixed(2),
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
})

/**
 * Un punto di domanda che si gira e mostra la categoria: uno dopo l'altro,
 * come le carte di un mazziere. Sta sopra la casella del rullo, che intanto
 * nasconde il suo.
 */
export function Rivela({
  categoria,
  categorie,
  k,
}: {
  categoria: CategoriaQuiz
  categorie: readonly CategoriaQuiz[]
  k: number
}) {
  return (
    <span className="slot-rivela" style={{ '--k': k } as CSSProperties}>
      <span className="slot-rivela__faccia">
        <Simbolo codice="Q" categorie={categorie} />
      </span>
      <span className="slot-rivela__faccia is-retro">
        <TesseraCategoria categoria={categoria} />
      </span>
    </span>
  )
}
