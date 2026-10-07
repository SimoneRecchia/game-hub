/**
 * Le schermate private: quel che vede un giocatore solo — il suo ruolo, quel
 * che fa di notte, il Benvenuto quando muore, il voto segreto. Sono le stesse
 * per il telefono che passa di mano (`locale`) e per la stanza online, dove
 * ognuno ha il suo telefono.
 *
 * Sul telefono che passa di mano anche chi non ha niente da fare finge di
 * scegliere, perché da fuori tutti facciano lo stesso gesto; online chi dorme
 * vede che dorme, e basta.
 */

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { suona } from '@/lib/suoni'
import type { SceltaNotturna, SegretoLupus, TipoCompito } from '@shared/lupus'
import { PERSONAGGI } from '@shared/lupus-personaggi'
import type { RichiestaLupus, VistaGiocatore } from '@shared/lupus-vista'
import { IconaLupus } from './Icone'
import { BadgeRuolo, CartaRuolo, Gettone, RigaSegreto, SceltaGiocatore, TestaFase } from './Pezzi'
import { cheCosaFaUnFantasma, COMPITI, nomeDi } from './testi'

/** Lo scheletro di una schermata di gioco: il corpo, che scorre se serve, e i bottoni sotto. */
export function Schermo({ children, piede }: { children: ReactNode; piede?: ReactNode }) {
  return (
    <div className="lupus-schermo">
      <div className="lupus-schermo__corpo">{children}</div>
      {piede && <div className="lupus-schermo__piede">{piede}</div>}
    </div>
  )
}

const ruoloDi = (v: VistaGiocatore) => v.tu.ruoloAssunto ?? v.tu.ruolo

/** Quando la notizia della prima notte non ha nessuno da mostrare. */
const SOLO: Partial<Record<TipoCompito, string>> = {
  branco: 'Sei l’unico lupo.',
  loggia: 'L’altro Massone non c’è.',
  sogno: 'Non ci sono lupi da vedere.',
}

/* ─────────────────────────────  Il ruolo  ───────────────────────────── */

/** Il ruolo, prima coperto: si scopre quando nessuno guarda, e si nasconde prima di passare il telefono. */
export function Rivelazione({ vista, onVisto }: { vista: VistaGiocatore; onVisto: () => void }) {
  const [scoperto, setScoperto] = useState(false)
  if (!scoperto) {
    return (
      <Schermo
        piede={
          <Button
            size="lg"
            fullWidth
            onClick={() => {
              suona('svela')
              setScoperto(true)
            }}
          >
            Scopri il ruolo
          </Button>
        }
      >
        <div className="lupus-centro">
          <TestaFase icona="nascosto" titolo="Il tuo ruolo" sotto="Guarda che nessuno veda lo schermo." />
        </div>
      </Schermo>
    )
  }
  const compagni = vista.tu.compagni
  return (
    <Schermo
      piede={
        <Button size="lg" fullWidth onClick={onVisto}>
          Ho capito, nascondi
        </Button>
      }
    >
      <CartaRuolo ruolo={vista.tu.ruolo} assunto={vista.tu.ruoloAssunto}>
        {compagni.length > 0 && (
          <div className="lupus-carta__compagni">
            <p className="lupus-etichetta">{ruoloDi(vista) === 'massone' ? 'L’altro Massone' : 'Il branco'}</p>
            <div className="lupus-gettoni">
              {compagni.map((id) => (
                <Gettone key={id} id={id} nome={nomeDi(vista.giocatori, id)} />
              ))}
            </div>
          </div>
        )}
      </CartaRuolo>
    </Schermo>
  )
}

/* ─────────────────────────────  La notte  ───────────────────────────── */

/** In cima a ogni schermata della notte: il proprio personaggio, la notte, e che cosa fare. */
function TestaNotte({
  vista,
  notte,
  titolo,
  sotto,
}: {
  vista: VistaGiocatore
  notte: number
  titolo: string
  sotto?: string
}) {
  const ruolo = ruoloDi(vista)
  return (
    <header className="lupus-testa-notte">
      <BadgeRuolo ruolo={ruolo} size={52} />
      <div className="lupus-testa-notte__testo">
        <p className="lupus-occhiello">
          Notte {notte} · {PERSONAGGI[ruolo].nome}
        </p>
        <h2 className="lupus-testa-notte__titolo">{titolo}</h2>
        {sotto && <p className="lupus-testa-notte__sotto">{sotto}</p>}
      </div>
    </header>
  )
}

