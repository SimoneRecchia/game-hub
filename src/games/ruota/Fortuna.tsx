import type { CSSProperties } from 'react'
import { scriviMoltiplicatore } from '@shared/ruota'
import { Quadrifoglio } from './disegni'
import type { PassoDelConto } from './magia'
import './Fortuna.css'

/** Quanto dura il colpo di fortuna, prima che arrivi l'insegna della ruota fortunata. */
export const COLPO_MS = 1_350

/** Le scintille del colpo: dodici, a raggiera, ognuna con la sua distanza. */
const SCINTILLE = Array.from({ length: 12 }, (_, k) => {
  const a = (k * 30 + 8) * (Math.PI / 180)
  const d = 42 + (k % 3) * 14
  return { x: Math.cos(a) * d, y: Math.sin(a) * d, k }
})

/**
 * Il colpo di fortuna: la ruota si e' fermata sul quadrifoglio, e il
 * quadrifoglio salta fuori dal mozzo, grande, girando su se' stesso, con il
 * suo alone, i raggi d'oro e le scintille; poi sale e sfuma, e arriva
 * l'insegna della ruota fortunata. Sta sopra la scena, e non si tocca. Con il
 * movimento ridotto c'e' solo il quadrifoglio, fermo.
 */
export function ColpoDiFortuna({ chiave }: { chiave: number }) {
  return (
    <div key={chiave} className="ct-colpo" style={{ '--durata': `${COLPO_MS}ms` } as CSSProperties} aria-hidden="true">
      <span className="ct-colpo__velo" />
      <span className="ct-colpo__raggi" />
      <span className="ct-colpo__alone" />
      <span className="ct-colpo__onda" />
      {SCINTILLE.map((s) => (
        <span
          key={s.k}
          className="ct-colpo__scintilla"
          style={{ '--x': `${s.x.toFixed(0)}cqmin`, '--y': `${s.y.toFixed(0)}cqmin`, '--k': s.k } as CSSProperties}
        />
      ))}
      <svg className="ct-colpo__quadrifoglio" viewBox="-12 -12 24 24">
        <Quadrifoglio lato={20} classe="is-verde is-grande" />
      </svg>
    </div>
  )
}

/**
 * Il premio piu' grande che sale, grande e dritto sopra il mozzo: lo stesso
 * conto che fa lo spicchio, che sulla ruota e' piccolo e magari a testa in
 * giu'. Una medaglia cremisi con l'orlo d'oro arriva, il numero sale un passo
 * alla volta, e all'ultimo scoppiano i raggi; poi la medaglia torna nella
 * ruota. I tempi sono quelli della magia (magia.ts), dal momento in cui la
 * medaglia compare insieme alla magia.
 */
export function PremioCheSale({ passi }: { passi: readonly PassoDelConto[] }) {
  const primo = passi[0].ms
  const ultimo = passi[passi.length - 1].ms
  const stile = { '--entra': `${primo - 300}ms`, '--fine': `${ultimo}ms` } as CSSProperties
  return (
    <div className="ct-premio" style={stile} aria-hidden="true">
      <span className="ct-premio__lampo" />
      <span className="ct-premio__raggi" />
      <span className="ct-premio__medaglia">
        {passi.map((p, k) => {
          const da = k === 0 ? primo - 300 : p.ms
          const dura = k === passi.length - 1 ? 0 : passi[k + 1].ms - da
          return (
            <span
              key={p.valore}
              className={`ct-premio__numero${k === passi.length - 1 ? ' is-ultimo' : ''}`}
              style={{ '--da': `${da}ms`, '--dura': `${dura}ms` } as CSSProperties}
            >
              {scriviMoltiplicatore(p.valore)}
            </span>
          )
        })}
      </span>
    </div>
  )
}

/**
 * Il nastro della ruota fortunata, finché la fortuna dura: sui palchi alti
 * prende il posto dell'insegna di Crazy Time, sugli altri sta in un angolo.
 */
export function NastroFortuna({ testo }: { testo: string }) {
  return (
    <p className="ct-nastro" aria-live="polite">
      <svg className="ct-nastro__icona" viewBox="-9 -9 18 18" aria-hidden="true">
        <Quadrifoglio lato={15} classe="is-verde" />
      </svg>
      <span>{testo}</span>
    </p>
  )
}
