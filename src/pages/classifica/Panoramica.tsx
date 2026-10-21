import type { CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Numero, Sezione, Vuoto } from '@/components/Elementi'
import { IconChevronRight } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { Pillola } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { indirizzoClassifica, percorsoPanoramica, type ChiaveClassifica } from '@/games/classifiche'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatNumber } from '@/lib/format'
import { comprendeOggi, periodoDi } from '@shared/periodi'
import { conSegno } from '@shared/ruota'
import type { AnteprimaClassifica, LeaderboardScope, PanoramicaClassifiche, RigaAnteprima } from '@shared/types'
import { Completa } from './Completa'
import { SceltaPeriodo, numeroDiOggi } from './Periodo'
import { useUltimi } from './useUltimi'
import { NOMI_CLASSIFICHE, ORDINE_GIOCHI } from './voci'

/**
 * Tutte le classifiche di un periodo in una pagina: in cima la generale, con
 * il podio grande che sale gradino dopo gradino e sotto il tuo posto se non
 * ci sei; poi, in carte strette, i primi tre di ogni gioco e in fondo quelli
 * della Fortuna. Toccandone una si apre per intero in un foglio, con lo stesso
 * periodo; toccando qualcuno si apre il suo profilo.
 */
export function Panoramica({
  scope,
  indietro,
  aperta,
}: {
  scope: LeaderboardScope
  indietro: number
  /** La classifica aperta nel foglio, dall'indirizzo. */
  aperta: ChiaveClassifica | null
}) {
  const { vai } = useNavigazione()
  const io = usePlayer().id
  // Da quale scheda si arriva, per la freccia indietro: le Giornaliere o la Fortuna.
  const { state } = useLocation()
  const da = (state as { da?: string } | null)?.da ?? 'Giornaliere'
  const { dati, errore, ricarica } = useDati<PanoramicaClassifiche>(percorsoPanoramica(scope, indietro))
  const { mostrati, vecchi } = useUltimi(dati)

  // Il periodo e il foglio aperto stanno nell'indirizzo: si sostituisce, e la pagina resta dov'e'.
  const vaiA = (chiave: ChiaveClassifica | null, s: LeaderboardScope, i: number) =>
    vai(indirizzoClassifica(chiave, s, i), { replace: true, direzione: 'nessuna', state })
  const apri = (chiave: ChiaveClassifica) => vaiA(chiave, scope, indietro)

  const oggi = numeroDiOggi()
  const periodo = mostrati?.periodo ?? periodoDi(scope, oggi, indietro)
  const vivo = comprendeOggi(periodo, oggi)

  return (
    <Pagina titolo="Classifica" indietro={{ a: ROTTE.home, etichetta: da }}>
      <SceltaPeriodo scope={scope} indietro={indietro} onCambia={(s, i) => vaiA(aperta, s, i)} />

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
          <Generale
            key={`${periodo.scope}-${periodo.indietro}`}
            anteprima={mostrati.classifiche.generale}
            io={io}
            vivo={vivo}
            onApri={() => apri('generale')}
          />
          <Sezione titolo="I giochi">
            <ul className="cl-pan__giochi">
              {ORDINE_GIOCHI.map((g, i) => (
                <li key={g} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
                  <CartaGioco
                    chiave={g}
                    anteprima={mostrati.classifiche[g]}
                    io={io}
                    onApri={() => apri(g)}
                    gioca={vivo ? ROTTE.classificata(g) : null}
                  />
                </li>
              ))}
              {mostrati.classifiche.fortuna && (
                <li className="entra" style={{ '--n': ORDINE_GIOCHI.length + 1 } as CSSProperties}>
                  <CartaGioco
                    chiave="fortuna"
                    anteprima={mostrati.classifiche.fortuna}
                    io={io}
                    onApri={() => apri('fortuna')}
                    gioca={vivo ? ROTTE.fortuna : null}
                    segno
                  />
                </li>
              )}
            </ul>
          </Sezione>
        </div>
      )}

      <Sheet
        open={aperta !== null}
        onClose={() => vaiA(null, scope, indietro)}
        title={aperta ? NOMI_CLASSIFICHE[aperta] : undefined}
      >
        {aperta && (
          <Completa key={aperta} chiave={aperta} scope={scope} indietro={indietro} onCambia={(s, i) => vaiA(aperta, s, i)} />
        )}
      </Sheet>
    </Pagina>
  )
}

