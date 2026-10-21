import { useEffect, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Difficolta, useLivelloScelto } from '@/components/Difficolta'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { BottoneFine, CartaFine } from '@/games/cruciverba/CartaFine'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { SalaSfida, type GiocoSfida } from '@/games/amici/SalaSfida'
import { ComeSiGiocaSequenze } from '@/games/sequenze/ComeSiGioca'
import { leggiContiSequenze } from '@/games/sequenze/conti'
import { MessaggioProva, Pallini, Tavola } from '@/games/sequenze/Tavola'
import { useProva } from '@/games/sequenze/useProva'
import { NOMI_LIVELLI_SEQUENZE, useSequenzeLibere } from '@/games/sequenze/useSequenzeLibere'
import { LIVELLI_ORDINATI, LIVELLI_SEQUENZE, livelloSequenzeValido, type LivelloSequenze } from '@shared/sequenze'
import '@/games/sequenze/Sequenze.css'
import '@/games/sfide/Sfide.css'

type Con = 'solo' | 'amico'
const CHIAVE_CON = 'giochi.sequenze.contro'

function leggiCon(): Con {
  try {
    return localStorage.getItem(CHIAVE_CON) === 'amico' ? 'amico' : 'solo'
  } catch {
    return 'solo'
  }
}

export const SFIDA_SEQUENZE: GiocoSfida = {
  api: '/sequenze/sfide',
  sfida: ROTTE.sfidaSequenze,
  invito: ROTTE.invitoSequenze,
  nome: 'Sequenze',
  domanda: 'Una sfida a Sequenze?',
}

/**
 * Le Sequenze libere: da soli, alla difficoltà che si sceglie, finché non si
 * sbaglia; o con un amico, nella sala delle sfide. Nel difficile la sequenza
 * si tocca al contrario.
 */
