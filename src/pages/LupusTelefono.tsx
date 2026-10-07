import { useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useAdesivo } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconBook, IconFlag, IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { Alba, Arringhe, Discussione, EsitoDelGiorno, Fine, Nomine } from '@/games/lupus/Giorno'
import { IconaLupus } from '@/games/lupus/Icone'
import {
  EsitoDellaNotte,
  NotteFinta,
  Rivelazione,
  SchermataBenvenuto,
  SchermataNotte,
  Schermo,
  VotoSegreto,
} from '@/games/lupus/Notte'
import { Cronaca } from '@/games/lupus/Pezzi'
import { ComeSiGiocaLupus } from '@/games/lupus/Regole'
import {
  agisci,
  agisciEPassa,
  annunciaLaNotte,
  apri,
  comincia,
  giroInCorso,
  leggiPreparazione,
  passa,
  sceltaDellaNotte,
  tempoPassato,
  type Giro,
  type PerChe,
  type StatoTelefono,
} from '@/games/lupus/telefono'
import { useNotte } from '@/games/lupus/useNotte'
import { useTelefono } from '@/games/lupus/useTelefono'
import { VINCITORI, nomeDi } from '@/games/lupus/testi'
import { suona } from '@/lib/suoni'
import { nominabili } from '@shared/lupus'
import { semeACaso } from '@shared/lupus-caso'
import { vistaDelTavolo, vistaPer } from '@shared/lupus-vista'
import '@/games/lupus/Lupus.css'

/** Perché si passa il telefono, detto a chi lo riceve. */
const PERCHE: Record<PerChe, string> = {
  ruolo: 'per vedere il ruolo',
  notte: 'per la notte',
  notizia: 'per una notizia',
  voto: 'per il voto segreto',
}

/** Il giro e' di notte: i ruoli, la notte, e il Benvenuto ai morti della notte. */
function diNotte(s: StatoTelefono, giro: Giro | null): boolean {
  if (!giro) return false
  if (giro.perche === 'ruolo' || giro.perche === 'notte') return true
  return giro.perche === 'notizia' && s.partita.decisione?.da === 'notte'
}

function titoloDi(s: StatoTelefono, giro: Giro | null, notte: boolean): string {
  const p = s.partita
  if (giro?.perche === 'ruolo') return 'I ruoli'
  if (p.fase === 'finita' && !giro) return 'Fine'
  if (notte) return `Notte ${giro?.notte ?? p.notte}`
  return `Giorno ${p.giorno}`
}

/**
 * Lupus a un telefono solo, che fa da moderatore. Quando tocca a qualcuno il
 * telefono passa di mano — chi lo riceve dice di essere lui, e solo allora si
 * apre la sua schermata — e di giorno lo schermo e' il tavolo: l'alba, la
 * discussione con il tempo, le nomine una mano alla volta, le arringhe. Chi
 * passa il telefono e quando lo decide telefono.ts; le regole il motore.
 */
