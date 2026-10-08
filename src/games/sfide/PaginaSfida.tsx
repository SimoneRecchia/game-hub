import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Coriandoli, Vuoto, useFesta } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import type { AvanzamentoSfida, GiocoSfidaLibera, ImpostazioniDi } from '@shared/sfide-libere'
import type { LatoSfidaLibera } from '@shared/types'
import { SFIDE_LIBERE, descriviLato, unitaLato } from './giochi'
import { BarraSfida, FineSfida, ViaSfida } from './Sfida'
import { useSfidaLibera } from './useSfidaLibera'

/** Quel che la pagina della sfida passa alla partita del gioco. */
export interface PropsPartitaSfida<G extends GiocoSfidaLibera> {
  seme: number
  impostazioni: ImpostazioniDi[G]
  /** Il blocco della fine, al posto del totale della libera. */
  fine: ReactNode
  onAvanza: (a: AvanzamentoSfida) => void
  onFine: (a: AvanzamentoSfida) => void
  /** Fin dove e' arrivato l'altro: il sudoku si chiude quando l'altro l'ha gia' risolto prima. */
  sue: LatoSfidaLibera
}

/**
 * La pagina di una sfida con un amico a una delle libere da soli: la striscia
 * con io e l'altro, il tre-due-uno, poi la partita del gioco, con il motore
 * della sua libera e il seme della sfida, e com'e' andata al posto del suo
 * totale. Chi riapre la pagina dopo essere partito trova solo com'e' andata:
 * la sua partita si e' chiusa li'.
 */
export function PaginaSfida<G extends GiocoSfidaLibera>({
  gioco,
  Partita,
  Regole,
}: {
  gioco: G
  Partita: ComponentType<PropsPartitaSfida<G>>
  Regole: ComponentType<{ open: boolean; onClose: () => void }>
}) {
  const { id = '' } = useParams()
  // La rivincita e' un'altra sfida: si riparte da capo, con lo stato nuovo.
  return <Sfida key={id} id={id} gioco={gioco} Partita={Partita} Regole={Regole} />
}

function Sfida<G extends GiocoSfidaLibera>({
  id,
  gioco,
  Partita,
  Regole,
}: {
  id: string
  gioco: G
  Partita: ComponentType<PropsPartitaSfida<G>>
  Regole: ComponentType<{ open: boolean; onClose: () => void }>
}) {
  const s = useSfidaLibera(id)
  const v = s.vista
  const { vai } = useNavigazione()
  // Una sfida di un altro gioco, arrivata dalla sala di questo (le sfide sono una alla volta, a tutti e cinque):
  // si va alla pagina del suo.
  const suo = v?.gioco
  useEffect(() => {
    if (suo && suo !== gioco) vai(ROTTE.sfidaLibera(suo, id), { replace: true, direzione: 'nessuna' })
  }, [gioco, id, suo, vai])
  const [regole, setRegole] = useState(false)
  const { adesivo, accoda } = useCodaAdesivi()
  /** La partita si e' giocata su questo telefono: resta in vista anche finita, con com'e' andata sotto. */
  const [montata, setMontata] = useState(false)
  const [finitaQui, setFinitaQui] = useState(false)
  useEffect(() => {
    if (s.inGioco) setMontata(true)
  }, [s.inGioco])
  const { finisci } = s
  const onFine = useCallback(
    (a: AvanzamentoSfida) => {
      setFinitaQui(true)
      finisci(a)
    },
    [finisci],
  )

  // La fine, una volta e solo se vista arrivare: l'adesivo, e la festa per chi vince.
  const nome = v?.avversario?.displayName ?? 'L’altro'
  const vistaInCorso = useRef(false)
  useEffect(() => {
    if (!v) return
    if (v.stato === 'in_corso') vistaInCorso.current = true
    if (v.stato !== 'finita' || !vistaInCorso.current) return
    vistaInCorso.current = false
    const sotto = `${descriviLato(gioco, v.mie)} ${unitaLato(gioco, v.mie)} contro ${descriviLato(gioco, v.sue)}`
    accoda(
      v.vincitore === 'io'
        ? {
            tono: 'vivace',
            titolo: 'Hai vinto!',
            sotto,
            colore: `linear-gradient(160deg, ${SFIDE_LIBERE[gioco].colore}, ${SFIDE_LIBERE[gioco].colore2})`,
            durata: 1_900,
            suono: 'vittoria',
          }
        : {
            tono: 'bordato',
            titolo: v.vincitore === 'pari' ? 'Pari' : `Vince ${nome}`,
            sotto,
            colore: SFIDE_LIBERE[gioco].colore2,
            durata: 1_900,
            suono: v.vincitore === 'pari' ? 'pareggio' : 'sconfitta',
          },
    )
  }, [accoda, gioco, nome, v])
  const festa = useFesta(v ? v.stato === 'in_corso' : null, v?.vincitore === 'io', 400)

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )
  const titolo = SFIDE_LIBERE[gioco].nome

  let corpo: ReactNode
  if (!v || v.gioco !== gioco) {
    corpo = s.errore ? <Vuoto titolo="La sfida non si apre" testo={s.errore} /> : <div className="sfl-risultato" />
  } else if (v.stato === 'invito' || v.stato === 'rifiutata' || v.stato === 'annullata') {
    corpo = (
      <Vuoto
        titolo={v.stato === 'invito' ? 'La sfida non è ancora cominciata' : 'La sfida non c’è più'}
        testo={v.stato === 'invito' ? 'Aspetto che l’altro accetti.' : 'L’invito è stato ritirato o rifiutato.'}
      />
    )
  } else if (v.stato === 'in_corso' && s.via !== null) {
    corpo = <ViaSfida v={v} via={s.via} />
  } else if (montata && v.seme !== null && (finitaQui || v.stato === 'in_corso')) {
    corpo = (
      <>
        <BarraSfida v={v} />
        <Partita
          seme={v.seme}
          impostazioni={v.impostazioni as ImpostazioniDi[G]}
          fine={<FineSfida s={s} v={v} />}
          onAvanza={s.avanza}
          onFine={onFine}
          sue={v.sue}
        />
      </>
    )
  } else if (v.stato === 'in_corso' && !v.mie.finito) {
    // Il via e' passato: il telefono sta dicendo al server che parte.
    corpo = <BarraSfida v={v} />
  } else {
    corpo = (
      <div className="sfl-risultato">
        <BarraSfida v={v} />
        {v.riaperta && <p className="sfl-risultato__titolo">La pagina si è riaperta: la tua partita è chiusa.</p>}
        <FineSfida s={s} v={v} />
      </div>
    )
  }

  return (
    <Pagina titolo={titolo} intera indietro={{ a: ROTTE.libera(gioco), etichetta: titolo }} azioni={info}>
      {corpo}
      <Regole open={regole} onClose={() => setRegole(false)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}
