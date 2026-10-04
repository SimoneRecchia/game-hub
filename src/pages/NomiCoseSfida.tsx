import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi, type DatiAdesivo } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconMatita, IconRefresh, IconTimbro } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Pillola } from '@/components/Scheda'
import { adesivoFine, adesivoStop, adesivoTempo } from '@/games/nomi/adesivi'
import { ComeSiGiocaNomi } from '@/games/nomi/ComeSiGioca'
import { Altro, CartaScritta, FoglioInGioco } from '@/games/nomi/Foglio'
import { righeAlTavolo } from '@/games/nomi/racconto'
import { Partenza, RulloLettera, VoloLettera, type Tondo } from '@/games/nomi/Rullo'
import { movimentoRidotto, tempiCorrezione } from '@/games/nomi/scena'
import { useSfidaNomi, type SfidaNomi } from '@/games/nomi/sfida/useSfidaNomi'
import { useCorrezione, useDopo, useLetteraInVolo, useTimbro } from '@/games/nomi/useScena'
import { useRestante } from '@/games/tavolo/TempoMossa'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import type { VistaSfidaNomi } from '@shared/types'
import '@/games/nomi/NomiCose.css'

/**
 * Una sfida a Nomi, cose e città con un amico: la stessa lettera e le stesse
 * categorie per tutti e due, dal via. Il tre-due-uno conta nella finestra del
 * rullo, che al via gira e si ferma sulla lettera. Chi finisce per primo dice
 * stop, e il timbro si abbatte sui due fogli; poi i fogli si correggono, e i
 * punti si contano come al tavolo.
 */
export default function NomiCoseSfida() {
  const { id = '' } = useParams()
  // La rivincita e' un'altra sfida: si riparte da capo, con lo stato nuovo.
  return <Sfida key={id} id={id} />
}

