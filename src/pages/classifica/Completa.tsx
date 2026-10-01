import { useState, type CSSProperties } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Numero, Vuoto } from '@/components/Elementi'
import { IconTrophy } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { indirizzoClassifica, percorsoClassifica, type ChiaveClassifica } from '@/games/classifiche'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatNumber } from '@/lib/format'
import { comprendeOggi, periodoDi } from '@shared/periodi'
import { NOME_CRAZY_TIME, conSegno } from '@shared/ruota'
import type { GiocoClassificato, LeaderboardScope } from '@shared/types'
import { SceltaPeriodo, numeroDiOggi } from './Periodo'
import { useUltimi } from './useUltimi'
import { NOMI_CLASSIFICHE, ORDINE_GIOCHI, vociDi, type Risposta, type Voce } from './voci'

const LEDE: Record<ChiaveClassifica, string> = {
  generale: 'Tutte le classificate, fino a 100 punti ciascuna, e Crazy Time.',
  wordle: '100 punti al primo tentativo, 50 al sesto.',
  scarabeo: 'Pareggiare il computer vale 100 punti.',
  cruciverba: '100 punti se lo completi senza aiuti.',
  sudoku: '100 punti se lo risolvi senza aiuti.',
  battaglia: 'Meno colpi, più punti.',
  quiz: '20 punti per aver giocato, 8 per ogni risposta giusta.',
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
  const { dati, errore, ricarica } = useDati<Risposta>(percorsoClassifica(chiave, scope, indietro))
  const { mostrati, vecchi } = useUltimi(dati)
  const [aperta, setAperta] = useState<Voce | null>(null)

  const cambia = (s: LeaderboardScope, i: number) =>
    vai(indirizzoClassifica(chiave, s, i), { replace: true, direzione: 'nessuna' })

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
      indietro={{ a: indirizzoClassifica(null, scope, indietro), etichetta: 'Classifica' }}
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
              <Button variant="tinted" onClick={() => vai(ROTTE.classificata(chiave))}>
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
        {aperta && <Dettaglio voce={aperta} />}
      </Sheet>
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
            <BarraGiochi punti={voce.composizione} ruota={voce.ruota ?? 0} totale={voce.punti} inCima={inCima} />
          ) : (
            <span className="cl-riga__sotto">{voce.sotto}</span>
          )}
        </span>
        {voce.segni}
        <span className="cl-riga__punti u-tabnum">{formatNumber(voce.punti)}</span>
      </button>
    </li>
  )
}

/**
 * Di che cosa e' fatto un totale della generale: un tratto per gioco, nel suo
 * colore, lungo quanto i suoi punti. La barra intera e' lunga quanto il totale
 * in rapporto al primo, così si vede anche quanto manca. Quel che ha dato
 * Crazy Time e' un tratto in fondo; quel che ha tolto accorcia la barra, che e'
 * lunga quanto il totale.
 */
function BarraGiochi({
  punti,
  ruota,
  totale,
  inCima,
}: {
  punti: Record<GiocoClassificato, number>
  ruota: number
  totale: number
  inCima: number
}) {
  const lunghezza = inCima > 0 ? Math.max(6, (100 * totale) / inCima) : 100
  const giochi = ORDINE_GIOCHI.filter((g) => punti[g] > 0)
  const voci = giochi.map((g) => `${NOMI_CLASSIFICHE[g]} ${punti[g]}`)
  return (
    <span
      className="cl-barra"
      style={{ '--lunghezza': `${lunghezza}%` } as CSSProperties}
      role="img"
      aria-label={[...voci, ...(ruota !== 0 ? [`${NOME_CRAZY_TIME} ${conSegno(ruota)}`] : [])].join(', ')}
    >
      {giochi.map((g) => (
        <span key={g} className="cl-barra__tratto" style={{ flexGrow: punti[g], background: `var(--${g}-1)` }} />
      ))}
      {ruota > 0 && <span className="cl-barra__tratto" style={{ flexGrow: ruota, background: 'var(--ruota-2)' }} />}
    </span>
  )
}

function Dettaglio({ voce }: { voce: Voce }) {
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
    </div>
  )
}
