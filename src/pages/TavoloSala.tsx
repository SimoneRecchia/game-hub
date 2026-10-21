import { useEffect, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Difficolta, useLivelloScelto } from '@/components/Difficolta'
import { Riga } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { giocoTavoloDi } from '@/games/catalog'
import { ComeSiGiocaTavoliere } from '@/games/tavolo/ComeSiGioca'
import { nomeVariante } from '@/games/tavolo/nomi'
import { InvitaAmico, PartitaAperta, useSalaTavolo } from '@/games/tavolo/SalaAmico'
import { SceltaTempo, useTempoMossa } from '@/games/tavolo/Tempo'
import {
  abbandona,
  cominciata,
  leggiConti,
  leggiContro,
  leggiPartita,
  leggiVariante,
  nuovaPartita,
  salvaContro,
  salvaVariante,
  type Contro,
} from '@/games/tavolo/locale'
import { LIVELLI_TAVOLIERE, type GiocoTavoliere, type LivelloTavoliere } from '@shared/tavolo'
import { regoleDi } from '@shared/tavolo-regole'
import './Battaglia.css'
import './Tavolo.css'

export const NOMI_LIVELLI: Record<LivelloTavoliere, string> = {
  facile: 'Facile',
  normale: 'Normale',
  difficile: 'Difficile',
}

/**
 * La sala di un gioco da tavoliere — scacchi, dama, Forza 4, go — con le due cose
 * che si possono fare: una partita contro il computer, che sta nel telefono, o
 * una con un amico, online o con un link. Un interruttore sceglie quale, e si
 * vede solo quel che serve a quella: la difficoltà contro il computer, gli
 * inviti con un amico. Il colore non si sceglie: contro il computer cambia a
 * ogni partita, fra amici lo pesca il server. Quando l'amico accetta, la sala
 * porta tutti e due alla partita.
 */
export default function TavoloSala({ gioco }: { gioco: GiocoTavoliere }) {
  const { vai } = useNavigazione()
  const catalogo = giocoTavoloDi(gioco)
  const [regole, setRegole] = useState(false)
  const [contro, setContro] = useState<Contro>(() => leggiContro(gioco))
  const varianti = regoleDi(gioco).varianti ?? null
  const [variante, setVariante] = useState(() => leggiVariante(gioco))
  const [locale, setLocale] = useState(() => leggiPartita(gioco))
  const [conti, setConti] = useState(() => leggiConti(gioco))
  const [conferma, setConferma] = useState<LivelloTavoliere | null>(null)
  const [livello, setLivello] = useLivelloScelto(gioco, LIVELLI_TAVOLIERE)
  const [tempo, setTempo] = useTempoMossa(gioco)
  const sala = useSalaTavolo(gioco, variante, tempo)

  // La partita contro il computer puo' essere cambiata altrove: si rilegge tornando qui.
  useEffect(() => {
    const rileggi = () => {
      if (document.visibilityState !== 'visible') return
      setLocale(leggiPartita(gioco))
      setConti(leggiConti(gioco))
    }
    document.addEventListener('visibilitychange', rileggi)
    return () => document.removeEventListener('visibilitychange', rileggi)
  }, [gioco])

  const scegliContro = (c: Contro) => {
    setContro(c)
    salvaContro(gioco, c)
  }

  const scegliVariante = (v: string) => {
    setVariante(v)
    salvaVariante(gioco, v)
  }

  const comincia = (livello: LivelloTavoliere) => {
    if (locale && cominciata(locale)) abbandona(locale)
    nuovaPartita(gioco, livello, variante, tempo)
    setConferma(null)
    vai(ROTTE.computerTavolo(gioco))
  }

  const scegliLivello = (livello: LivelloTavoliere) => {
    if (locale && cominciata(locale)) setConferma(livello)
    else comincia(livello)
  }

  const inCorsoLocale = locale && !locale.esito ? locale : null

  // Un invito che aspetta risposta si vede anche se l'ultima volta si era scelto il computer.
  const vista: Contro = sala.inAttesa ? 'amico' : contro

  return (
    <Pagina
      titolo={catalogo.nome}
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      gioco={gioco}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {sala.dati?.partite.map((p) => <PartitaAperta key={p.id} partita={p} />)}
      {sala.altrove && <PartitaAperta partita={sala.altrove} />}

      <div className="tav-sala__scelte">
        <SegmentedControl
          ariaLabel="Contro chi"
          value={vista}
          onChange={scegliContro}
          options={[
            { value: 'computer', label: 'Computer' },
            { value: 'amico', label: 'Amico' },
          ]}
        />
        {varianti && variante && (
          <SegmentedControl
            ariaLabel="Il lato del goban"
            value={variante}
            onChange={scegliVariante}
            options={varianti.map((v) => ({ value: v, label: nomeVariante(gioco, v) ?? v }))}
          />
        )}
      </div>

      <SceltaTempo gioco={gioco} valore={tempo} onChange={setTempo} />

      {vista === 'computer' ? (
        <Difficolta
          livelli={LIVELLI_TAVOLIERE.map((id) => {
            const c = conti[id]
            const giocate = c.vinte + c.perse + c.patte
            return { id, nome: NOMI_LIVELLI[id], valore: giocate > 0 ? `${c.vinte}/${giocate}` : undefined }
          })}
          scelto={livello}
          onScegli={setLivello}
          onComincia={() => scegliLivello(livello)}
          colore={`var(--${gioco}-1)`}
          sopra={
            inCorsoLocale && (
              <Riga
                icona={<span className="tavolo-riga__segno" aria-hidden="true" />}
                titolo="Riprendi la partita"
                sotto={[
                  NOMI_LIVELLI[inCorsoLocale.livello],
                  nomeVariante(gioco, regoleDi(gioco).varianteDi?.(inCorsoLocale.posizione)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                a={ROTTE.computerTavolo(gioco)}
              />
            )
          }
        />
      ) : (
        <InvitaAmico sala={sala} />
      )}

      <ComeSiGiocaTavoliere gioco={gioco} open={regole} onClose={() => setRegole(false)} />

      <Sheet open={conferma !== null} onClose={() => setConferma(null)} title="Una partita nuova?">
        <div className="tav-foglio">
          <p className="tav-foglio__testo">Se ne cominci un’altra, quella in corso conta come persa.</p>
          <Button variant="destructive" size="lg" fullWidth onClick={() => conferma && comincia(conferma)}>
            Comincia la nuova
          </Button>
          <Button
            variant="plain"
            size="lg"
            fullWidth
            onClick={() => {
              setConferma(null)
              vai(ROTTE.computerTavolo(gioco))
            }}
          >
            Riprendi quella in corso
          </Button>
        </div>
      </Sheet>
    </Pagina>
  )
}
