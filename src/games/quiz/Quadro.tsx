import { useState, type CSSProperties } from 'react'
import { LARGHEZZE_IMMAGINI, urlImmagine, type ImmagineQuiz } from '@shared/quiz-cultura'

/** Le tre misure di Commons, per `srcset`: il browser prende quella che basta allo schermo. */
export function misureQuadro(img: ImmagineQuiz): string {
  return LARGHEZZE_IMMAGINI.map((w) => `${urlImmagine(img, w)} ${w}w`).join(', ')
}

/** Scarica prima un quadro che servira' fra poco, cosi' la domanda non lo aspetta. */
export function precaricaQuadro(img: ImmagineQuiz, sizes: string): void {
  const i = new Image()
  i.sizes = sizes
  i.srcset = misureQuadro(img)
}

/**
 * Un quadro di Wikimedia Commons, appeso nella cornice.
 *
 * Il posto lo tengono le sue proporzioni (`--r`), prima ancora che arrivi:
 * dentro un contenitore di misura, il quadro e' largo quanto ci sta senza
 * uscire in altezza, e viceversa. Cosi' la carta non salta quando l'immagine
 * arriva, e intanto c'e' la tela vuota. Se non arriva lo dice, e la domanda
 * resta: si puo' sempre rispondere, o lasciar finire il tempo.
 */
export function Quadro({
  img,
  alt,
  sizes,
  className = '',
}: {
  img: ImmagineQuiz
  alt: string
  sizes: string
  className?: string
}) {
  const [stato, setStato] = useState<'carica' | 'pronto' | 'errore'>('carica')
  return (
    <span className={`quadro is-${stato} ${className}`} style={{ '--r': img.r } as CSSProperties}>
      {stato === 'errore' ? (
        <span className="quadro__errore">Il quadro non si è caricato</span>
      ) : (
        <img
          // Una cache piena lo da' prima che React ascolti il load: lo si guarda appena c'e'.
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0 && stato === 'carica') setStato('pronto')
          }}
          src={urlImmagine(img, 500)}
          srcSet={misureQuadro(img)}
          sizes={sizes}
          alt={alt}
          draggable={false}
          decoding="async"
          onLoad={() => setStato('pronto')}
          onError={() => setStato('errore')}
        />
      )}
    </span>
  )
}