export default function LupusTelefono() {
  const { vai, indietro } = useNavigazione()
  const { stato, fai, lascia } = useTelefono()
  const [regole, setRegole] = useState(false)
  const [cronaca, setCronaca] = useState(false)
  const [abbandona, setAbbandona] = useState(false)
  const [scelto, setScelto] = useState<string | null>(null)
  const { adesivo, mostra } = useAdesivo()

  // Senza una partita salvata si torna alla sala, dove la si prepara.
  const senza = useRef(!stato)
  useEffect(() => {
    if (senza.current) vai(ROTTE.lupus, { replace: true, direzione: 'nessuna' })
  }, [vai])

  // La discussione e le arringhe finiscono da sole: il tempo lo guarda il telefono.
  const fineFase = stato?.partita.fineFase ?? null
  useEffect(() => {
    if (fineFase === null) return
    const t = window.setInterval(() => {
      if (Date.now() >= fineFase) fai(tempoPassato)
    }, 500)
    return () => window.clearInterval(t)
  }, [fineFase, fai])

  const giro = stato ? giroInCorso(stato) : null
  const notte = stato ? diNotte(stato, giro) : false
  useNotte(notte)

  // La fine vista arrivare: l'adesivo con chi ha vinto, e i coriandoli.
  const finita = stato?.partita.fase === 'finita' && !giro
  const inCorso = stato ? !finita : null
  const festa = useFesta(inCorso, finita)
  const vincitore = finita ? stato!.partita.esito!.vincitore : null
  const vistaFinire = useRef(false)
  useEffect(() => {
    if (inCorso) vistaFinire.current = true
    else if (vincitore && vistaFinire.current) {
      vistaFinire.current = false
      mostra({ tono: 'vivace', titolo: VINCITORI[vincitore].titolo, durata: 2_600, suono: 'vittoria' })
    }
  }, [inCorso, vincitore, mostra])

  if (!stato) return null
  const p = stato.partita
  const tavolo = vistaDelTavolo(p)

  const corpo = (() => {
    if (giro) return <TelefonoInGiro stato={stato} giro={giro} fai={fai} />
    switch (p.fase) {
      case 'alba':
        return <Alba vista={tavolo} onAvanti={() => fai((s, t) => agisci(s, { tipo: 'avanti' }, t))} />
      case 'discussione':
        return <Discussione vista={tavolo} onAvanti={() => fai((s, t) => agisci(s, { tipo: 'avanti' }, t))} />
      case 'nomine': {
        const votante = tavolo.ordineDiVoto.find((id) => !(id in tavolo.votiNomine)) ?? null
        return (
          <Nomine
            vista={tavolo}
            votante={votante}
            bersagli={votante ? nominabili(p, votante) : []}
            scelto={scelto}
            onScegli={(id) => {
              suona('tocco', { volume: 0.6 })
              setScelto(id)
            }}
            onVota={(bersaglio) => {
              if (!votante) return
              setScelto(null)
              fai((s, t) => agisci(s, { tipo: 'voto', giocatore: votante, bersaglio }, t))
            }}
          />
        )
      }
      case 'arringhe':
        return <Arringhe vista={tavolo} onAvanti={() => fai((s, t) => agisci(s, { tipo: 'avanti' }, t))} />
      case 'notte':
        return <EsitoDelGiorno vista={tavolo} onAvanti={() => fai(annunciaLaNotte)} />
      case 'finita':
        return (
          <Fine
            vista={tavolo}
            onAncora={() => fai((_, t) => comincia(leggiPreparazione(), semeACaso(), t))}
            onEsci={() => {
              lascia()
              indietro(ROTTE.lupus)
            }}
          />
        )
      default:
        // Una fase che aspetta il telefono, senza che il telefono giri: la si chiude.
        return (
          <Schermo
            piede={
              <Button size="lg" fullWidth onClick={() => fai((s, t) => agisci(s, { tipo: 'avanti' }, t))}>
                Avanti
              </Button>
            }
          >
            <span />
          </Schermo>
        )
    }
  })()

  return (
    <Pagina
      titolo={titoloDi(stato, giro, notte)}
      intera
      indietro={{ a: ROTTE.lupus, etichetta: 'Lupus' }}
      azioni={
        <>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
          {!giro && (
            <BottoneBarra etichetta="La cronaca" onClick={() => setCronaca(true)}>
              <IconBook size={20} />
            </BottoneBarra>
          )}
          {p.fase !== 'finita' && (
            <BottoneBarra etichetta="Lascia la partita" onClick={() => setAbbandona(true)}>
              <IconFlag size={19} />
            </BottoneBarra>
          )}
        </>
      }
    >
      <div className={`lupus${notte ? ' lupus--notte' : ''}`}>{corpo}</div>

      <ComeSiGiocaLupus open={regole} onClose={() => setRegole(false)} />
      <Sheet open={cronaca && !giro} onClose={() => setCronaca(false)} title="La cronaca">
        <Cronaca cronaca={tavolo.cronaca} giocatori={tavolo.giocatori} />
      </Sheet>
      <Sheet open={abbandona} onClose={() => setAbbandona(false)} title="Lasci la partita?">
        <div className="lupus-foglio">
          <p className="lupus-foglio__testo">Non si potrà più riprendere.</p>
          <Button
            variant="destructive"
            size="lg"
            fullWidth
            onClick={() => {
              setAbbandona(false)
              lascia()
              indietro(ROTTE.lupus)
            }}
          >
            Lascia la partita
          </Button>
          <Button variant="plain" size="lg" fullWidth onClick={() => setAbbandona(false)}>
            Continua a giocare
          </Button>
        </div>
      </Sheet>
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Il telefono in giro: a chi va, e la schermata di chi l'ha in mano. */
function TelefonoInGiro({
  stato,
  giro,
  fai,
}: {
  stato: StatoTelefono
  giro: Giro
  fai: (cambio: (s: StatoTelefono, adesso: number) => StatoTelefono) => void
}) {
  const p = stato.partita
  const id = giro.elenco[giro.indice]
  const nome = nomeDi(p.giocatori, id)

  if (!giro.aperto) {
    return (
      <Schermo
        piede={
          <Button
            size="lg"
            fullWidth
            onClick={() => {
              suona('tocco')
              fai(apri)
            }}
          >
            Sono {nome}
          </Button>
        }
      >
        <div className="lupus-passa">
          <p className="lupus-occhiello u-tabnum">
            {giro.indice + 1} di {giro.elenco.length}
          </p>
          <span className="lupus-passa__volto">
            <Avatar nickname={nome.normalize('NFD').replace(/[̀-ͯ]/g, '')} size={96} />
          </span>
          <p className="lupus-passa__sopra">Passa il telefono a</p>
          <p className="lupus-passa__nome">{nome}</p>
          <p className="lupus-passa__sotto">{PERCHE[giro.perche]}. Gli altri non guardano.</p>
        </div>
      </Schermo>
    )
  }

  const vista = vistaPer(p, id)
  const passaOltre = () => fai(passa)

  switch (giro.perche) {
    case 'ruolo':
      return (
        <Rivelazione
          key={id}
          vista={vista}
          onVisto={() => fai((s, t) => agisciEPassa(s, { tipo: 'ruolo_visto', giocatore: id }, t))}
        />
      )
    case 'notte': {
      if (giro.fatto) return <EsitoDellaNotte vista={vista} notte={giro.notte} onLetto={passaOltre} />
      // La notte e' gia' risolta, ma il telefono passa a tutti: chi resta finge, come chi dorme.
      if (p.fase !== 'notte') {
        return (
          <NotteFinta
            key={id}
            vista={vista}
            notte={giro.notte}
            vivi={giro.vivi}
            fantasma={!giro.vivi.includes(id)}
            onFatto={passaOltre}
          />
        )
      }
      const r = vista.richiesta
      return (
        <SchermataNotte
          key={`${id}-${r.tipo === 'indica' || r.tipo === 'notizia' ? r.compito : r.tipo}`}
          vista={vista}
          notte={giro.notte}
          locale
          vivi={giro.vivi}
          onScelta={(scelta) => fai((s, t) => sceltaDellaNotte(s, id, scelta, t))}
          onFinto={passaOltre}
        />
      )
    }
    case 'notizia':
      if (vista.richiesta.tipo === 'benvenuto') {
        const richiesta = vista.richiesta
        return (
          <SchermataBenvenuto
            key={id}
            vista={vista}
            richiesta={richiesta}
            onRisposta={(rivela) => fai((s, t) => agisciEPassa(s, { tipo: 'benvenuto', giocatore: id, rivela }, t))}
          />
        )
      }
      break
    case 'voto':
      if (vista.richiesta.tipo === 'vota') {
        const r = vista.richiesta
        return (
          <VotoSegreto
            key={id}
            vista={vista}
            bersagli={r.bersagli}
            astensione={r.astensione}
            onVoto={(bersaglio) => fai((s, t) => agisciEPassa(s, { tipo: 'voto', giocatore: id, bersaglio }, t))}
          />
        )
      }
      break
  }
  // Non ha niente da fare in questo giro: passa il telefono.
  return (
    <Schermo
      piede={
        <Button size="lg" fullWidth onClick={passaOltre}>
          Passa il telefono
        </Button>
      }
    >
      <div className="lupus-centro">
        <span className="lupus-testa__icona is-notte" aria-hidden="true">
          <IconaLupus nome="luna" size="56%" />
        </span>
      </div>
    </Schermo>
  )
}