/** Quel che il Mitomane ha saputo alla fine della notte di prima: lo legge la notte dopo. */
function NotiziaDelMitomane({ vista, notte }: { vista: VistaGiocatore; notte: number }) {
  const s = vista.segreti.find((x) => x.tipo === 'imitazione' && x.notte === notte - 1)
  return s ? <RigaSegreto segreto={s} giocatori={vista.giocatori} /> : null
}

/** L'ultima cosa saputa stanotte: la risposta al Veggente, la pozione, il teschio. */
export function UltimoSegreto({ vista, notte }: { vista: VistaGiocatore; notte: number }) {
  const s: SegretoLupus | undefined = vista.segreti.filter((x) => x.notte === notte).at(-1)
  return s ? <RigaSegreto segreto={s} giocatori={vista.giocatori} /> : null
}

/** Per i lupi: chi ha scelto chi, finora. */
function SceltaDelBranco({
  vista,
  branco,
}: {
  vista: VistaGiocatore
  branco: { id: string; scelta: string | null }[]
}) {
  if (branco.length === 0) return null
  return (
    <section className="lupus-branco" aria-label="Il branco">
      <p className="lupus-etichetta">Il branco</p>
      {branco.map((b) => (
        <p key={b.id} className="lupus-branco__riga">
          <strong>{nomeDi(vista.giocatori, b.id)}</strong>
          <span>{b.scelta ? `→ ${nomeDi(vista.giocatori, b.scelta)}` : 'sta scegliendo…'}</span>
        </p>
      ))}
    </section>
  )
}

type Indica = Extract<RichiestaLupus, { tipo: 'indica' }>

/**
 * La notte di un giocatore. `locale` e' il telefono che passa di mano: chi
 * dorme, o e' un fantasma, finge di scegliere fra `vivi` (chi era vivo quando
 * la notte e' cominciata) e passa (`onFinto`).
 */
export function SchermataNotte({
  vista,
  notte,
  locale,
  vivi,
  onScelta,
  onFinto,
}: {
  vista: VistaGiocatore
  notte: number
  locale: boolean
  vivi?: readonly string[]
  onScelta: (scelta: SceltaNotturna) => void
  onFinto?: () => void
}) {
  const r = vista.richiesta
  const consiglio = PERSONAGGI[ruoloDi(vista)].consiglioNotte

  if (!locale && vista.fatto) {
    return (
      <Schermo>
        <TestaNotte vista={vista} notte={notte} titolo="Fatto" sotto="Chiudi gli occhi e aspetta l’alba." />
        <UltimoSegreto vista={vista} notte={notte} />
        {r.tipo === 'indica' && r.branco && <SceltaDelBranco vista={vista} branco={r.branco} />}
      </Schermo>
    )
  }

  if (r.tipo === 'indica') return <SceltaDellaNotte vista={vista} notte={notte} richiesta={r} onScelta={onScelta} />

  if (r.tipo === 'conferma') {
    return (
      <Schermo
        piede={
          <>
            <Button size="lg" fullWidth onClick={() => onScelta({ tipo: 'potere', usa: true })}>
              Sì, riportalo in vita
            </Button>
            <Button variant="plain" size="lg" fullWidth onClick={() => onScelta({ tipo: 'potere', usa: false })}>
              Non stanotte
            </Button>
          </>
        }
      >
        <TestaNotte vista={vista} notte={notte} titolo="Riporti in vita un fantasma?" sotto={consiglio} />
        <p className="lupus-riquadro">
          Il <strong>Benvenuto!</strong> è di <strong>{nomeDi(vista.giocatori, r.bersaglio)}</strong>: all’alba torna in
          vita. Si fa una volta sola.
        </p>
      </Schermo>
    )
  }

  if (r.tipo === 'notizia') {
    return (
      <Schermo
        piede={
          <Button size="lg" fullWidth onClick={() => onScelta({ tipo: 'letto' })}>
            Ho capito
          </Button>
        }
      >
        <TestaNotte vista={vista} notte={notte} titolo={r.testo} />
        {r.giocatori && r.giocatori.length > 0 ? (
          <div className="lupus-gettoni lupus-gettoni--grandi">
            {r.giocatori.map((id) => (
              <Gettone key={id} id={id} nome={nomeDi(vista.giocatori, id)} />
            ))}
          </div>
        ) : (
          SOLO[r.compito] && <p className="lupus-riquadro">{SOLO[r.compito]}</p>
        )}
      </Schermo>
    )
  }

  if (r.tipo === 'dormi' || r.tipo === 'fantasma') {
    if (locale && onFinto) {
      return (
        <NotteFinta vista={vista} notte={notte} vivi={vivi ?? []} fantasma={r.tipo === 'fantasma'} onFatto={onFinto} />
      )
    }
    return (
      <Schermo>
        <div className="lupus-centro">
          <TestaFase
            icona={r.tipo === 'fantasma' ? 'fantasma' : 'luna'}
            titolo={r.tipo === 'fantasma' ? 'Sei un fantasma' : 'Dormi'}
            sotto={
              r.tipo === 'fantasma'
                ? vista.impostazioni.fantasmiVotano
                  ? 'Guarda in silenzio. Di giorno voti ancora gli indiziati.'
                  : 'Guarda in silenzio. Non voti più.'
                : 'Stanotte non hai niente da fare. Aspetta l’alba.'
            }
          />
          <NotiziaDelMitomane vista={vista} notte={notte} />
        </div>
      </Schermo>
    )
  }

  return (
    <Schermo>
      <div className="lupus-centro">
        <TestaFase icona="luna" titolo="Notte" sotto="Aspetta l’alba." />
      </div>
    </Schermo>
  )
}

