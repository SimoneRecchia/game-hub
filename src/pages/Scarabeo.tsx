import { useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Numero, Vuoto, useFesta } from '@/components/Elementi'
import { IconComputer, IconInfo, IconList, IconPeople, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { IconaScheda } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { Campo, ElencoMosse, Tabellino } from '@/games/scarabeo/Campo'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import { MOSSA_DEL_COMPUTER_DA_ADESIVO, adesivoFineScarabeo, adesivoMossa } from '@/games/scarabeo/adesivi'
import { useScarabeo } from '@/games/scarabeo/useScarabeo'
import { PannelloCompagnia } from '@/games/compagnia/PannelloCompagnia'
import { etichettaScarabeo } from '@/games/compagnia/etichette'
import { Suggerimenti } from '@/games/compagnia/Suggerimenti'
import { useCompagniaHost } from '@/games/compagnia/useCompagniaHost'
import { useCountdown } from '@/games/wordle/useCountdown'
import { usePlayer } from '@/lib/auth'
import { formatCountdown } from '@/lib/format'
import { TETTI } from '@shared/punti'
import type { ScarabeoState } from '@shared/types'
import './Scarabeo.css'

/**
 * Lo Scarabeo classificato: le mosse di oggi, a turni contro il computer del
 * giorno — cinque a testa, con le tessere nuove a ogni turno e gemelle delle sue.
 *
 * Le tessere e l'avversario sono gli stessi per tutti, e il computer normale
 * ha gia' giocato la stessa partita al posto di chi gioca: il suo punteggio e' il
 * traguardo, e pareggiarlo vale il tetto dello Scarabeo in classifica. Le sue
 * mosse si vedono solo a giornata chiusa: sarebbero la soluzione. Le giornate
 * di prima dei turni si giocavano da sole, e il traguardo stava a destra.
 */
export default function Scarabeo() {
  const g = useScarabeo()
  const [aiuto, setAiuto] = useState(false)
  const [storia, setStoria] = useState(false)
  const [delComputer, setDelComputer] = useState(false)
  const [compagniaAperta, setCompagniaAperta] = useState(false)
  const { vai } = useNavigazione()

  const stato = g.stato
  const finita = stato?.status === 'done'
  // A turni a destra c'e' l'avversario; nelle giornate di prima, il traguardo.
  const aTurni = stato?.controComputer ?? false
  const altro = stato ? (aTurni ? (stato.avversario ?? 0) : stato.computer.punti) : 0
  const vinta = !!stato && stato.punti > 0 && (aTurni ? stato.punti > altro : stato.punti >= altro)
  // In compagnia si gioca la classificata finché non e' chiusa, e solo se e' la propria.
  const inCompagnia = stato?.inCompagnia ?? null
  const ospitante = !!stato && !finita && !inCompagnia
  const compagnia = useCompagniaHost('scarabeo', 'classificata', ospitante, compagniaAperta)
  const dentro = compagnia.compagnia?.ospiti.filter((o) => o.stato === 'dentro').length ?? 0
  // Chi gioca la giornata in compagnia non muove: la partita e' quella dell'host.
  useEffect(() => {
    if (inCompagnia) vai(ROTTE.insiemeA('scarabeo', inCompagnia.id), { replace: true, direzione: 'nessuna' })
  }, [inCompagnia, vai])
  // Battere il computer e' la vittoria della classificata: la festa e' per quella.
  const festa = useFesta(stato ? !finita : null, finita && vinta)
  const io = usePlayer()

  // La mossa appena giocata al centro dello schermo — le mie, e quelle del computer che fanno male — e
  // poi, se era l'ultima, come e' finita.
  const { adesivo, accoda } = useCodaAdesivi()
  const mossa = g.ultimaMossa
  useEffect(() => {
    if (!mossa) return
    if (mossa.mia || mossa.scarabeo || mossa.punti >= MOSSA_DEL_COMPUTER_DA_ADESIVO) accoda(adesivoMossa(mossa))
  }, [accoda, mossa])
  const eraInCorso = useRef<boolean | null>(null)
  useEffect(() => {
    if (!stato) return
    if (eraInCorso.current === true && finita && stato.punti > 0) {
      accoda(adesivoFineScarabeo(0, vinta, stato.punti, altro))
    }
    eraInCorso.current = !finita
  }, [accoda, altro, finita, stato, vinta])

  return (
    <Pagina
      titolo={stato ? `Scarabeo #${stato.puzzleNumber}` : 'Scarabeo'}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}
      azioni={
        <>
          {ospitante && (
            <BottoneBarra etichetta="Gioca in compagnia" onClick={() => setCompagniaAperta(true)} badge={dentro}>
              <IconPeople size={21} />
            </BottoneBarra>
          )}
          <BottoneBarra etichetta="Le tue mosse" onClick={() => setStoria(true)}>
            <IconList size={20} />
          </BottoneBarra>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      {g.loadError ? (
        <Vuoto
          titolo="Il tabellone non si è aperto"
          testo={g.loadError}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : !stato ? (
        <div className="scr__attesa" aria-hidden="true" />
      ) : (
        <Campo
          c={g}
          sconosciute={g.sconosciute}
          bloccato={finita || g.inviando}
          attesa={g.pensa ? 'Il computer pensa…' : null}
          restanti={stato.restanti}
          cambiabili={!stato.gemelli}
          evidenziate={g.ultimaDelComputer}
          testa={
            <>
              <Tabellino
                iconaIo={<Avatar nickname={io.nickname} color={io.avatarColor} size={20} />}
                iconaAltro={
                  <IconaScheda>
                    <IconComputer size={12} />
                  </IconaScheda>
                }
                avviso={g.messaggio}
                posa={g.anteprima}
                sconosciute={g.sconosciute}
                io={stato.punti}
                altro={altro}
                nomeAltro="Computer"
                notaAltro={aTurni ? undefined : 'stesse tessere'}
                turno={aTurni && !finita ? (g.pensa ? 'altro' : 'io') : undefined}
                sotto={
                  finita
                    ? 'Giornata chiusa'
                    : `Mossa ${Math.min(stato.mosseUsate + 1, stato.mosseTotali)} di ${stato.mosseTotali} · ` +
                      (aTurni ? `traguardo ${stato.computer.punti}` : `${stato.restanti} nel sacchetto`)
                }
                avanzamento={stato.computer.punti > 0 ? stato.punti / stato.computer.punti : 0}
                onApri={() => setStoria(true)}
              />
              {/* Le pose suggerite da chi gioca in compagnia: toccarne una la mette sul tabellone,
                  e giocarla resta all'host. */}
              {ospitante && (
                <Suggerimenti
                  suggerimenti={compagnia.compagnia?.suggerimenti ?? []}
                  etichetta={etichettaScarabeo}
                  onScegli={(s) => {
                    if (s.proposta.gioco === 'scarabeo' && !g.proponi(s.proposta.posa)) {
                      g.avvisa('Quelle tessere non sono più sul leggio.')
                    }
                  }}
                  disabled={g.inviando}
                />
              )}
            </>
          }
          fine={finita ? <Chiusa stato={stato} onMosseComputer={() => setDelComputer(true)} /> : undefined}
          onGioca={g.gioca}
          onPassa={g.passa}
          onCambia={g.cambia}
        />
      )}

      <ComeSiGiocaScarabeo open={aiuto} onClose={() => setAiuto(false)} />

      <PannelloCompagnia
        gioco="scarabeo"
        modalita="classificata"
        open={compagniaAperta}
        onClose={() => setCompagniaAperta(false)}
        compagnia={compagnia.compagnia}
        giocatori={compagnia.giocatori}
        occupato={compagnia.occupato}
        errore={compagnia.errore}
        onInvita={compagnia.invita}
        onRitira={compagnia.ritira}
        onCaricaGiocatori={compagnia.caricaGiocatori}
      />

      <Sheet open={storia} onClose={() => setStoria(false)} title={aTurni ? 'Le mosse' : 'Le tue mosse'}>
        {stato && (
          <ElencoMosse
            mosse={aTurni ? stato.mosse.map((m) => ({ ...m, autore: m.mia ? 'Tu' : 'Computer' })) : stato.mosse}
            totale={stato.mosse.length > 0 && !aTurni ? stato.punti : undefined}
            vuoto="Nessuna mossa, per ora."
          />
        )}

        {/*
          Chiudere prima dell'ultima mossa: sta qui e non fra i comandi perché
          e' una decisione che si prende una volta, guardando quel che si e'
          fatto — mentre un bottone accanto a "Passa" si preme per sbaglio.
        */}
        {stato && !finita && stato.mosseUsate > 0 && (
          <div className="scr-storia__chiudi">
            <p className="scr-storia__chiudi-nota">
              {stato.mosseTotali - stato.mosseUsate === 1
                ? 'Ti resta una mossa.'
                : `Ti restano ${stato.mosseTotali - stato.mosseUsate} mosse.`}{' '}
              Se chiudi, il punteggio diventa definitivo.
            </p>
            <Button
              variant="tinted"
              onClick={() => {
                setStoria(false)
                g.chiudiGiornata()
              }}
              disabled={g.inviando}
            >
              Chiudi la giornata
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={delComputer}
        onClose={() => setDelComputer(false)}
        title={aTurni ? 'Il traguardo' : 'Le mosse del computer'}
      >
        <p className="scr-storia__lede">
          {aTurni ? 'Il computer al tuo posto, contro lo stesso avversario.' : 'Con le tue stesse tessere.'}
        </p>
        {stato?.computer.mosse && (
          <ElencoMosse mosse={stato.computer.mosse} totale={stato.computer.punti} vuoto="Il computer non ha mosso." />
        )}
      </Sheet>

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Giornata chiusa: com'e' andata contro il computer, i punti in classifica, e cosa fare adesso. */
function Chiusa({ stato, onMosseComputer }: { stato: ScarabeoState; onMosseComputer: () => void }) {
  const { vai } = useNavigazione()
  const restano = useCountdown(stato.msToNextPuzzle)
  const aTurni = stato.controComputer
  const altro = aTurni ? (stato.avversario ?? 0) : stato.computer.punti
  const scarto = stato.punti - altro
  const titolo =
    scarto > 0 ? 'Hai battuto il computer' : scarto === 0 ? 'Pari con il computer' : 'Il computer ha fatto di più'

  return (
    <div className="scr-fine">
      <p className="scr-fine__titolo">{titolo}</p>
      <p className="scr-fine__punti">
        <Numero valore={stato.puntiClassifica} />
        <span className="scr-fine__su"> / {TETTI.scarabeo}</span>
      </p>
      <p className="scr-fine__nota">
        punti in classifica · {stato.punti} contro {altro}
        {aTurni && ` · traguardo ${stato.computer.punti}`}
      </p>
      <div className="scr-fine__azioni">
        <Button variant="tinted" onClick={onMosseComputer}>
          <IconComputer size={18} /> {aTurni ? 'Il traguardo' : 'Le sue mosse'}
        </Button>
        <Button variant="tinted" onClick={() => vai(ROTTE.classifica('scarabeo'))}>
          <IconTrophy size={18} /> Classifica
        </Button>
      </div>
      <Button variant="plain" onClick={() => vai(ROTTE.libera('scarabeo'))}>
        Gioca una partita libera
      </Button>
      <p className="scr-fine__attesa">
        Tessere nuove fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
    </div>
  )
}
