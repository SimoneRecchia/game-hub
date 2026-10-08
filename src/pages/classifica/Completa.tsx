import { useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Numero, Vuoto } from '@/components/Elementi'
import { IconChart, IconChevronRight, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { indirizzoClassifica, percorsoClassifica, type ChiaveClassifica } from '@/games/classifiche'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatNumber } from '@/lib/format'
import { comprendeOggi, periodoDi } from '@shared/periodi'
import { PUNTI_FINITA_ANAGRAMMI } from '@shared/anagrammi'
import { PUNTI_FINITA_SEQUENZE } from '@shared/sequenze'
import { PUNTI_GIOCATA_PAROLIERE } from '@shared/paroliere'
import { TETTI } from '@shared/punti'
import { DOMANDE_PER_PARTITA, PUNTI_BASE_QUIZ, PUNTI_QUIZ } from '@shared/quiz'
import { conSegno } from '@shared/ruota'
import { ATTEMPT_POINTS } from '@shared/scoring'
import type { GiocoClassificato, GiocoFortuna, LeaderboardScope } from '@shared/types'
import { ContiDi } from './Conti'
import { SceltaPeriodo, numeroDiOggi } from './Periodo'
import { useUltimi } from './useUltimi'
import {
  GIOCHI_FORTUNA,
  NOMI_CLASSIFICHE,
  NOMI_GENERALE,
  ORDINE_GENERALE,
  vociDi,
  type GiocoDellaGenerale,
  type Risposta,
  type Voce,
} from './voci'

/** Quanto vale ogni risposta giusta della classificata del quiz. */
const PUNTI_PER_GIUSTA = (PUNTI_QUIZ - PUNTI_BASE_QUIZ) / DOMANDE_PER_PARTITA

const LEDE: Record<ChiaveClassifica, string> = {
  generale: 'Tutte le classificate e i giochi della Fortuna.',
  wordle: `${ATTEMPT_POINTS[0]} punti al primo tentativo, ${ATTEMPT_POINTS[ATTEMPT_POINTS.length - 1]} al sesto.`,
  scarabeo: `Pareggiare il computer vale ${TETTI.scarabeo} punti.`,
  cruciverba: `${TETTI.cruciverba} punti se lo completi senza aiuti.`,
  sudoku: `${TETTI.sudoku} punti se lo risolvi senza aiuti.`,
  quiz: `${PUNTI_BASE_QUIZ} punti per aver giocato, ${PUNTI_PER_GIUSTA} per ogni risposta giusta.`,
  tris: '10 punti per la serie, 8 per ogni vittoria, 4 per ogni patta.',
  nomi: `Fino a ${TETTI.nomi} punti, che valgono il giorno dopo: di più per le risposte date da pochi.`,
  anagrammi: `${PUNTI_FINITA_ANAGRAMMI} punti per aver giocato, fino a 10 per ogni parola: di più se la trovi subito.`,
  sequenze: `${PUNTI_FINITA_SEQUENZE} punti per aver giocato, uno per ogni sequenza giusta: fino a ${TETTI.sequenze}.`,
  ghigliottina: `Si parte da ${TETTI.ghigliottina} punti, ogni scelta sbagliata li dimezza; zero se sbagli la parola vincente.`,
  paroliere: `${PUNTI_GIOCATA_PAROLIERE} punti per aver giocato, fino a ${TETTI.paroliere} con le parole della griglia.`,
  catena: `Si parte da ${TETTI.catena} punti, ogni errore li dimezza; zero se sbagli la parola finale.`,
  fortuna: 'Quel che Crazy Time, la slot e il blackjack hanno dato o tolto.',
}

/**
 * Una classifica per intero: il podio, poi tutti gli altri. Il periodo sta
 * nell'indirizzo, così la si puo' linkare com'e' — la settimana scorsa del
 * Wordle — ed e' quel che fanno le schermate di fine partita.
 */
