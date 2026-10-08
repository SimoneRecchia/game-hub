import { useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Cursore } from '@/components/Cursore'
import { Sezione } from '@/components/Elementi'
import { IconPlay } from '@/components/Icons'
import { Opzioni, Scelte } from '@/components/Opzioni'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { SalaSfida } from '@/games/amici/SalaSfida'
import {
  SECONDI_FINALE,
  impostazioniValide,
  type GiocoSfidaLibera,
  type ImpostazioniDi,
  type ImpostazioniFinale,
} from '@shared/sfide-libere'
import { descriviOpzioni, salaDi } from './giochi'
import './Sfide.css'

export type Contro = 'solo' | 'amico'

function leggi<T>(chiave: string, ripiego: T): T {
  try {
    const testo = localStorage.getItem(chiave)
    return testo === null ? ripiego : (JSON.parse(testo) as T)
  } catch {
    return ripiego
  }
}

function scrivi(chiave: string, valore: unknown): void {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore))
  } catch {
    /* e' una comodita': senza localStorage la scelta non si ricorda */
  }
}

/**
 * Da solo o con un amico, ricordato per gioco: come Computer | Amico nelle sale
 * dei tavolieri. La chiave e' quella delle altre libere (`giochi.<gioco>.contro`,
 * testo semplice), che il profilo di un amico scrive per aprire la pagina dalla
 * sua parte.
 */
export function useContro(gioco: GiocoSfidaLibera): [Contro, (c: Contro) => void] {
  const chiave = `giochi.${gioco}.contro`
  const [contro, setContro] = useState<Contro>(() => {
    try {
      return localStorage.getItem(chiave) === 'amico' ? 'amico' : 'solo'
    } catch {
      return 'solo'
    }
  })
  return [
    contro,
    (c) => {
      setContro(c)
      try {
        localStorage.setItem(chiave, c)
      } catch {
        /* e' una comodita' */
      }
    },
  ]
}

/** Il foglio della sfida, aperto da subito se si arriva dal profilo di un amico (`?sfida=1`). */
export function useFoglioSfida(): [boolean, (aperto: boolean) => void] {
  return useState(() => new URLSearchParams(window.location.search).get('sfida') === '1')
}

/**
 * Le opzioni della libera di un gioco, ricordate per gioco: le stesse da soli
 * e con un amico, perché una sfida si gioca come la libera. Una scelta salvata
 * che non e' piu' fra quelle possibili torna a quella di sempre.
 */
export function useOpzioniLibera<G extends GiocoSfidaLibera>(
  gioco: G,
): [ImpostazioniDi[G], (cambio: Partial<ImpostazioniDi[G]>) => void] {
  const chiave = `giochi.${gioco}.opzioni`
  const [opzioni, setOpzioni] = useState<ImpostazioniDi[G]>(() => impostazioniValide(gioco, leggi(chiave, null)))
  return [
    opzioni,
    (cambio) =>
      setOpzioni((prima) => {
        const dopo = impostazioniValide(gioco, { ...prima, ...cambio })
        scrivi(chiave, dopo)
        return dopo
      }),
  ]
}

/** In cima alla libera: da solo o con un amico. */
export function InterruttoreContro({ value, onChange }: { value: Contro; onChange: (c: Contro) => void }) {
  return (
    <SegmentedControl
      ariaLabel="Con chi"
      value={value}
      onChange={onChange}
      options={[
        { value: 'solo', label: 'Da solo' },
        { value: 'amico', label: 'Con un amico' },
      ]}
    />
  )
}

/**
 * Il foglio della sfida: le opzioni scelte, chi e' online e il link. Le opzioni
 * viaggiano con l'invito, e l'altro gioca la stessa partita.
 */
export function FoglioSfida<G extends GiocoSfidaLibera>({
  open,
  onClose,
  gioco,
  impostazioni,
}: {
  open: boolean
  onClose: () => void
  gioco: G
  impostazioni: ImpostazioniDi[G]
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Sfida un amico">
      <p className="sfl-foglio__opzioni">{descriviOpzioni(gioco, impostazioni)}</p>
      {open && <SalaSfida gioco={salaDi(gioco)} impostazioni={impostazioni} />}
    </Sheet>
  )
}

/**
 * Prima della Ghigliottina e della Catena libere: da solo o con un amico, e il
 * tempo della parola finale. Non hanno livelli, quindi Comincia sta sotto le
 * opzioni.
 */
export function SceltaFinale({
  gioco,
  titoloTempo,
  onComincia,
  children,
}: {
  gioco: 'ghigliottina' | 'catena'
  /** "Tempo per la parola vincente". */
  titoloTempo: string
  onComincia: (opzioni: ImpostazioniFinale) => void
  /** Sotto il bottone: un guasto. */
  children?: ReactNode
}) {
  const [contro, setContro] = useContro(gioco)
  const [opzioni, cambia] = useOpzioniLibera(gioco)
  const [sfida, setSfida] = useFoglioSfida()
  return (
    <>
      <InterruttoreContro value={contro} onChange={setContro} />
      <Sezione titolo="Partita">
        <Opzioni>
          <Scelte titolo={titoloTempo} valore={`${opzioni.secondi} secondi`}>
            <Cursore
              ariaLabel={titoloTempo}
              valori={SECONDI_FINALE}
              valore={opzioni.secondi}
              etichetta={(n) => `${n} s`}
              voce={(n) => `${n} secondi`}
              onChange={(n) => cambia({ secondi: n })}
            />
          </Scelte>
        </Opzioni>
        <Button size="lg" fullWidth onClick={() => (contro === 'amico' ? setSfida(true) : onComincia(opzioni))}>
          <IconPlay size={17} /> {contro === 'amico' ? 'Sfida un amico' : 'Comincia'}
        </Button>
        {children}
      </Sezione>
      <FoglioSfida open={sfida} onClose={() => setSfida(false)} gioco={gioco} impostazioni={opzioni} />
    </>
  )
}