function Sfida({ id }: { id: string }) {
  const g = useSfidaNomi(id)
  const v = g.vista
  const [regole, setRegole] = useState(false)
  const { adesivo, accoda } = useCodaAdesivi()
  const timbro = useTimbro(accoda)
  const dopo = useDopo()
  const nome = v?.avversario?.displayName ?? 'L’altro'

  // La partenza: il rullo si ferma sulla lettera, e la lettera vola sul foglio.
  const [vistoVia, setVistoVia] = useState(false)
  useEffect(() => {
    if (g.via !== null) setVistoVia(true)
  }, [g.via])
  const volo = useLetteraInVolo(v?.lettera ?? null)
  const inPartenza = v?.stato === 'in_corso' && (g.via !== null || !v.lettera || (vistoVia && !volo.arrivata))

  // Lo stop: il timbro, per chi lo dice e per chi lo riceve; e lo stesso, arancione, per il tempo finito.
  // Uno solo per partita: il mio stop e il tempo che finisce possono arrivare insieme.
  const timbrato = useRef(false)
  const { timbra } = timbro
  const timbraUnaVolta = useCallback(
    (dati: Omit<DatiAdesivo, 'id'>) => {
      if (timbrato.current) return false
      timbrato.current = true
      timbra(dati)
      return true
    },
    [timbra],
  )
  const dicoStop = () => {
    timbraUnaVolta(adesivoStop(null))
    g.stop()
  }
  const tempoFinito = () => {
    timbraUnaVolta(adesivoTempo())
    g.tempoFinito()
  }
  useEffect(() => {
    if (v?.stato !== 'in_corso' || !v.stop || v.stop.di === 'io') return
    if (v.stop.di === 'tempo') timbraUnaVolta(adesivoTempo())
    else if (timbraUnaVolta(adesivoStop(nome))) haptic('error')
  }, [nome, timbraUnaVolta, v])

  // La fine vista arrivare: il foglio si corregge, quando il timbro se n'e' andato, e poi com'e' andata.
  // Una sfida riaperta gia' finita no.
  const [giocataQui, setGiocataQui] = useState(false)
  useEffect(() => {
    if (v?.stato === 'in_corso') setGiocataQui(true)
  }, [v?.stato])
  const correzione = useCorrezione(giocataQui && v?.stato === 'finita', timbro.resto)
  const [vinta, setVinta] = useState(false)
  useEffect(() => {
    if (!correzione || !v) return
    const quando = tempiCorrezione(v.categorie?.length ?? 0, correzione.attesa, movimentoRidotto()).fine
    const esito = v.vincitore === 'io' ? 'vinta' : v.vincitore === 'avversario' ? 'persa' : 'patta'
    dopo.programma(quando, () => {
      accoda(adesivoFine(esito, v.mie.totale ?? 0, v.sue?.totale ?? 0, nome))
      setVinta(esito === 'vinta')
    })
    // Una volta, quando il foglio corretto compare: la correzione non cambia piu'.
  }, [correzione])
  const festa = useFesta(v ? v.stato === 'in_corso' : null, vinta)

  return (
    <Pagina
      titolo="Nomi, cose e città"
      intera
      indietro={{ a: ROTTE.libera('nomi'), etichetta: 'Libere' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {!v ? (
        g.errore ? (
          <Vuoto titolo="La sfida non si è aperta" testo={g.errore} />
        ) : (
          <div className="nomi-attesa" aria-hidden="true" />
        )
      ) : v.stato === 'rifiutata' || v.stato === 'annullata' ? (
        <Vuoto titolo="La sfida non c’è più" testo="L’invito è stato ritirato o rifiutato." />
      ) : v.stato === 'invito' ? (
        <Vuoto
          icona={
            v.avversario ? (
              <Avatar nickname={v.avversario.nickname} color={v.avversario.avatarColor} size={56} />
            ) : undefined
          }
          titolo="Aspetto che accetti"
          testo="La sfida comincia quando arriva."
        />
      ) : inPartenza ? (
        <Via g={g} v={v} onArrivata={volo.atterra} />
      ) : v.stato === 'in_corso' && v.lettera && v.categorie ? (
        <FoglioInGioco
          lettera={v.lettera}
          categorie={v.categorie}
          risposte={g.risposte}
          onScrivi={g.scrivi}
          scadenza={g.scrivibile ? g.scadenza : null}
          totaleMs={v.tempoTotaleMs}
          onScaduto={tempoFinito}
          entrata={vistoVia}
          nascondiLettera={volo.volo !== null}
          fermo={
            g.scrivibile
              ? null
              : v.stop?.di === 'io'
                ? 'Hai detto stop'
                : v.stop?.di === 'avversario'
                  ? `Stop! ${nome} ha finito`
                  : 'Tempo finito'
          }
          altro={
            v.avversario && (
              <Altro
                chi={<Avatar nickname={v.avversario.nickname} color={v.avversario.avatarColor} size={20} />}
                nome={v.avversario.displayName}
                scritte={v.scritteAvversario}
                totale={v.categorie.length}
                fermo={!g.scrivibile}
              />
            )
          }
          azione={
            g.scrivibile ? (
              <Button size="lg" fullWidth onClick={dicoStop} disabled={g.occupato}>
                <IconTimbro size={20} /> Stop!
              </Button>
            ) : (
              <p className="nomi-attende">
                <IconMatita size={18} /> Si contano i punti…
              </p>
            )
          }
        />
      ) : v.stato === 'finita' ? (
        <Fine g={g} v={v} correzione={correzione} />
      ) : (
        <div className="nomi-attesa" aria-hidden="true" />
      )}
      <ComeSiGiocaNomi open={regole} onClose={() => setRegole(false)} />
      <VoloLettera volo={volo.volo} onFine={volo.finito} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/**
 * Il tre-due-uno: i secondi saltano fuori nella finestra del rullo, uno al
 * secondo, e al via il rullo gira e si ferma sulla lettera, che si vede insieme
 * all'altro.
 */
function Via({ g, v, onArrivata }: { g: SfidaNomi; v: VistaSfidaNomi; onArrivata: (da: Tondo) => void }) {
  const restante = useRestante(g.via)
  const secondi = restante === null ? 0 : Math.ceil(restante / 1_000)
  const ultimo = useRef(secondi)
  useEffect(() => {
    if (secondi === ultimo.current) return
    ultimo.current = secondi
    if (secondi > 0) suona('tic')
  }, [secondi])
  const gira = g.via === null || secondi === 0
  return (
    <Partenza
      sopra={
        v.avversario && (
          <>
            <Avatar nickname={v.avversario.nickname} color={v.avversario.avatarColor} size={52} />
            <span>Contro {v.avversario.displayName}</span>
          </>
        )
      }
      sotto={gira ? 'Via!' : 'Pronti…'}
    >
      <RulloLettera lettera={v.lettera} gira={gira} faccia={secondi > 0 ? secondi : '?'} onArrivato={onArrivata} />
    </Partenza>
  )
}

/** Com'e' finita: il foglio che si corregge, con le risposte dell'altro sotto le mie, la serie, e la rivincita. */
function Fine({ g, v, correzione }: { g: SfidaNomi; v: VistaSfidaNomi; correzione: { attesa: number } | null }) {
  const categorie = v.categorie ?? []
  const nome = v.avversario?.displayName ?? 'L’altro'
  const righe = righeAlTavolo(
    categorie,
    {
      testi: categorie.map((c) => v.mie.risposte[c]),
      valide: categorie.map((_, i) => Boolean(v.mie.forme?.[i])),
      punti: categorie.map((_, i) => v.mie.punti?.[i] ?? 0),
    },
    {
      nome,
      testi: categorie.map((c) => v.sue?.risposte[c]),
      valide: categorie.map((_, i) => Boolean(v.sue?.forme?.[i])),
      punti: categorie.map((_, i) => v.sue?.punti?.[i] ?? 0),
    },
  )
  const esito = v.vincitore === 'io' ? 'Hai vinto' : v.vincitore === 'avversario' ? 'Hai perso' : 'Pari'
  const chiesta = v.rivincita
  return (
    <div className="nomi-pagina">
      <CartaScritta
        titolo={`Con la ${v.lettera?.toUpperCase() ?? ''}`}
        lettera={v.lettera}
        destra={
          <Pillola tono={v.vincitore === 'io' ? 'buona' : v.vincitore === 'avversario' ? 'cattiva' : 'neutra'}>
            {esito} {v.mie.totale ?? 0} a {v.sue?.totale ?? 0}
          </Pillola>
        }
        righe={righe}
        totale={{ etichetta: 'Totale', nota: `${nome} ${v.sue?.totale ?? 0}`, valore: v.mie.totale ?? 0 }}
        conPunti
        correzione={correzione}
      >
        {v.serie.partite > 1 && (
          <p className="nomi-ieri__conto u-tabnum">
            La serie: tu {v.serie.mie}, {nome} {v.serie.sue}, su {v.serie.partite}
          </p>
        )}
      </CartaScritta>
      <div className="nomi-libera__azioni">
        {chiesta?.stato === 'invito' && chiesta.mia ? (
          <p className="nomi-conti">Aspetto la risposta di {nome}…</p>
        ) : (
          <Button size="lg" onClick={g.rivincita} disabled={g.occupato || !v.online}>
            <IconRefresh size={18} /> {chiesta?.stato === 'invito' ? `${nome} vuole la rivincita` : 'Gioca ancora'}
          </Button>
        )}
      </div>
      {!v.online && !chiesta && <p className="nomi-conti">{nome} non è più online.</p>}
      {g.errore && <p className="nomi-guasto">{g.errore}</p>}
    </div>
  )
}