export default function SequenzeLibera() {
  const g = useSequenzeLibere()
  const [regole, setRegole] = useState(false)
  const [con, setCon] = useState<Con>(leggiCon)
  // Il foglio della sfida, aperto da subito se si arriva dal profilo di un amico (`?sfida=1`).
  const [sfida, setSfida] = useState(() => new URLSearchParams(window.location.search).get('sfida') === '1')
  // Il livello dell'invito: quello scelto l'ultima volta, con cui lo manda anche il profilo di un amico.
  const [livelloSfida, setLivelloSfida] = useState<LivelloSequenze>(() => {
    try {
      return livelloSequenzeValido(localStorage.getItem('difficolta:sequenze'))
    } catch {
      return 'normale'
    }
  })
  const { adesivo, accoda } = useCodaAdesivi()
  const l = g.livello
  const prova = useProva({
    sequenza: g.aperta?.sequenza ?? null,
    chiave: g.aperta?.chiave ?? 0,
    ritmo: LIVELLI_SEQUENZE[l ?? 'normale'].ritmo,
    indietro: l ? LIVELLI_SEQUENZE[l].indietro : false,
    onFine: g.rispondi,
  })
  const festa = useFesta(g.aperta ? true : g.fine ? false : null, g.fine?.record === true)
  // Un record nuovo ha il suo adesivo.
  const fine = g.fine
  useEffect(() => {
    if (!fine?.record) return
    accoda({
      tono: 'vivace',
      titolo: 'Record!',
      sotto: `${fine.arrivata} cubetti`,
      colore: 'linear-gradient(160deg, var(--sequenze-1), var(--sequenze-2))',
      durata: ADESIVO_RECORD_MS,
      suono: 'vittoria',
    })
  }, [accoda, fine])
  const scegliCon = (c: Con) => {
    setCon(c)
    try {
      localStorage.setItem(CHIAVE_CON, c)
    } catch {
      /* senza localStorage la scelta non si ricorda */
    }
  }

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )

  if (!l) {
    return (
      <Pagina key="scelta" titolo="Sequenze" gioco="sequenze" indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
        <div className="seq-scelte">
          <SegmentedControl
            ariaLabel="Con chi"
            value={con}
            onChange={scegliCon}
            options={[
              { value: 'solo', label: 'Da solo' },
              { value: 'amico', label: 'Con un amico' },
            ]}
          />
        </div>
        <SceltaLivello
          amico={con === 'amico'}
          onGioca={(livello) => {
            if (con === 'solo') {
              g.comincia(livello)
              return
            }
            setLivelloSfida(livello)
            setSfida(true)
          }}
        />
        <Sheet open={sfida && con === 'amico'} onClose={() => setSfida(false)} title="Sfida un amico">
          <p className="sfl-foglio__opzioni">{NOMI_LIVELLI_SEQUENZE[livelloSfida]}</p>
          {sfida && <SalaSfida gioco={SFIDA_SEQUENZE} impostazioni={{ livello: livelloSfida }} />}
        </Sheet>
        <ComeSiGiocaSequenze open={regole} onClose={() => setRegole(false)} />
      </Pagina>
    )
  }

  const lunghezza = g.aperta?.sequenza.length ?? null
  const indietro = LIVELLI_SEQUENZE[l].indietro
  return (
    <Pagina key="partita" titolo="Sequenze" sotto="Libera" intera indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
      <div className="seq">
        <section className="seq-conto" aria-label="Come sta andando">
          <span className="seq-voce">
            <span className="seq-etichetta">{NOMI_LIVELLI_SEQUENZE[l]}</span>
            <span key={lunghezza ?? 0} className="seq-numero u-tabnum">
              {lunghezza ?? g.fine?.arrivata ?? '–'}
            </span>
          </span>
          {lunghezza !== null ? (
            <Pallini quanti={lunghezza} toccati={prova.tocchi.length} errore={prova.errore !== null} />
          ) : (
            <span />
          )}
          <span className="seq-voce is-destra">
            <span className="seq-etichetta">Record</span>
            <span className="seq-numero u-tabnum">{record(l)}</span>
          </span>
        </section>
        {/* La tavola e, subito sotto, che cosa fare: stanno insieme in alto, come nell'album. */}
        <div className={`seq-campo is-con-sotto${g.fine ? ' is-fine' : ''}`}>
          <Tavola
            fase={prova.fase}
            acceso={prova.acceso}
            sequenza={g.aperta?.sequenza ?? null}
            errore={prova.errore}
            onTocca={prova.tocca}
          />
          {g.fine ? (
            <div className="seq-piede" aria-live="polite">
              <p className="seq-messaggio">
                {g.fine.arrivata === 0 ? 'Nessuna sequenza' : `Fino a ${g.fine.arrivata} cubetti`}
              </p>
              <div className="seq-azioni">
                <Button size="lg" onClick={() => g.comincia(l)}>
                  <IconRefresh size={18} /> Un’altra
                </Button>
                <Button size="lg" variant="tinted" onClick={g.scegli}>
                  Cambia difficoltà
                </Button>
              </div>
            </div>
          ) : (
            <MessaggioProva prova={prova} indietro={indietro} attesa={lunghezza === null} />
          )}
        </div>
      </div>
      {g.fine && (
        <CartaDelleSequenze
          livello={l}
          arrivata={g.fine.arrivata}
          nuovoRecord={g.fine.record}
          giuste={g.giuste}
          onEsci={g.scegli}
          onAncora={() => g.comincia(l)}
        />
      )}
      <ComeSiGiocaSequenze open={regole} onClose={() => setRegole(false)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** La carta della fine: arriva dopo la sequenza sbagliata, o dopo l'adesivo del record, e si chiude. */
function CartaDelleSequenze({
  livello,
  arrivata,
  nuovoRecord,
  giuste,
  onEsci,
  onAncora,
}: {
  livello: LivelloSequenze
  arrivata: number
  nuovoRecord: boolean
  giuste: number
  onEsci: () => void
  onAncora: () => void
}) {
  const [aperta, setAperta] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setAperta(true), nuovoRecord ? ADESIVO_RECORD_MS : DOPO_LA_FINE_MS)
    return () => window.clearTimeout(t)
  }, [nuovoRecord])
  const indietro = LIVELLI_SEQUENZE[livello].indietro
  return (
    <CartaFine
      aperta={aperta}
      onChiudi={() => setAperta(false)}
      gioco="sequenze"
      colore="var(--sequenze-tinta)"
      fondo="linear-gradient(180deg, #ddfafc, #fff1c9)"
      titolo={nuovoRecord ? 'Nuovo record!' : 'Sbagliata!'}
      testo={
        arrivata === 0
          ? 'Nessuna sequenza ripetuta: riprova'
          : `Hai ripetuto una sequenza di ${arrivata} cubetti${indietro ? ' al contrario' : ''}`
      }
      timbro={
        <>
          {arrivata}
          <small>cubetti</small>
        </>
      }
      righe={[
        { nome: 'Difficoltà', valore: NOMI_LIVELLI_SEQUENZE[livello] },
        { nome: 'Sequenze giuste', valore: giuste },
        { nome: 'Record', valore: `${record(livello)} cubetti` },
      ]}
    >
      <BottoneFine onClick={onEsci}>Esci</BottoneFine>
      <BottoneFine tono="pieno" onClick={onAncora}>
        Gioca ancora
      </BottoneFine>
    </CartaFine>
  )
}

/** Quanto dura l'adesivo del record, prima della carta della fine. */
const ADESIVO_RECORD_MS = 1_800
/** Quanto resta in vista la tavola sbagliata, prima della carta della fine. */
const DOPO_LA_FINE_MS = 700

function record(l: LivelloSequenze): number {
  return leggiContiSequenze().record[l]
}

/**
 * Prima di cominciare: tre livelli, il record di ognuno, e Comincia. Con un
 * amico la stessa scelta apre il foglio della sfida, e l'altro gioca allo
 * stesso livello.
 */
function SceltaLivello({ amico, onGioca }: { amico: boolean; onGioca: (livello: LivelloSequenze) => void }) {
  const [conti] = useState(leggiContiSequenze)
  const [livello, scegli] = useLivelloScelto('sequenze', LIVELLI_ORDINATI)
  return (
    <Difficolta
      livelli={LIVELLI_ORDINATI.map((id) => ({
        id,
        nome: NOMI_LIVELLI_SEQUENZE[id],
        valore: conti.record[id] > 0 ? `record ${conti.record[id]}` : undefined,
      }))}
      scelto={livello}
      onScegli={scegli}
      onComincia={() => onGioca(livello)}
      colore="var(--sequenze-1)"
      etichetta={amico ? 'Sfida un amico' : 'Comincia'}
    />
  )
}