/** Indicare qualcuno: il Veggente che scruta, i lupi che sbranano, la Guardia che protegge. */
function SceltaDellaNotte({
  vista,
  notte,
  richiesta,
  onScelta,
}: {
  vista: VistaGiocatore
  notte: number
  richiesta: Indica
  onScelta: (scelta: SceltaNotturna) => void
}) {
  const [scelto, setScelto] = useState<string | null>(null)
  const c = COMPITI[richiesta.compito] ?? { titolo: 'Chi scegli?', verbo: 'Scegli' }
  const consiglio = c.aiuto ?? PERSONAGGI[ruoloDi(vista)].consiglioNotte
  return (
    <Schermo
      piede={
        <>
          <Button
            variant={c.letale ? 'destructive' : 'filled'}
            size="lg"
            fullWidth
            disabled={!scelto}
            onClick={() => scelto && onScelta({ tipo: 'indica', bersaglio: scelto })}
          >
            {scelto ? `${c.verbo} ${nomeDi(vista.giocatori, scelto)}` : 'Tocca un giocatore'}
          </Button>
          {richiesta.facoltativo && (
            <Button variant="plain" size="lg" fullWidth onClick={() => onScelta({ tipo: 'nessuno' })}>
              Stanotte no
            </Button>
          )}
        </>
      }
    >
      <TestaNotte vista={vista} notte={notte} titolo={c.titolo} sotto={consiglio} />
      <NotiziaDelMitomane vista={vista} notte={notte} />
      {richiesta.branco && <SceltaDelBranco vista={vista} branco={richiesta.branco} />}
      <SceltaGiocatore giocatori={vista.giocatori} bersagli={richiesta.bersagli} valore={scelto} onScegli={setScelto} />
    </Schermo>
  )
}

/**
 * Chi non ha niente da fare, sul telefono che passa di mano: tocca qualcuno
 * come tutti, cosi' da fuori nessuno capisce chi ha un potere. Si sceglie fra
 * chi era vivo quando la notte e' cominciata, e di loro non si dice niente di
 * quel che stanotte e' cambiato: la notte puo' essere gia' risolta, e la carta
 * di chi e' appena morto non si deve vedere prima dell'alba.
 */
export function NotteFinta({
  vista,
  notte,
  vivi,
  fantasma,
  onFatto,
}: {
  vista: VistaGiocatore
  notte: number
  vivi: readonly string[]
  fantasma: boolean
  onFatto: () => void
}) {
  const [scelto, setScelto] = useState<string | null>(null)
  return (
    <Schermo
      piede={
        <Button size="lg" fullWidth disabled={!scelto} onClick={onFatto}>
          {scelto ? 'Fatto' : 'Tocca un giocatore'}
        </Button>
      }
    >
      <TestaNotte
        vista={vista}
        notte={notte}
        titolo={fantasma ? 'Sei un fantasma' : 'Stanotte dormi'}
        sotto="Fai finta di scegliere: tocca un giocatore qualsiasi."
      />
      <NotiziaDelMitomane vista={vista} notte={notte} />
      <SceltaGiocatore
        giocatori={vista.giocatori.map((g) => ({ ...g, vivo: true, nonMorto: false, ruolo: undefined }))}
        bersagli={vivi.filter((id) => id !== vista.tu.id)}
        valore={scelto}
        onScegli={setScelto}
      />
    </Schermo>
  )
}

/** Dopo aver agito, sul telefono che passa di mano: l'esito, da leggere prima di passarlo. */
export function EsitoDellaNotte({
  vista,
  notte,
  onLetto,
}: {
  vista: VistaGiocatore
  notte: number
  onLetto: () => void
}) {
  return (
    <Schermo
      piede={
        <Button size="lg" fullWidth onClick={onLetto}>
          Ho capito, nascondi
        </Button>
      }
    >
      <TestaNotte vista={vista} notte={notte} titolo="Fatto" sotto="Leggi, poi nascondi e passa il telefono." />
      <UltimoSegreto vista={vista} notte={notte} />
    </Schermo>
  )
}

