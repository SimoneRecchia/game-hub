import { useEffect, useRef, type ReactNode } from 'react'
import { IconCheck, IconClose } from '@/components/Icons'
import { CATEGORIE_NOMI, LUNGHEZZA_MASSIMA_RISPOSTA, candidati, type CategoriaNomi } from '@shared/nomi-cose'
import type { RisposteNomi } from './useNomiDelGiorno'

/** Le categorie che sono nomi propri: la tastiera comincia con la maiuscola. */
const PROPRI: readonly CategoriaNomi[] = ['nomi', 'citta', 'paesi', 'acque']

/** La risposta comincia con la lettera, anche con l'articolo davanti o con "lago di". */
export function cominciaCon(testo: string, categoria: CategoriaNomi, lettera: string): boolean {
  return candidati(testo, categoria).some((f) => f.startsWith(lettera))
}

/** La lettera del giorno, grande, in un tondo: il timbro sul foglio. */
export function Lettera({ lettera, piccola = false }: { lettera: string | null; piccola?: boolean }) {
  return (
    <span className={`nomi-lettera${piccola ? ' is-piccola' : ''}${lettera ? '' : ' is-nascosta'}`} aria-hidden="true">
      {lettera ? lettera.toUpperCase() : '?'}
    </span>
  )
}

/**
 * Il foglio da scrivere: una riga per categoria, il nome a sinistra del
 * margine e la risposta sulla riga. Invio passa alla riga dopo; sull'ultima
 * chiude la tastiera, e la consegna resta un gesto a parte.
 */
export function FoglioDaScrivere({
  lettera,
  categorie,
  risposte,
  onScrivi,
  disabilitato = false,
}: {
  lettera: string
  categorie: readonly CategoriaNomi[]
  risposte: RisposteNomi
  onScrivi: (categoria: CategoriaNomi, testo: string) => void
  disabilitato?: boolean
}) {
  const campi = useRef<(HTMLInputElement | null)[]>([])

  // Si comincia a scrivere subito: il tempo corre.
  useEffect(() => {
    campi.current.find((c, i) => c && !risposte[categorie[i]])?.focus({ preventScroll: true })
    // Solo all'apertura del foglio: dopo, il fuoco lo decide chi scrive.
  }, [])

  return (
    <div className="nomi-foglio">
      {categorie.map((c, i) => {
        const testo = risposte[c] ?? ''
        const fuori = testo.trim() !== '' && !cominciaCon(testo, c, lettera)
        const ultima = i === categorie.length - 1
        return (
          <label key={c} className={`nomi-riga${fuori ? ' is-fuori' : ''}`}>
            <span className="nomi-riga__categoria">{CATEGORIE_NOMI[c].nome}</span>
            <input
              ref={(el) => {
                campi.current[i] = el
              }}
              className="nomi-riga__campo"
              type="text"
              value={testo}
              maxLength={LUNGHEZZA_MASSIMA_RISPOSTA}
              placeholder={`${lettera.toUpperCase()}…`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoCapitalize={PROPRI.includes(c) ? 'words' : 'none'}
              enterKeyHint={ultima ? 'done' : 'next'}
              disabled={disabilitato}
              aria-invalid={fuori || undefined}
              onChange={(e) => onScrivi(c, e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (ultima) e.currentTarget.blur()
                else campi.current[i + 1]?.focus()
              }}
            />
            {fuori && <span className="nomi-riga__avviso">Non comincia con la {lettera.toUpperCase()}</span>}
          </label>
        )
      })}
    </div>
  )
}

export type SegnoRiga = 'giusta' | 'sbagliata' | 'vuota'

export interface RigaScritta {
  categoria: CategoriaNomi
  testo: string
  /** Vale, non vale, o non c'era; null se ancora non si sa. */
  segno: SegnoRiga | null
  /** Sotto la risposta: quanti l'hanno data, la risposta del computer. */
  nota?: ReactNode
  /** A destra: i punti. */
  punti?: ReactNode
}

/** Il foglio consegnato: le risposte, ognuna con il suo segno e, se ci sono, i suoi punti. */
export function FoglioScritto({ righe }: { righe: readonly RigaScritta[] }) {
  return (
    <ul className="nomi-foglio is-scritto">
      {righe.map((r) => (
        <li key={r.categoria} className={`nomi-riga${r.segno ? ` is-${r.segno}` : ''}`}>
          <span className="nomi-riga__categoria">{CATEGORIE_NOMI[r.categoria].nome}</span>
          <span className="nomi-riga__risposta">
            <span className="nomi-riga__testo">{r.testo || '—'}</span>
            {r.nota && <span className="nomi-riga__nota">{r.nota}</span>}
          </span>
          {r.punti !== undefined && <span className="nomi-riga__punti u-tabnum">{r.punti}</span>}
          {r.segno === 'giusta' && (
            <span className="nomi-riga__segno" role="img" aria-label="Valida">
              <IconCheck size={16} />
            </span>
          )}
          {r.segno === 'sbagliata' && (
            <span className="nomi-riga__segno" role="img" aria-label="Non valida">
              <IconClose size={14} />
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
