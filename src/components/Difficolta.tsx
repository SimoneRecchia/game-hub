import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Elenco, Riga, Sezione, Tacche } from './Elementi'
import { IconPlay } from './Icons'

/** Un livello fra cui scegliere: l'id, il nome, e a destra quel che se ne e' fatto ("3/5", il record). */
export interface Livello<T extends string> {
  id: T
  nome: string
  valore?: ReactNode
}

/**
 * La difficoltà di una partita: le righe con le tacche si scelgono, con la
 * spunta, e la partita parte da Comincia. Toccare un livello faceva partire la
 * partita subito, e chi guardava le righe non capiva che erano bottoni.
 */
export function Difficolta<T extends string>({
  livelli,
  scelto,
  onScegli,
  onComincia,
  colore,
  di,
  etichetta = 'Comincia',
  occupato = false,
  sopra,
  children,
}: {
  livelli: ReadonlyArray<Livello<T>>
  scelto: T
  onScegli: (id: T) => void
  onComincia: () => void
  colore: string
  di?: 3 | 4
  etichetta?: string
  /** Mentre la partita si prepara: il bottone gira e non si tocca. */
  occupato?: boolean
  /** Prima della difficoltà, in una carta sua: la partita da riprendere. */
  sopra?: ReactNode
  /** Sotto il bottone: un conto, un guasto. */
  children?: ReactNode
}) {
  return (
    <>
      {sopra && <Elenco>{sopra}</Elenco>}
      <Sezione titolo="Difficoltà">
        <Elenco>
          {livelli.map((l, i) => (
            <Riga
              key={l.id}
              icona={<Tacche piene={i + 1} di={di} colore={colore} />}
              titolo={l.nome}
              valore={l.valore}
              scelta={l.id === scelto}
              onClick={() => onScegli(l.id)}
            />
          ))}
        </Elenco>
        <Button size="lg" fullWidth loading={occupato} onClick={onComincia}>
          <IconPlay size={17} /> {etichetta}
        </Button>
        {children}
      </Sezione>
    </>
  )
}

/**
 * Il livello scelto l'ultima volta in un gioco, nel `localStorage`: la partita
 * dopo comincia da li'. La prima volta e' il secondo, il "Normale".
 */
export function useLivelloScelto<T extends string>(gioco: string, livelli: readonly T[]): [T, (l: T) => void] {
  const chiave = `difficolta:${gioco}`
  const [livello, setLivello] = useState<T>(() => {
    try {
      const salvato = localStorage.getItem(chiave)
      if (livelli.includes(salvato as T)) return salvato as T
    } catch {
      // Senza il localStorage si parte dal Normale.
    }
    return livelli[Math.min(1, livelli.length - 1)]
  })
  const scegli = (l: T) => {
    setLivello(l)
    try {
      localStorage.setItem(chiave, l)
    } catch {
      // E' una comodita'.
    }
  }
  return [livello, scegli]
}
