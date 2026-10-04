import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DatiAdesivo } from '@/components/Adesivo'
import type { Tondo, Volo } from './Rullo'
import { TIMBRO_MS, movimentoRidotto } from './scena'

/**
 * Le scene di Nomi, cose e città come le usano le tre pagine — la
 * classificata, la libera e la sfida — perché siano le stesse: la lettera che
 * vola dal rullo al foglio, il timbro dello stop, la correzione che lo aspetta
 * e quel che viene dopo.
 */

/**
 * La lettera che esce dal rullo e vola sul foglio: `atterra` quando il rullo
 * si e' fermato (da li' il foglio c'e', e la lettera vola), `finito` quando e'
 * arrivata, `ricomincia` per una partita nuova.
 */
export function useLetteraInVolo(lettera: string | null) {
  const [volo, setVolo] = useState<Volo | null>(null)
  const [arrivata, setArrivata] = useState(false)
  const atterra = useCallback(
    (da: Tondo) => {
      if (lettera) setVolo({ lettera, da })
      setArrivata(true)
    },
    [lettera],
  )
  const finito = useCallback(() => setVolo(null), [])
  const ricomincia = useCallback(() => {
    setVolo(null)
    setArrivata(false)
  }, [])
  return useMemo(
    () => ({ volo, arrivata, atterra, finito, ricomincia }),
    [volo, arrivata, atterra, finito, ricomincia],
  )
}

/**
 * Il timbro dello stop, o del tempo finito: l'adesivo, e la pagina che
 * sobbalza quando si abbatte. `resto` dice quanto resta del timbro: la
 * correzione del foglio aspetta che se ne vada.
 */
export function useTimbro(accoda: (dati: Omit<DatiAdesivo, 'id'>) => void) {
  const quando = useRef<number | null>(null)
  const timbra = useCallback(
    (dati: Omit<DatiAdesivo, 'id'>) => {
      quando.current = Date.now()
      accoda(dati)
      scuoti(document.querySelector('.pagina__corpo'))
    },
    [accoda],
  )
  const resto = useCallback(
    () => (quando.current === null ? 0 : Math.max(0, TIMBRO_MS - (Date.now() - quando.current))),
    [],
  )
  return useMemo(() => ({ timbra, resto }), [timbra, resto])
}

/**
 * La correzione del foglio, se la fine si e' vista arrivare (`vista`): quanto
 * aspetta — il timbro che resta — si decide al primo disegno del foglio
 * corretto, e non cambia piu'. Il foglio la legge una volta sola, e l'adesivo
 * della fine si conta da li': i due restano d'accordo.
 */
export function useCorrezione(vista: boolean, attesa: () => number): { attesa: number } | null {
  const fissata = useRef<{ attesa: number } | null>(null)
  if (vista && fissata.current === null) fissata.current = { attesa: attesa() }
  return fissata.current
}

/**
 * Quel che viene dopo la correzione — l'adesivo della fine, i coriandoli — una
 * cosa alla volta: una nuova prende il posto di quella in attesa, e lasciando
 * la pagina, o cominciando un'altra partita, non arriva piu'.
 */
export function useDopo() {
  const attesa = useRef<number | null>(null)
  const annulla = useCallback(() => {
    if (attesa.current !== null) window.clearTimeout(attesa.current)
    attesa.current = null
  }, [])
  const programma = useCallback(
    (ms: number, fa: () => void) => {
      annulla()
      attesa.current = window.setTimeout(() => {
        attesa.current = null
        fa()
      }, ms)
    },
    [annulla],
  )
  useEffect(() => annulla, [annulla])
  return useMemo(() => ({ programma, annulla }), [programma, annulla])
}

/**
 * La pagina che sobbalza sotto il timbro: quando l'adesivo si abbatte, a meta'
 * della sua entrata. Con il movimento ridotto non si muove.
 */
export function scuoti(el: Element | null) {
  if (!el || movimentoRidotto()) return
  el.animate(
    [
      { transform: 'none' },
      { transform: 'translateY(3px) rotate(-0.4deg)', offset: 0.25 },
      { transform: 'translateY(-1.5px) rotate(0.25deg)', offset: 0.55 },
      { transform: 'none' },
    ],
    { duration: 360, delay: TIMBRO_MS * 0.16, easing: 'ease-out' },
  )
}