/** "Tu · 4º": dove sei, in una pillola nella testata della carta. */
function Posizione({ anteprima }: { anteprima: AnteprimaClassifica }) {
  const { me } = anteprima
  if (!me) return null
  return <Pillola tono={me.rank === 1 && me.punti > 0 ? 'buona' : 'neutra'}>{`Tu · ${me.rank}º`}</Pillola>
}

/** La corona del primo: un disegno solo, d'oro, con la luce che ci passa sopra. */
function Corona() {
  return (
    <svg className="cl-gen__corona" viewBox="0 0 48 32" aria-hidden="true">
      <defs>
        <linearGradient id="cl-corona-oro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe48a" />
          <stop offset="0.55" stopColor="#f2b51c" />
          <stop offset="1" stopColor="#c98a06" />
        </linearGradient>
      </defs>
      <path
        d="M4 28 L2 8 L14 17 L24 3 L34 17 L46 8 L44 28 Z"
        fill="url(#cl-corona-oro)"
        stroke="#a86f00"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="2.5" cy="7.5" r="2.6" fill="#ffd34d" />
      <circle cx="24" cy="3" r="2.8" fill="#ffd34d" />
      <circle cx="45.5" cy="7.5" r="2.6" fill="#ffd34d" />
      <circle cx="24" cy="21" r="2.6" fill="#ef4444" />
      <circle cx="13" cy="22.5" r="1.8" fill="#3b82f6" />
      <circle cx="35" cy="22.5" r="1.8" fill="#22c55e" />
    </svg>
  )
}

const ORDINE_PODIO = [2, 1, 3] as const

/**
 * La generale: il podio grande, che sale come alle premiazioni — il terzo, il
 * secondo, poi il primo, con la corona e i raggi dietro — e i punti che
 * contano fino al totale. Sotto, il tuo posto se non sei sul podio. Un posto
 * del podio senza nessuno resta, vuoto: il podio non cambia forma. Si rifa'
 * cambiando periodo (la chiave), non tornando alla pagina.
 */
