import type { CSSProperties } from 'react'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Etichetta, Sezione, Vuoto } from '@/components/Elementi'
import { IconChevronRight } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { Pillola } from '@/components/Scheda'
import { indirizzoClassifica, percorsoPanoramica, type ChiaveClassifica } from '@/games/classifiche'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatNumber } from '@/lib/format'
import { comprendeOggi, periodoDi } from '@shared/periodi'
import type { AnteprimaClassifica, LeaderboardScope, PanoramicaClassifiche, RigaAnteprima } from '@shared/types'
import { SceltaPeriodo, numeroDiOggi } from './Periodo'
import { useUltimi } from './useUltimi'
import { NOMI_CLASSIFICHE, ORDINE_GIOCHI } from './voci'

/**
 * Tutte le classifiche di un periodo, una sotto l'altra: in cima la generale,
 * che somma le classificate di tutti i giochi, poi quella di ogni gioco. Di
 * ognuna i primi tre e dove sei tu; toccandola si apre per intero, con lo
 * stesso periodo.
 */
export function Panoramica({ scope, indietro }: { scope: LeaderboardScope; indietro: number }) {
  const { vai } = useNavigazione()
  const io = usePlayer().id
  const { dati, errore, ricarica } = useDati<PanoramicaClassifiche>(percorsoPanoramica(scope, indietro))
  const { mostrati, vecchi } = useUltimi(dati)

  const cambia = (s: LeaderboardScope, i: number) =>
    vai(indirizzoClassifica(null, s, i), { replace: true, direzione: 'nessuna' })

  const oggi = numeroDiOggi()
  const periodo = mostrati?.periodo ?? periodoDi(scope, oggi, indietro)
  const vivo = comprendeOggi(periodo, oggi)
  const a = (chiave: ChiaveClassifica) => indirizzoClassifica(chiave, periodo.scope, periodo.indietro)

  return (
    <Pagina titolo="Classifica">
      <SceltaPeriodo scope={scope} indietro={indietro} onCambia={cambia} />

      {errore && !mostrati ? (
        <Vuoto
          titolo="Non riesco a caricare le classifiche"
          testo={errore}
          azione={
            <Button variant="tinted" onClick={() => void ricarica()}>
              Riprova
            </Button>
          }
        />
      ) : !mostrati ? (
        <div className="cl-pan" aria-hidden="true">
          <div className="scheletro cl-scheletro__generale" />
          <div className="cl-pan__giochi">
            {ORDINE_GIOCHI.map((g) => (
              <div key={g} className="scheletro cl-scheletro__gioco" />
            ))}
          </div>
        </div>
      ) : (
        <div className={`cl-pan${vecchi ? ' is-vecchia' : ''}`}>
          <CartaGenerale anteprima={mostrati.classifiche.generale} io={io} a={a('generale')} vivo={vivo} />
          <Sezione titolo="I giochi">
            <ul className="cl-pan__giochi">
              {ORDINE_GIOCHI.map((g, i) => (
                <li key={g} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
                  <CartaGioco
                    chiave={g}
                    anteprima={mostrati.classifiche[g]}
                    io={io}
                    a={a(g)}
                    gioca={vivo ? ROTTE.classificata(g) : null}
                  />
                </li>
              ))}
            </ul>
          </Sezione>
        </div>
      )}
    </Pagina>
  )
}

/** "4º di 12": dove sei, in una pillola nella testata della carta. */
function Posizione({ anteprima }: { anteprima: AnteprimaClassifica }) {
  const { me, giocatori } = anteprima
  if (!me) return null
  return <Pillola tono={me.rank === 1 && me.punti > 0 ? 'buona' : 'neutra'}>{`${me.rank}º di ${giocatori}`}</Pillola>
}

function Testata({ chiave, anteprima }: { chiave: ChiaveClassifica; anteprima: AnteprimaClassifica }) {
  return (
    <header className="cl-carta__testa">
      <Copertina gioco={chiave} formato="icona" />
      <h3 className="cl-carta__titolo">{NOMI_CLASSIFICHE[chiave]}</h3>
      <Posizione anteprima={anteprima} />
      <IconChevronRight size={18} className="cl-carta__freccia" />
    </header>
  )
}

/**
 * La generale: il podio dei primi tre, e sotto la tua riga se non ci sei. Un
 * posto del podio senza nessuno resta, vuoto: il podio non cambia forma.
 */
