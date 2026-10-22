import { useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Cursore } from '@/components/Cursore'
import { Elenco, Riga, Sezione } from '@/components/Elementi'
import { IconPlay } from '@/components/Icons'
import { Opzioni, Scelte } from '@/components/Opzioni'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { SalaSfida } from '@/games/amici/SalaSfida'
import {
  SECONDI_FINALE,
  SECONDI_PAROLA,
  SECONDI_SCELTA,
  impostazioniValide,
  type GiocoSfidaLibera,
  type ImpostazioniDi,
  type ImpostazioniFinale,
} from '@shared/sfide-libere'
import { descriviOpzioni, salaDi } from './giochi'
import './Sfide.css'

export type Contro = 'solo' | 'amico'

/** Un tempo come si legge: "45 secondi", "1 minuto", "1 minuto e mezzo", "2 minuti". */
function durata(secondi: number): string {
  if (secondi === 60) return '1 minuto'
  if (secondi === 90) return '1 minuto e mezzo'
  if (secondi % 60 === 0) return `${secondi / 60} minuti`
  return `${secondi} secondi`
}

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
 * Prima della Ghigliottina e della Catena libere: da solo o con un amico, il
 * tempo di ogni passo — una coppia, una parola — e quello della parola finale.
 * Non hanno livelli, quindi Comincia sta sotto le opzioni.
 */
export function SceltaFinale({
  gioco,
  titoloPasso,
  titoloTempo,
  onComincia,
  sospesa,
  children,
}: {
  gioco: 'ghigliottina' | 'catena'
  /** "Tempo per coppia", "Tempo per parola". */
  titoloPasso: string
  /** "Tempo per la parola vincente". */
  titoloTempo: string
  onComincia: (opzioni: ImpostazioniFinale) => void
  /** La partita lasciata a meta', da riprendere: il biglietto delle Libere dice a che punto e'. */
  sospesa?: { dettaglio?: string; onRiprendi: () => void } | null
  /** Sotto il bottone: un guasto. */
  children?: ReactNode
}) {
  const [contro, setContro] = useContro(gioco)
  const [opzioni, cambia] = useOpzioniLibera(gioco)
  const [sfida, setSfida] = useFoglioSfida()
  return (
    <>
      <InterruttoreContro value={contro} onChange={setContro} />
      {sospesa && (
        <Elenco>
          <Riga
            icona={<IconPlay size={16} />}
            titolo="Riprendi la partita"
            sotto={sospesa.dettaglio}
            onClick={sospesa.onRiprendi}
          />
        </Elenco>
      )}
      <Sezione titolo="Partita">
        <Opzioni>
          <Scelte titolo={titoloPasso} valore={`${opzioni.passo} secondi`}>
            <Cursore
              ariaLabel={titoloPasso}
              valori={gioco === 'ghigliottina' ? SECONDI_SCELTA : SECONDI_PAROLA}
              valore={opzioni.passo}
              etichetta={(n) => `${n} s`}
              voce={(n) => `${n} secondi`}
              onChange={(n) => cambia({ passo: n })}
            />
          </Scelte>
          <Scelte titolo={titoloTempo} valore={durata(opzioni.secondi)}>
            <Cursore
              ariaLabel={titoloTempo}
              valori={SECONDI_FINALE}
              valore={opzioni.secondi}
              etichetta={(n) => (n % 60 === 0 ? `${n / 60} min` : `${n} s`)}
              voce={durata}
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
