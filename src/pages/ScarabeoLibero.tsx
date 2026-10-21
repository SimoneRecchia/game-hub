import { useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Difficolta, useLivelloScelto } from '@/components/Difficolta'
import { Coriandoli, Vuoto, useFesta } from '@/components/Elementi'
import { SegmentedControl } from '@/components/SegmentedControl'
import { IconComputer, IconInfo, IconPeople, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { Campo, ElencoMosse, Tabellino } from '@/games/scarabeo/Campo'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import { FineScarabeo } from '@/games/scarabeo/Fine'
import {
  ADESIVO_FINE_SCARABEO_MS,
  ADESIVO_MOSSA_MS,
  MOSSA_DEL_COMPUTER_DA_ADESIVO,
  adesivoFineScarabeo,
  adesivoMossa,
} from '@/games/scarabeo/adesivi'
import { InvitaAmico, PartitaAperta, useSalaTavolo } from '@/games/tavolo/SalaAmico'
import { SceltaTempo, useTempoMossa } from '@/games/tavolo/Tempo'
import { useScarabeoLibero, type ScarabeoLiberoController } from '@/games/scarabeo/useScarabeoLibero'
import { PannelloCompagnia } from '@/games/compagnia/PannelloCompagnia'
import { Suggerimenti } from '@/games/compagnia/Suggerimenti'
import { etichettaScarabeo } from '@/games/compagnia/etichette'
import { useCompagniaHost } from '@/games/compagnia/useCompagniaHost'
import { LIVELLI, type Livello, type StatoLibera } from '@shared/scarabeo-computer'
import './Scarabeo.css'

const NOMI: Record<Livello, string> = { facile: 'Facile', normale: 'Normale', difficile: 'Difficile' }

type Contro = 'computer' | 'amico'
/** Contro chi, ricordato come nelle sale dei tavolieri; il profilo di un amico lo scrive per aprire dalla sua parte. */
const CHIAVE_CONTRO = 'giochi.scarabeo.contro'

function leggiContro(): Contro {
  try {
    return localStorage.getItem(CHIAVE_CONTRO) === 'amico' ? 'amico' : 'computer'
  } catch {
    return 'computer'
  }
}

/**
 * Lo Scarabeo libero: una partita intera a turni, contro il computer o contro
 * un amico, come le sale dei tavolieri — un interruttore in cima, ricordato.
 *
 * Contro il computer tutto sta nel browser — il computer gira in un Web Worker
 * con il dizionario intero, la partita si salva come mosse a ogni turno — e al
 * server va solo il risultato, per le statistiche. Con un amico si gioca sul
 * tavolo del server (ScarabeoAmico). Non conta per la classifica: il sacchetto
 * e' nuovo ogni volta, e due partite non si possono confrontare.
 */
export default function ScarabeoLibero() {
  const g = useScarabeoLibero()
  const [aiuto, setAiuto] = useState(false)
  const [storia, setStoria] = useState(false)
  const [risultato, setRisultato] = useState(false)
  const [abbandono, setAbbandono] = useState(false)
  const [compagniaAperta, setCompagniaAperta] = useState(false)
  const stato = g.stato
  const finita = stato?.finita ?? false
  // La partita sta nel telefono: chi guarda la riceve a ogni mossa, e niente quando si abbandona.
  const compagnia = useCompagniaHost('scarabeo', 'libera', true, compagniaAperta, { stato: g.partita })
  const dentro = compagnia.compagnia?.ospiti.filter((o) => o.stato === 'dentro').length ?? 0
  const festa = useFesta(stato ? !stato.finita : null, risultato && finita && stato?.esito === 'vinta')

  const { adesivo, accoda } = useCodaAdesivi()

  // Le mosse al centro: tutte le mie, e quelle del computer che fanno male.
  const mossa = g.ultimaMossa
  useEffect(() => {
    if (!mossa) return
    if (mossa.mia || mossa.scarabeo || mossa.punti >= MOSSA_DEL_COMPUTER_DA_ADESIVO) accoda(adesivoMossa(mossa))
  }, [accoda, mossa])

  // A partita finita: l'adesivo della fine, e dopo il risultato, una volta. Una
  // partita riaperta gia' finita va dritta al risultato. La dipendenza e' lo
  // stato a tre valori e non `finita`: con `finita` l'effetto non ripartiva
  // quando la partita compariva, non vedeva mai "in corso", e la fine arrivava
  // senza adesivo.
  const inCorso = stato ? !stato.finita : null
  const eraInCorso = useRef<boolean | null>(null)
  const statoRef = useRef(stato)
  statoRef.current = stato
  useEffect(() => {
    const s = statoRef.current
    if (inCorso === null || !s) return
    if (inCorso) {
      eraInCorso.current = true
      return
    }
    if (eraInCorso.current !== true) {
      setRisultato(true)
      return
    }
    eraInCorso.current = false
    accoda(adesivoFineScarabeo(0, s.esito === 'vinta', s.mieiPunti, s.puntiComputer))
    const t = window.setTimeout(() => setRisultato(true), ADESIVO_FINE_SCARABEO_MS + ADESIVO_MOSSA_MS)
    return () => window.clearTimeout(t)
  }, [accoda, inCorso])

  if (!g.partita || !stato) {
    return (
      <Pagina
        key="scelta"
        titolo="Scarabeo"
        gioco="scarabeo"
        indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
        azioni={
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        }
      >
        <SceltaPartita g={g} />
        <ComeSiGiocaScarabeo open={aiuto} onClose={() => setAiuto(false)} />
      </Pagina>
    )
  }

  const livello = g.partita.livello
  const turno = stato.turno === 'io' ? 'io' : stato.turno === 'computer' ? 'altro' : null

  return (
    <Pagina
      key="partita"
      titolo="Scarabeo"
      sotto={`Contro il computer · ${NOMI[livello]}`}
      intera
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={
        <>
          <BottoneBarra etichetta="Gioca in compagnia" onClick={() => setCompagniaAperta(true)} badge={dentro}>
            <IconPeople size={21} />
          </BottoneBarra>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      {g.guasto ? (
        <Vuoto
          icona={<IconComputer size={28} />}
          titolo="Il computer non può giocare"
          testo={g.guasto}
          azione={
            <Button variant="tinted" onClick={() => window.location.reload()}>
              Riprova
            </Button>
          }
        />
      ) : (
        <Campo
          c={g}
          sconosciute={g.sconosciute}
          bloccato={finita || stato.turno !== 'io' || g.pensa}
          attesa={g.pensa ? 'Pensa…' : null}
          restanti={stato.restanti}
          evidenziate={g.ultimaDelComputer}
          ultime={{
            voci: stato.giocate.map((m) => ({ ...m, autore: m.mia ? 'Tu' : 'Computer' })),
            aiuto:
              'Tocca una casella, poi le tessere: la freccia dice da che parte si scrive. Si gioca fino in fondo al sacchetto.',
            onApri: () => setStoria(true),
          }}
          testa={
            <>
              <Tabellino
                avviso={g.messaggio}
                attesa={g.pensa ? 'Il computer pensa' : null}
                posa={g.anteprima}
                sconosciute={g.sconosciute}
                io={stato.mieiPunti}
                altro={stato.puntiComputer}
                nomeAltro="Computer"
                notaAltro={NOMI[livello].toLowerCase()}
                turno={turno}
                stato={finita ? 'Partita finita' : `Sacchetto ${stato.restanti}`}
                sotto={
                  finita
                    ? `${stato.mieiPunti} a ${stato.puntiComputer}`
                    : stato.giocate.length === 0
                      ? 'La prima parola passa dalla stella'
                      : turno === 'io'
                        ? 'Tocca a te'
                        : 'Tocca al computer'
                }
                onApri={() => setStoria(true)}
                onRisultato={finita ? () => setRisultato(true) : undefined}
              />
              {/* Le pose suggerite da chi guarda: toccarne una la mette sul tabellone, e giocarla resta a te. */}
              {!finita && stato.turno === 'io' && (
                <Suggerimenti
                  suggerimenti={compagnia.compagnia?.suggerimenti ?? []}
                  etichetta={etichettaScarabeo}
                  onScegli={(s) => {
                    if (s.proposta.gioco === 'scarabeo' && !g.proponi(s.proposta.posa)) {
                      g.avvisa('Quelle tessere non sono più sul leggio.')
                    }
                  }}
                  disabled={g.pensa}
                />
              )}
            </>
          }
          fine={finita ? <FineLibera g={g} onRisultato={() => setRisultato(true)} /> : undefined}
          onGioca={g.gioca}
          onPassa={g.passa}
          onCambia={g.cambia}
        />
      )}

      <ComeSiGiocaScarabeo open={aiuto} onClose={() => setAiuto(false)} />

      <Sheet open={storia} onClose={() => setStoria(false)} title="Le mosse">
        <ElencoMosse
          mosse={stato.giocate.map((m) => ({ ...m, autore: m.mia ? 'Tu' : 'Computer' }))}
          vuoto="Nessuna mossa, per ora."
        />
        {/* Abbandonare sta qui, come chiudere la giornata nella classificata: si decide guardando le mosse. */}
        {!finita && (
          <div className="scr-storia__chiudi">
            <Button
              variant="tinted"
              onClick={() => {
                setStoria(false)
                setAbbandono(true)
              }}
            >
              Abbandona la partita
            </Button>
          </div>
        )}
      </Sheet>

      <PannelloCompagnia
        gioco="scarabeo"
        modalita="libera"
        open={compagniaAperta}
        onClose={() => setCompagniaAperta(false)}
        compagnia={compagnia.compagnia}
        giocatori={compagnia.giocatori}
        occupato={compagnia.occupato}
        errore={compagnia.errore}
        onInvita={compagnia.invita}
        onRitira={compagnia.ritira}
        onCaricaGiocatori={compagnia.caricaGiocatori}
        onChiudi={compagnia.chiudi}
      />

      <Sheet open={abbandono} onClose={() => setAbbandono(false)} title="Abbandonare la partita?">
        <p className="scr-storia__lede">Non conterà nelle statistiche.</p>
        <Button
          size="lg"
          fullWidth
          variant="destructive"
          onClick={() => {
            setAbbandono(false)
            g.abbandona()
          }}
        >
          Abbandona
        </Button>
        <Button size="lg" fullWidth variant="plain" onClick={() => setAbbandono(false)}>
          Continua a giocare
        </Button>
      </Sheet>

      <FineScarabeo
        aperta={risultato && finita}
        onChiudi={() => setRisultato(false)}
        titolo={titoloEsito(stato.esito)}
        testo={
          <>
            {stato.mieiPunti} a {stato.puntiComputer}
            {notaDellaFine(stato) && <> · {notaDellaFine(stato)}</>}
          </>
        }
        righe={[
          { nome: 'I tuoi punti', valore: stato.mieiPunti },
          { nome: 'Il computer', valore: stato.puntiComputer },
          ...(stato.fine === 'chiusa' || stato.fine === 'ferma'
            ? [
                {
                  nome: 'Tessere rimaste',
                  valore: `${conSegno(stato.aggiustamento.mio)} · ${conSegno(stato.aggiustamento.computer)}`,
                },
              ]
            : []),
        ]}
      >
        <button
          type="button"
          className="scr-tasto"
          onClick={() => {
            setRisultato(false)
            g.abbandona()
          }}
        >
          Esci
        </button>
        <button
          type="button"
          className="scr-tasto scr-tasto--giallo"
          onClick={() => {
            setRisultato(false)
            g.nuova(livello)
          }}
        >
          Gioca ancora
        </button>
      </FineScarabeo>

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Come e' finita, con il conto delle tessere rimaste: chi chiude le prende, chi resta con le sue le perde. */
function notaDellaFine(stato: StatoLibera): string | null {
  const { mio, computer } = stato.aggiustamento
  if (stato.fine === 'chiusa') {
    return mio > 0
      ? `Hai posato l’ultima tessera: +${mio} dalle tessere del computer.`
      : `Il computer ha posato l’ultima tessera: −${computer} per le tue tessere.`
  }
  if (stato.fine === 'ferma') {
    return `Sei turni senza parole: ognuno perde le sue tessere (tu ${mio}, il computer ${computer}).`
  }
  return null
}

/** Un aggiustamento con il suo segno: +12, −8, 0. */
function conSegno(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

function titoloEsito(esito: 'vinta' | 'persa' | 'pari' | null): string {
  if (esito === 'vinta') return 'Hai vinto!'
  if (esito === 'persa') return 'Ha vinto il computer'
  return 'Pari'
}

/**
 * Prima di cominciare: contro il computer o un amico. Le partite aperte con un
 * amico stanno in cima, e un invito che aspetta risposta si vede anche se
 * l'ultima volta si era scelto il computer.
 */
function SceltaPartita({ g }: { g: ScarabeoLiberoController }) {
  const [contro, setContro] = useState<Contro>(leggiContro)
  // Il tempo per mossa vale con un amico: contro il computer lo Scarabeo si pensa quanto si vuole.
  const [tempo, setTempo] = useTempoMossa('scarabeo')
  const sala = useSalaTavolo('scarabeo', null, tempo)
  const scegli = (c: Contro) => {
    setContro(c)
    try {
      localStorage.setItem(CHIAVE_CONTRO, c)
    } catch {
      /* senza localStorage la scelta non si ricorda */
    }
  }
  const vista: Contro = sala.inAttesa ? 'amico' : contro
  return (
    <>
      {sala.dati?.partite.map((p) => <PartitaAperta key={p.id} partita={p} />)}
      {sala.altrove && <PartitaAperta partita={sala.altrove} />}
      <div className="tav-sala__scelte">
        <SegmentedControl
          ariaLabel="Contro chi"
          value={vista}
          onChange={scegli}
          options={[
            { value: 'computer', label: 'Computer' },
            { value: 'amico', label: 'Amico' },
          ]}
        />
      </div>
      {vista === 'computer' ? (
        <SceltaLivello g={g} />
      ) : (
        <>
          <SceltaTempo gioco="scarabeo" valore={tempo} onChange={setTempo} />
          <InvitaAmico sala={sala} />
        </>
      )}
    </>
  )
}

/**
 * Contro il computer: tre livelli, con quel che uno ne ha già fatto. E' lo
 * stesso elenco della battaglia navale libera: stesse tacche, stesso conto.
 */
function SceltaLivello({ g }: { g: ScarabeoLiberoController }) {
  const [livello, scegli] = useLivelloScelto('scarabeo', LIVELLI)
  return (
    <Difficolta
      livelli={LIVELLI.map((id) => {
        const conti = g.statistiche?.perLivello[id]
        const valore = conti && conti.giocate > 0 ? `${conti.vinte}/${conti.giocate}` : undefined
        return { id, nome: NOMI[id], valore }
      })}
      scelto={livello}
      onScegli={scegli}
      onComincia={() => g.nuova(livello)}
      colore="var(--scarabeo-1)"
    >
      {g.guasto && <p className="livelli__guasto">{g.guasto}</p>}
    </Difficolta>
  )
}

/** Sotto il tabellone, a partita finita. */
function FineLibera({ g, onRisultato }: { g: ScarabeoLiberoController; onRisultato: () => void }) {
  const stato = g.stato!
  const livello = g.partita!.livello
  const conti = g.statistiche?.perLivello[livello]
  return (
    <div className="scr-fine">
      <p className="scr-fine__titolo">{titoloEsito(stato.esito)}</p>
      <p className="scr-fine__nota">
        {stato.mieiPunti} contro {stato.puntiComputer}
        {conti && conti.giocate > 0 && ` · al livello ${NOMI[livello].toLowerCase()} ne hai vinte ${conti.vinte} su ${conti.giocate}`}
      </p>
      <div className="scr-fine__azioni">
        <Button variant="tinted" onClick={onRisultato}>
          Risultato
        </Button>
        <Button onClick={() => g.nuova(g.partita!.livello)}>
          <IconRefresh size={18} /> Un’altra
        </Button>
      </div>
    </div>
  )
}