/* ─────────────────────────────  Il Benvenuto  ───────────────────────────── */

type Benvenuto = Extract<RichiestaLupus, { tipo: 'benvenuto' }>

/** Chi e' appena morto diventa un fantasma. Amleto e Dorian Wolf possono rivelarsi. */
export function SchermataBenvenuto({
  vista,
  richiesta,
  onRisposta,
}: {
  vista: VistaGiocatore
  richiesta: Benvenuto
  onRisposta: (rivela: boolean) => void
}) {
  const ruolo = ruoloDi(vista)
  const scelta = richiesta.scelta
  const custode = scelta?.custode ? nomeDi(vista.giocatori, scelta.custode) : null
  const nonMorto = vista.tu.nonMorto
  return (
    <Schermo
      piede={
        scelta ? (
          <>
            <Button size="lg" fullWidth onClick={() => onRisposta(true)}>
              {scelta.tipo === 'amleto' ? 'Mi rivelo' : 'Mi rivelo e resto in vita'}
            </Button>
            <Button variant="plain" size="lg" fullWidth onClick={() => onRisposta(false)}>
              Non mi rivelo
            </Button>
          </>
        ) : (
          <Button size="lg" fullWidth onClick={() => onRisposta(false)}>
            Ho capito
          </Button>
        )
      }
    >
      <TestaFase
        icona={nonMorto ? 'mortovivo' : 'fantasma'}
        tono={nonMorto ? 'semplice' : 'sangue'}
        titolo={nonMorto ? 'Sei il Mortovivo' : 'Sei un fantasma'}
        sotto={
          nonMorto
            ? 'Mostri la tua carta e continui a giocare: parli e voti come un vivo.'
            : cheCosaFaUnFantasma(vista.impostazioni)
        }
      />
      <div className="lupus-chi-eri">
        <BadgeRuolo ruolo={ruolo} size={44} />
        <span>
          <span className="lupus-etichetta">Il tuo personaggio</span>
          <strong>{PERSONAGGI[ruolo].nome}</strong>
        </span>
      </div>
      {scelta && (
        <p className="lupus-riquadro">
          {scelta.tipo === 'amleto' ? (
            custode ? (
              <>
                Se ti riveli muore anche <strong>{custode}</strong>, che ha il teschio.
              </>
            ) : (
              'Se ti riveli il teschio si scarta: chi lo aveva è già un fantasma.'
            )
          ) : custode ? (
            <>
              Se ti riveli resti in vita, e al tuo posto muore <strong>{custode}</strong>, che ha il ritratto.
            </>
          ) : (
            'Se ti riveli resti in vita: chi aveva il ritratto è già un fantasma.'
          )}
        </p>
      )}
    </Schermo>
  )
}

/* ─────────────────────────────  Il voto segreto  ───────────────────────────── */

/** Il ballottaggio: chi linciare fra gli indiziati. Il voto non lo vede nessuno, si vede il conteggio. */
export function VotoSegreto({
  vista,
  bersagli,
  astensione,
  onVoto,
}: {
  vista: VistaGiocatore
  bersagli: string[]
  astensione: boolean
  onVoto: (bersaglio: string | null) => void
}) {
  const [scelto, setScelto] = useState<string | null>(null)
  return (
    <Schermo
      piede={
        <>
          <Button
            variant="destructive"
            size="lg"
            fullWidth
            disabled={!scelto}
            onClick={() => scelto && onVoto(scelto)}
          >
            {scelto ? `Lincia ${nomeDi(vista.giocatori, scelto)}` : 'Tocca un indiziato'}
          </Button>
          {astensione && (
            <Button variant="plain" size="lg" fullWidth onClick={() => onVoto(null)}>
              Mi astengo
            </Button>
          )}
        </>
      }
    >
      <header className="lupus-testa-notte lupus-testa-notte--giorno">
        <span className="lupus-testa-notte__icona" aria-hidden="true">
          <IconaLupus nome="teschio" size={30} />
        </span>
        <div className="lupus-testa-notte__testo">
          <p className="lupus-occhiello">Giorno {vista.giorno} · Ballottaggio</p>
          <h2 className="lupus-testa-notte__titolo">Chi linciate?</h2>
          <p className="lupus-testa-notte__sotto">Il tuo voto è segreto: si vede solo il conteggio.</p>
        </div>
      </header>
      <SceltaGiocatore giocatori={vista.giocatori} bersagli={bersagli} valore={scelto} onScegli={setScelto} />
    </Schermo>
  )
}
