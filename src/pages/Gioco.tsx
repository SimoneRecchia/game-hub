import { useEffect, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { Collegamento } from '@/app/navigazione'
import { ROTTE, giocoDaSlug } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Copertina } from '@/components/Copertina'
import { Etichetta, Sezione, Elenco, Riga } from '@/components/Elementi'
import { IconBook, IconCalendar, IconClock, IconPlay, IconShuffle, IconTrophy } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { giocoDi } from '@/games/catalog'
import { percorsoClassifica, righeComuni, type RigaComune } from '@/games/classifiche'
import { REGOLE } from '@/games/regole'
import { statiDiOggi } from '@/games/stato'
import { useCountdown } from '@/games/wordle/useCountdown'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatCountdown } from '@/lib/format'
import { leggiPartitaLibera } from '@/games/scarabeo/libera'
import { leggiStatistiche, type StatisticheLibere } from '@/games/quiz/usePartita'
import type {
  CruciverbaLiberaRisposta,
  GiocoClassificato,
  LobbyBattaglia,
  OggiRisposta,
  StatisticheScarabeoLibero,
  WordleLiberaRisposta,
} from '@shared/types'
import NotFound from './NotFound'
import './Gioco.css'

/**
 * La pagina di un gioco: le sue due modalità, le regole, la classifica.
 *
 * La copertina e' la stessa della carta da cui si arriva, e con la View
 * Transition si allarga da lì fino alla testata: si capisce di essere entrati
 * in quel gioco, non in una pagina qualunque.
 */
export default function Gioco() {
  const { gioco: slug } = useParams()
  const id = giocoDaSlug(slug)
  if (!id) return <NotFound />
  return <PaginaGioco id={id} />
}