function CartaGenerale({
  anteprima,
  io,
  a,
  vivo,
}: {
  anteprima: AnteprimaClassifica
  io: string
  a: string
  vivo: boolean
}) {
  const primi = anteprima.primi.filter((r) => r.punti > 0)
  const mia = anteprima.me && !primi.some((r) => r.playerId === io) ? anteprima.me : null
  return (
    <article className="cl-carta cl-carta--generale" style={colori('generale')}>
      <Collegamento to={a} className="cl-carta__tutta" aria-label="Classifica generale per intero" />
      <Testata chiave="generale" anteprima={anteprima} />
      {primi.length === 0 ? (
        <p className="cl-carta__vuota">
          {anteprima.giocatori > 0 && vivo ? 'Nessuna classificata finita, per ora.' : 'Nessuno ha giocato.'}
        </p>
      ) : (
        <ol className="cl-podietto">
          {([2, 1, 3] as const).map((posto) => {
            const r = primi[posto - 1]
            return (
              <li key={posto} className={`cl-podietto__posto cl-podietto__posto--${posto}${r?.playerId === io ? ' is-io' : ''}`}>
                {r ? (
                  <>
                    <Avatar nickname={r.nickname} color={r.avatarColor} size={posto === 1 ? 58 : 46} medal={posto} />
                    <span className="cl-podietto__nome">{r.displayName}</span>
                    <span className="cl-podietto__punti u-tabnum">{formatNumber(r.punti)}</span>
                  </>
                ) : (
                  <span className="cl-podietto__vuoto" aria-hidden="true" />
                )}
              </li>
            )
          })}
        </ol>
      )}
      {mia && (
        <ol className="cl-mini cl-mini--mia" start={mia.rank}>
          <RigaMini riga={mia} io />
        </ol>
      )}
    </article>
  )
}

/**
 * Un gioco: i primi tre in fila, e la tua riga se non ci sei. Se non hai
 * ancora giocato la classificata di oggi, sotto c'e' il bottone per farlo.
 */
function CartaGioco({
  chiave,
  anteprima,
  io,
  a,
  gioca,
}: {
  chiave: Exclude<ChiaveClassifica, 'generale'>
  anteprima: AnteprimaClassifica
  io: string
  a: string
  /** Dove si gioca la classificata, se il periodo arriva a oggi. */
  gioca: string | null
}) {
  const { primi, me } = anteprima
  const mia = me && !primi.some((r) => r.playerId === io) ? me : null
  return (
    <article className="cl-carta" style={colori(chiave)}>
      <Collegamento to={a} className="cl-carta__tutta" aria-label={`Classifica ${NOMI_CLASSIFICHE[chiave]} per intero`} />
      <Testata chiave={chiave} anteprima={anteprima} />
      {primi.length === 0 ? (
        <p className="cl-carta__vuota">Nessuno ha giocato.</p>
      ) : (
        <ol className="cl-mini">
          {primi.map((r) => (
            <RigaMini key={r.playerId} riga={r} io={r.playerId === io} />
          ))}
        </ol>
      )}
      {mia && (
        <ol className="cl-mini cl-mini--mia" start={mia.rank}>
          <RigaMini riga={mia} io />
        </ol>
      )}
      {!me && gioca && (
        <Collegamento to={gioca} className="cl-carta__gioca">
          Gioca la classificata
          <IconChevronRight size={15} />
        </Collegamento>
      )}
    </article>
  )
}

function RigaMini({ riga, io }: { riga: RigaAnteprima; io: boolean }) {
  return (
    <li className={`cl-mini__riga${io ? ' is-io' : ''}`}>
      <span className={`cl-mini__rank u-tabnum${riga.punti > 0 && riga.rank <= 3 ? ` is-${riga.rank}` : ''}`}>
        {riga.rank}
      </span>
      <Avatar nickname={riga.nickname} color={riga.avatarColor} size={30} />
      <span className="cl-mini__nome">
        <span className="cl-mini__testo">{riga.displayName}</span>
        {io && <span className="cl-tu">tu</span>}
      </span>
      {riga.inCorso && riga.punti === 0 ? (
        <Etichetta tono="arancio">in corso</Etichetta>
      ) : (
        <span className="cl-mini__punti u-tabnum">{formatNumber(riga.punti)}</span>
      )}
    </li>
  )
}

function colori(chiave: ChiaveClassifica): CSSProperties {
  return { '--c1': `var(--${chiave}-1)`, '--c2': `var(--${chiave}-2)` } as CSSProperties
}