function Generale({
  anteprima,
  io,
  vivo,
  onApri,
}: {
  anteprima: AnteprimaClassifica
  io: string
  vivo: boolean
  onApri: () => void
}) {
  const primi = anteprima.primi.filter((r) => r.punti > 0)
  const mia = anteprima.me && !primi.some((r) => r.playerId === io) ? anteprima.me : null
  return (
    <article className="cl-gen">
      <button type="button" className="cl-gen__testa" onClick={onApri}>
        <Copertina gioco="generale" formato="icona" />
        <span className="cl-gen__titolo">
          <span className="cl-gen__nome">Generale</span>
          <span className="cl-gen__sotto">
            {anteprima.giocatori === 1 ? 'Un giocatore' : `${anteprima.giocatori} giocatori`}
          </span>
        </span>
        <Posizione anteprima={anteprima} />
        <IconChevronRight size={18} className="cl-gen__freccia" />
      </button>

      {primi.length === 0 ? (
        <p className="cl-gen__vuota">
          {anteprima.giocatori > 0 && vivo ? 'Nessuna classificata finita, per ora.' : 'Nessuno ha giocato.'}
        </p>
      ) : (
        <ol className="cl-gen__podio">
          {ORDINE_PODIO.map((posto) => {
            const r = primi[posto - 1]
            return (
              <li key={posto} className={`cl-gen__posto cl-gen__posto--${posto}${r?.playerId === io ? ' is-io' : ''}`}>
                {posto === 1 && <span className="cl-gen__raggi" aria-hidden="true" />}
                {r ? (
                  <Collegamento to={ROTTE.amico(r.nickname)} stato={{ da: 'Classifica' }} className="cl-gen__chi">
                    {posto === 1 && <Corona />}
                    <span className="cl-gen__avatar">
                      <Avatar nickname={r.nickname} color={r.avatarColor} size={posto === 1 ? 72 : 56} medal={posto} />
                    </span>
                    <span className="cl-gen__nome-posto">{r.displayName}</span>
                    <span className="cl-gen__punti u-tabnum">
                      <Numero valore={r.punti} durata={1100} />
                    </span>
                  </Collegamento>
                ) : (
                  <span className="cl-gen__chi" aria-hidden="true">
                    <span className="cl-gen__vuoto" />
                  </span>
                )}
                <span className="cl-gen__gradino" aria-label={r ? `${posto}º` : undefined}>
                  <span className="cl-gen__numero">{posto}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {mia && (
        <Collegamento to={ROTTE.amico(mia.nickname)} stato={{ da: 'Classifica' }} className="cl-gen__mia">
          <span className="cl-gen__mia-rank u-tabnum">{mia.rank}º</span>
          <Avatar nickname={mia.nickname} color={mia.avatarColor} size={34} />
          <span className="cl-gen__mia-nome">
            {mia.displayName}
            <span className="cl-tu">tu</span>
          </span>
          <span className="cl-gen__mia-punti u-tabnum">{formatNumber(mia.punti)}</span>
        </Collegamento>
      )}

      <button type="button" className="cl-gen__tutta" onClick={onApri}>
        Tutta la classifica
        <IconChevronRight size={16} />
      </button>
    </article>
  )
}

/**
 * Un gioco, nel minor spazio: la testata e i primi tre in fila, ognuno con
 * l'anello della sua medaglia. Dove sei lo dice la pillola; se non hai ancora
 * giocato la classificata di oggi, al suo posto c'e' il bottone per farlo.
 */
function CartaGioco({
  chiave,
  anteprima,
  io,
  onApri,
  gioca,
  segno = false,
}: {
  chiave: Exclude<ChiaveClassifica, 'generale'>
  anteprima: AnteprimaClassifica
  io: string
  onApri: () => void
  /** Dove si gioca la classificata, se il periodo arriva a oggi. */
  gioca: string | null
  /** I punti con il segno: nella Fortuna si puo' andare sotto zero. */
  segno?: boolean
}) {
  const { primi, me } = anteprima
  return (
    <article className="cl-carta" style={colori(chiave)}>
      <button
        type="button"
        className="cl-carta__tutta"
        aria-label={`Classifica ${NOMI_CLASSIFICHE[chiave]} per intero`}
        onClick={onApri}
      />
      <header className="cl-carta__testa">
        <Copertina gioco={chiave} formato="icona" />
        <h3 className="cl-carta__titolo">{NOMI_CLASSIFICHE[chiave]}</h3>
      </header>
      {primi.length === 0 ? (
        <p className="cl-carta__vuota">Nessuno ha giocato.</p>
      ) : (
        <ol className="cl-primi">
          {primi.map((r) => (
            <Primo key={r.playerId} riga={r} io={r.playerId === io} segno={segno} />
          ))}
        </ol>
      )}
      {(me || gioca) && (
        <footer className="cl-carta__piede">
          {me ? (
            <Posizione anteprima={anteprima} />
          ) : (
            gioca && (
              <Collegamento to={gioca} className="cl-carta__gioca">
                Gioca
              </Collegamento>
            )
          )}
        </footer>
      )}
    </article>
  )
}

function Primo({ riga, io, segno }: { riga: RigaAnteprima; io: boolean; segno: boolean }) {
  const medaglia = riga.punti > 0 && riga.rank <= 3 ? (riga.rank as 1 | 2 | 3) : null
  return (
    <li className={`cl-primo${io ? ' is-io' : ''}${medaglia ? ` cl-primo--${medaglia}` : ''}`}>
      <span className="cl-primo__rank u-tabnum">{riga.rank}</span>
      <span className="cl-primo__nome">{io ? 'Tu' : riga.displayName}</span>
      <span className="cl-primo__punti u-tabnum">
        {riga.inCorso && riga.punti === 0 ? 'in corso' : segno ? conSegno(riga.punti) : formatNumber(riga.punti)}
      </span>
    </li>
  )
}

function colori(chiave: ChiaveClassifica): CSSProperties {
  return { '--c1': `var(--${chiave}-1)`, '--c2': `var(--${chiave}-2)` } as CSSProperties
}