function PaginaGioco({ id }: { id: GiocoClassificato }) {
  const gioco = giocoDi(id)
  const { dati: oggi } = useDati<OggiRisposta>('/oggi')
  const stato = oggi ? statiDiOggi(oggi)[id] : null
  const libera = useLibera(id)
  const [regole, setRegole] = useState(false)
  const Regole = REGOLE[id]
  const stile = { '--c1': `var(--${id}-1)`, '--c2': `var(--${id}-2)` } as CSSProperties

  return (
    <Pagina
      titolo={gioco.nome}
      sotto={gioco.motto}
      indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}
      eroe={<Copertina gioco={id} formato="eroe" transizione={`copertina-${id}`} />}
    >
      <div className="gioco__modi" style={stile}>
        <article className="modo modo--classificata entra">
          <p className="modo__etichetta">
            <IconCalendar size={15} /> Classificata · oggi
          </p>
          <h2 className="modo__titolo">{stato?.titolo ?? ' '}</h2>
          <p className="modo__testo">{stato?.dettaglio ?? gioco.classificata}</p>
          <div className="modo__piede">
            {stato && stato.fase !== 'non-pronta' ? (
              <Collegamento to={stato.a} className={`modo__bottone${stato.fase === 'fatta' ? ' is-secondario' : ''}`}>
                {stato.fase !== 'fatta' && <IconPlay size={15} />}
                {stato.azione}
              </Collegamento>
            ) : (
              <span className="modo__bottone is-spento">{stato ? 'Arriva a momenti' : ' '}</span>
            )}
            {stato?.punti !== null && stato?.punti !== undefined && (
              <Etichetta tono="brand">{stato.punti} punti</Etichetta>
            )}
          </div>
          {stato?.fase === 'fatta' && oggi ? (
            <Prossima ms={oggi.msToNextPuzzle} />
          ) : (
            <p className="modo__nota">{gioco.classificata} Vale per la classifica.</p>
          )}
        </article>

        <article className="modo modo--libera entra" style={{ '--n': 1 } as CSSProperties}>
          <p className="modo__etichetta">
            <IconShuffle size={15} /> Libera
          </p>
          <h2 className="modo__titolo">{gioco.liberaBreve}</h2>
          <p className="modo__testo">{gioco.libera}</p>
          <div className="modo__piede">
            <Collegamento to={ROTTE.libera(id)} className="modo__bottone is-tenue">
              {libera?.azione ?? 'Gioca'}
            </Collegamento>
            {libera?.dettaglio && <span className="modo__conto">{libera.dettaglio}</span>}
          </div>
          <p className="modo__nota">Senza punti in classifica: si gioca per il gusto di giocare.</p>
        </article>
      </div>

      <Anteprima id={id} />

      <Sezione>
        <Elenco>
          <Riga
            icona={<IconBook size={18} />}
            titolo="Come si gioca"
            sotto="Le regole, e come si fanno i punti"
            onClick={() => setRegole(true)}
          />
          <Riga
            icona={<IconTrophy size={18} />}
            titolo={`Classifica ${id === 'battaglia' ? 'della battaglia navale' : `del ${gioco.nome}`}`}
            sotto="Oggi, questa settimana, da sempre"
            a={ROTTE.classifica(id)}
          />
        </Elenco>
      </Sezione>

      <Regole open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/** Quanto manca alla prossima classificata, a partita fatta. */
function Prossima({ ms }: { ms: number }) {
  const restano = useCountdown(ms)
  return (
    <p className="modo__nota modo__prossima">
      <IconClock size={14} /> La prossima fra <span className="u-tabnum">{formatCountdown(restano)}</span>
    </p>
  )
}

/** I primi tre della settimana, e dove sei tu. */
function Anteprima({ id }: { id: GiocoClassificato }) {
  const player = usePlayer()
  const { dati } = useDati<Parameters<typeof righeComuni>[0]>(percorsoClassifica(id, 'week'))
  const righe: RigaComune[] = dati ? righeComuni(dati) : []
  const io = righe.find((r) => r.playerId === player.id)
  // Sul podio chi ha fatto punti: una partita appena aperta vale zero, e sul
  // gradino sembrerebbe un errore. E' la stessa regola della classifica.
  const podio = righe.filter((r) => r.punti > 0).slice(0, 3)
  if (dati && podio.length === 0) return null

  return (
    <Sezione titolo="Questa settimana" azione={<Collegamento to={ROTTE.classifica(id)}>Tutta</Collegamento>}>
      <div className="podio-mini">
        {(dati ? podio : [null, null, null]).map((r, i) =>
          r ? (
            <div key={r.playerId} className={`podio-mini__posto podio-mini__posto--${i + 1}`}>
              <Avatar nickname={r.nickname} color={r.avatarColor} size={i === 0 ? 52 : 42} medal={(i + 1) as 1 | 2 | 3} />
              <span className="podio-mini__nome">{r.displayName}</span>
              <span className="podio-mini__punti u-tabnum">{r.punti}</span>
            </div>
          ) : (
            <div key={i} className="podio-mini__posto">
              <span className="scheletro podio-mini__ombra" />
            </div>
          ),
        )}
      </div>
      {io && io.rank > 3 && (
        <p className="sezione__nota">
          Tu sei {io.rank}º con {io.punti} punti.
        </p>
      )}
    </Sezione>
  )
}

interface Libera {
  azione: string
  dettaglio: string | null
}

/** Com'e' messa la partita libera di un gioco: se ce n'e' una da continuare, e i conti. */
function useLibera(id: GiocoClassificato): Libera | null {
  const wordle = useDati<WordleLiberaRisposta>(id === 'wordle' ? '/wordle/libera' : null).dati
  const cruciverba = useDati<CruciverbaLiberaRisposta>(id === 'cruciverba' ? '/cruciverba/libera' : null).dati
  const scarabeo = useDati<StatisticheScarabeoLibero>(id === 'scarabeo' ? '/scarabeo/libera' : null).dati
  const battaglia = useDati<LobbyBattaglia>(id === 'battaglia' ? '/battaglia/lobby' : null).dati
  const [scarabeoInCorso, setScarabeoInCorso] = useState(false)
  // Le libere del quiz non vanno al server: i conti stanno nel telefono.
  const [quiz, setQuiz] = useState<StatisticheLibere | null>(null)

  useEffect(() => {
    if (id === 'scarabeo') setScarabeoInCorso(leggiPartitaLibera() !== null)
    if (id === 'quiz') setQuiz(leggiStatistiche())
  }, [id])

  switch (id) {
    case 'wordle':
      if (!wordle) return null
      return {
        azione: wordle.partita ? 'Continua' : 'Nuova parola',
        dettaglio: wordle.statistiche.giocate
          ? `${wordle.statistiche.vinte} indovinate su ${wordle.statistiche.giocate}`
          : null,
      }
    case 'cruciverba':
      if (!cruciverba) return null
      return {
        azione: cruciverba.partita ? 'Continua' : 'Nuovo schema',
        dettaglio: cruciverba.completate ? `${cruciverba.completate} completati` : null,
      }
    case 'scarabeo':
      if (!scarabeo) return null
      return {
        azione: scarabeoInCorso ? 'Continua' : 'Sfida il computer',
        dettaglio: scarabeo.giocate ? `${scarabeo.vinte} vinte su ${scarabeo.giocate}` : null,
      }
    case 'battaglia': {
      if (!battaglia) return null
      const controIlComputer = Object.values(battaglia.controComputer).reduce((n, r) => n + r.vinte, 0)
      return {
        azione: battaglia.partita || battaglia.computer ? 'Continua' : 'Scegli l’avversario',
        dettaglio:
          controIlComputer + battaglia.vinte > 0
            ? `${controIlComputer + battaglia.vinte} ${controIlComputer + battaglia.vinte === 1 ? 'vinta' : 'vinte'}`
            : null,
      }
    }
    case 'quiz':
      if (!quiz) return null
      return {
        azione: 'Scegli la categoria',
        dettaglio: quiz.domande > 0 ? `${quiz.giuste} giuste su ${quiz.domande}` : null,
      }
  }
}