export function Completa({
  chiave,
  scope,
  indietro,
}: {
  chiave: ChiaveClassifica
  scope: LeaderboardScope
  indietro: number
}) {
  const { vai } = useNavigazione()
  const me = usePlayer()
  // Da dove si arriva, per la freccia indietro: dalla panoramica, o dal trofeo di una scheda. Cambiando
  // periodo l'indirizzo si sostituisce, e lo stato va con lui.
  const { state } = useLocation()
  const da = (state as { da?: string } | null)?.da ?? 'Classifica'
  const { dati, errore, ricarica } = useDati<Risposta>(percorsoClassifica(chiave, scope, indietro))
  const { mostrati, vecchi } = useUltimi(dati)
  const [aperta, setAperta] = useState<Voce | null>(null)
  const [conti, setConti] = useState(false)
  // I conti di ogni gioco, classificate e libere: sono le statistiche di chi guarda, e stanno con la sua classifica.
  const gioco: GiocoClassificato | null = chiave === 'generale' || chiave === 'fortuna' ? null : chiave

  const cambia = (s: LeaderboardScope, i: number) =>
    vai(indirizzoClassifica(chiave, s, i), { replace: true, direzione: 'nessuna', state })

  const oggi = numeroDiOggi()
  const periodo = mostrati?.periodo ?? periodoDi(scope, oggi, indietro)
  const voci = mostrati
    ? vociDi(chiave, mostrati, { giorno: periodo.scope === 'today', oggi: comprendeOggi(periodo, oggi) })
    : null
  // Il podio e' per chi ha fatto punti: una partita appena aperta vale zero, e
  // metterla sul gradino sembrerebbe un errore.
  const conPunti = voci ? voci.filter((v) => v.punti > 0).length : 0
  const podio = voci ? voci.slice(0, Math.min(3, conPunti)) : []
  const resto = voci ? voci.slice(podio.length) : []
  const inCima = voci?.[0]?.punti ?? 0

  return (
    <Pagina
      titolo={NOMI_CLASSIFICHE[chiave]}
      sopra="Classifica"
      sotto={LEDE[chiave]}
      indietro={{ a: indirizzoClassifica(null, scope, indietro), etichetta: da }}
      azioni={
        gioco && (
          <BottoneBarra etichetta="I tuoi numeri" onClick={() => setConti(true)}>
            <IconChart size={20} />
          </BottoneBarra>
        )
      }
    >
      <SceltaPeriodo scope={scope} indietro={indietro} onCambia={cambia} />

      {errore && !mostrati ? (
        <Vuoto
          titolo="Non riesco a caricare la classifica"
          testo={errore}
          azione={
            <Button variant="tinted" onClick={() => void ricarica()}>
              Riprova
            </Button>
          }
        />
      ) : !voci ? (
        <div className="cl-scheletro" aria-hidden="true">
          <div className="scheletro cl-scheletro__podio" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="scheletro cl-scheletro__riga" />
          ))}
        </div>
      ) : voci.length === 0 ? (
        <Vuoto
          icona={<IconTrophy size={28} />}
          titolo={periodo.scope === 'today' && periodo.indietro === 0 ? 'Ancora nessuno oggi' : 'Nessuno ha giocato'}
          azione={
            chiave !== 'generale' && comprendeOggi(periodo, oggi) ? (
              <Button
                variant="tinted"
                onClick={() => vai(chiave === 'fortuna' ? ROTTE.fortuna : ROTTE.classificata(chiave))}
              >
                Gioca
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={`cl${vecchi ? ' is-vecchia' : ''}`} key={`${chiave}-${periodo.scope}-${periodo.indietro}`}>
          {podio.length > 0 && <Podio voci={podio} meId={me.id} onApri={setAperta} />}

          {resto.length > 0 && (
            <ol className="cl-elenco" start={podio.length + 1}>
              {resto.map((v, i) => (
                <RigaVoce
                  key={v.playerId}
                  voce={v}
                  io={v.playerId === me.id}
                  indice={i}
                  inCima={inCima}
                  onApri={setAperta}
                />
              ))}
            </ol>
          )}
        </div>
      )}

      <Sheet open={aperta !== null} onClose={() => setAperta(null)} title={aperta?.displayName}>
        {aperta && <Dettaglio voce={aperta} io={aperta.playerId === me.id} />}
      </Sheet>

      {gioco && (
        <Sheet open={conti} onClose={() => setConti(false)} title="I tuoi numeri">
          {conti && <ContiDi gioco={gioco} />}
        </Sheet>
      )}
    </Pagina>
  )
}

/* ─────────────────────────────  Il podio  ───────────────────────────── */

const ORDINE_PODIO = [2, 1, 3] as const

/**
 * Il primo al centro e piu' in alto, come sul podio vero. I gradini arrivano
 * al bordo della carta, che li arrotonda con i suoi angoli; un posto senza
 * nessuno resta, vuoto, perché il podio non cambi forma.
 */
function Podio({ voci, meId, onApri }: { voci: Voce[]; meId: string; onApri: (v: Voce) => void }) {
  return (
    <div className="cl-podio">
      {ORDINE_PODIO.map((posto) => {
        const v = voci[posto - 1]
        if (!v) {
          return (
            <div key={posto} className={`cl-podio__posto cl-podio__posto--${posto} is-vuoto`} aria-hidden="true">
              <span className="cl-podio__vuoto" />
              <span className="cl-podio__gradino">{posto}</span>
            </div>
          )
        }
        return (
          <button
            key={v.playerId}
            type="button"
            className={`cl-podio__posto cl-podio__posto--${posto}${v.playerId === meId ? ' is-io' : ''}`}
            onClick={() => onApri(v)}
          >
            <Avatar nickname={v.nickname} color={v.avatarColor} size={posto === 1 ? 64 : 50} medal={posto} />
            <span className="cl-podio__nome">{v.displayName}</span>
            <span className="cl-podio__punti">
              {v.conSegno && v.punti > 0 && '+'}
              <Numero valore={v.punti} />
            </span>
            <span className="cl-podio__breve">{v.breve}</span>
            <span className="cl-podio__gradino" aria-label={`${posto}º`}>
              {posto}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────  Le righe  ───────────────────────────── */

function RigaVoce({
  voce,
  io,
  indice,
  inCima,
  onApri,
}: {
  voce: Voce
  io: boolean
  indice: number
  /** I punti del primo: la barra della generale si misura su quelli. */
  inCima: number
  onApri: (v: Voce) => void
}) {
  return (
    <li className={`cl-riga${io ? ' is-io' : ''}`} style={{ animationDelay: `${Math.min(indice, 10) * 30}ms` }}>
      <button type="button" className="cl-riga__tocca" onClick={() => onApri(voce)}>
        <span className="cl-riga__rank u-tabnum">{voce.rank}</span>
        <Avatar nickname={voce.nickname} color={voce.avatarColor} size={38} />
        <span className="cl-riga__chi">
          <span className="cl-riga__nome">
            <span className="cl-riga__testo">{voce.displayName}</span>
            {io && <span className="cl-tu">tu</span>}
          </span>
          {voce.composizione && voce.punti > 0 ? (
            <BarraGiochi punti={voce.composizione} fortuna={voce.fortuna} totale={voce.punti} inCima={inCima} />
          ) : (
            <span className="cl-riga__sotto">{voce.sotto}</span>
          )}
        </span>
        {voce.segni}
        <span className="cl-riga__punti u-tabnum">
          {voce.conSegno ? conSegno(voce.punti) : formatNumber(voce.punti)}
        </span>
      </button>
    </li>
  )
}

/**
 * Di che cosa e' fatto un totale della generale: un tratto per gioco, nel suo
 * colore, lungo quanto i suoi punti. La barra intera e' lunga quanto il totale
 * in rapporto al primo, così si vede anche quanto manca. Quel che hanno dato i
 * giochi della Fortuna sono tratti in fondo; quel che hanno tolto accorcia la
 * barra, che e' lunga quanto il totale.
 */
function BarraGiochi({
  punti,
  fortuna,
  totale,
  inCima,
}: {
  punti: Record<GiocoDellaGenerale, number>
  fortuna?: Record<GiocoFortuna, number>
  totale: number
  inCima: number
}) {
  const lunghezza = inCima > 0 ? Math.max(6, (100 * totale) / inCima) : 100
  const giochi = ORDINE_GENERALE.filter((g) => punti[g] > 0)
  const azzardo = GIOCHI_FORTUNA.filter(([g]) => (fortuna?.[g] ?? 0) !== 0)
  const voci = [
    ...giochi.map((g) => `${NOMI_GENERALE[g]} ${punti[g]}`),
    ...azzardo.map(([g, nome]) => `${nome} ${conSegno(fortuna![g])}`),
  ]
  return (
    <span
      className="cl-barra"
      style={{ '--lunghezza': `${lunghezza}%` } as CSSProperties}
      role="img"
      aria-label={voci.join(', ')}
    >
      {giochi.map((g) => (
        <span key={g} className="cl-barra__tratto" style={{ flexGrow: punti[g], background: `var(--${g}-1)` }} />
      ))}
      {azzardo
        .filter(([g]) => fortuna![g] > 0)
        .map(([g]) => (
          <span key={g} className="cl-barra__tratto" style={{ flexGrow: fortuna![g], background: `var(--${g}-2)` }} />
        ))}
    </span>
  )
}

function Dettaglio({ voce, io }: { voce: Voce; io: boolean }) {
  return (
    <div className="cl-dettaglio">
      <div className="cl-dettaglio__testa">
        <Avatar nickname={voce.nickname} color={voce.avatarColor} size={56} />
        <div>
          <p className="cl-dettaglio__punti u-tabnum">{formatNumber(voce.punti)} punti</p>
          <p className="cl-dettaglio__rank">{voce.rank}º in classifica</p>
        </div>
      </div>
      <dl className="cl-dettaglio__voci">
        {voce.dettaglio.map((d) => (
          <div key={d.etichetta} className={`cl-dettaglio__voce${d.forte ? ' is-forte' : ''}`}>
            <dt>
              {d.gioco && <Copertina gioco={d.gioco} formato="icona" />}
              {d.etichetta}
            </dt>
            <dd className="u-tabnum">{d.valore}</dd>
          </div>
        ))}
      </dl>
      {voce.nota && <p className="cl-dettaglio__nota">{voce.nota}</p>}
      {!io && (
        <Collegamento to={ROTTE.amico(voce.nickname)} stato={{ da: 'Classifica' }} className="cl-dettaglio__profilo">
          Il profilo di {voce.displayName}
          <IconChevronRight size={16} />
        </Collegamento>
      )}
    </div>
  )
}
