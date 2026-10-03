import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Vuoto, useFesta } from '@/components/Elementi'
import { IconComputer, IconInfo, IconList, IconPeople } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { IconaScheda } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { Suggerimenti } from '@/games/compagnia/Suggerimenti'
import { etichettaScarabeo } from '@/games/compagnia/etichette'
import { Campo, ElencoMosse, Tabellino, type VoceMossa } from '@/games/scarabeo/Campo'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import { preparaComputer } from '@/games/scarabeo/computer'
import { useComposizione } from '@/games/scarabeo/useComposizione'
import { nonNelDizionario, useParoleSconosciute } from '@/games/scarabeo/useScarabeo'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { COOP_POLL_VIEW_MS } from '@shared/config'
import { LATO, sacchettoDaSeme } from '@shared/scarabeo'
import { MOSSE_A_TESTA, statoLibera } from '@shared/scarabeo-computer'
import type { CellaPiena, VistaCompagnia } from '@shared/types'
import './Scarabeo.css'
import './WordleInsieme.css'

const NESSUNA: readonly CellaPiena[] = []
const NESSUNO: readonly string[] = []

/** Quel che si guarda della partita dell'host, sia la classificata del giorno sia una libera contro il computer. */
interface Tavola {
  celle: CellaPiena[]
  leggio: string[]
  restanti: number
  punti: number
  computer: number
  mosse: VoceMossa[]
  mosseUsate: number
  mosseTotali: number
  finita: boolean
  /** Tocca all'host: nella libera puo' toccare al computer, e allora non si suggerisce. */
  tocca: boolean
  /** Nella libera, com'e' finita. */
  esito: 'vinta' | 'persa' | 'pari' | null
}

function tavolaDi(vista: VistaCompagnia | null): Tavola | null {
  if (vista?.gioco !== 'scarabeo') return null
  if (vista.modalita === 'classificata') {
    const s = vista.partita
    const finita = s.status === 'done'
    return {
      celle: s.celle,
      leggio: s.leggio,
      restanti: s.restanti,
      punti: s.punti,
      computer: s.computer.punti,
      mosse: s.mosse,
      mosseUsate: s.mosseUsate,
      mosseTotali: s.mosseTotali,
      finita,
      tocca: !finita,
      esito: null,
    }
  }
  if (!vista.partita) return null
  // La libera sta nel telefono dell'host: qui arrivano le mosse, e il resto si ricava come la' (statoLibera).
  const s = statoLibera(vista.partita, sacchettoDaSeme(vista.partita.seme))
  const celle: CellaPiena[] = []
  s.tabellone.forEach((casella, i) => {
    if (casella) celle.push({ r: Math.floor(i / LATO), c: i % LATO, lettera: casella.lettera, jolly: casella.jolly })
  })
  return {
    celle,
    leggio: s.mioLeggio,
    restanti: s.restanti,
    punti: s.mieiPunti,
    computer: s.puntiComputer,
    mosse: s.giocate.map((g, i) => ({ ...g, numero: i + 1, autore: g.mia ? undefined : 'Computer' })),
    mosseUsate: s.mieMosse,
    mosseTotali: MOSSE_A_TESTA,
    finita: s.finita,
    tocca: s.turno === 'io',
    esito: s.esito,
  }
}

/**
 * Lo Scarabeo di un collega, visto da chi gioca in sua compagnia: la
 * classificata del giorno, o una sua libera contro il computer.
 *
 * Il tabellone e il leggio sono i suoi, aggiornati a polling. Chi guarda
 * compone una posa con le sue tessere, come se toccasse a lui, e invece di
 * "Gioca" c'e' "Suggerisci": la posa arriva all'host gia' controllata, con le
 * parole e i punti, e la mossa la fa sempre lui. Quando l'host muove, le
 * tessere composte tornano sul leggio, che e' cambiato.
 */
export default function ScarabeoInsieme() {
  const { id = '' } = useParams()
  const { vai } = useNavigazione()
  const [vista, setVista] = useState<VistaCompagnia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [aiuto, setAiuto] = useState(false)
  const [storia, setStoria] = useState(false)
  const caricata = useRef(false)

  const carica = useCallback(async () => {
    try {
      const fresca = await api<VistaCompagnia>(`/compagnia/partita/${id}`)
      if (fresca.gioco !== 'scarabeo') {
        vai(ROTTE.insiemeA(fresca.gioco, id, fresca.modalita), { replace: true, direzione: 'nessuna' })
        return
      }
      caricata.current = true
      setVista(fresca)
      setErrore(null)
    } catch (err) {
      if (err instanceof ApiFetchError && (err.status === 403 || err.status === 404)) {
        setErrore(caricata.current ? 'La partita non è più condivisa.' : err.message)
      } else if (!caricata.current) {
        setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricarla.')
      }
    }
  }, [id, vai])

  useEffect(() => {
    void carica()
    // Il dizionario si scalda mentre si guarda il tabellone: serve a dire subito se una parola non esiste.
    void preparaComputer().catch(() => {})
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carica()
    }, COOP_POLL_VIEW_MS)
    return () => window.clearInterval(t)
  }, [carica])

  const libera = vista?.modalita === 'libera'
  const tavola = useMemo(() => tavolaDi(vista), [vista])
  const finita = tavola?.finita ?? false
  const c = useComposizione({
    celle: tavola?.celle ?? NESSUNA,
    leggio: tavola?.leggio ?? NESSUNO,
    bloccata: !tavola || finita || !tavola.tocca || inviando,
  })
  const sconosciute = useParoleSconosciute(c.anteprima)

  const suggerisci = useCallback(async () => {
    if (inviando || !tavola) return
    if (c.sospese.length === 0) {
      c.avvisa('Posa almeno una tessera.')
      return
    }
    if (c.anteprima && !c.anteprima.ok) {
      haptic('error')
      c.avvisa(c.anteprima.errore)
      return
    }
    if (sconosciute && sconosciute.length > 0) {
      haptic('error')
      c.avvisa(nonNelDizionario(sconosciute))
      return
    }
    setInviando(true)
    try {
      const fresca = await api<VistaCompagnia>(`/compagnia/partita/${id}/suggerisci`, {
        method: 'POST',
        body: { posa: c.sospese },
      })
      setVista(fresca)
      c.annulla()
      haptic('success')
      suona('invito', { volume: 0.6 })
      c.avvisa('Suggerimento inviato.')
    } catch (err) {
      haptic('error')
      c.avvisa(err instanceof ApiFetchError ? err.message : 'Non riesco a mandarlo.')
    } finally {
      setInviando(false)
    }
  }, [c, id, inviando, sconosciute, tavola])

  // Chi gioca con l'host finisce con lui: la stessa festa, se ha battuto il computer.
  const vinta = !!tavola && tavola.punti >= tavola.computer && tavola.punti > 0
  const vale = libera ? tavola?.esito === 'vinta' : !!vista?.conta && vinta
  const festa = useFesta(tavola ? !finita : null, finita && vale)
  useEffect(() => {
    if (festa) suona('vittoria')
  }, [festa])
  // Una mossa nuova, dell'host o del computer, si sente come una tessera posata.
  const mosse = tavola?.mosse.length ?? 0
  const viste = useRef<number | null>(null)
  useEffect(() => {
    if (viste.current !== null && mosse > viste.current) suona('posa')
    viste.current = mosse
  }, [mosse])

  const host = vista?.host
  const fineTitolo = !tavola
    ? ''
    : libera
      ? tavola.esito === 'vinta'
        ? `${host?.displayName} ha battuto il computer`
        : tavola.esito === 'pari'
          ? 'Pari con il computer'
          : 'Il computer ha fatto di più'
      : 'Giornata chiusa'
  return (
    <Pagina
      titolo={host ? `Con ${host.displayName}` : 'In compagnia'}
      intera
      indietro={libera ? { a: ROTTE.libere, etichetta: 'Libere' } : { a: ROTTE.home, etichetta: 'Giornaliere' }}
      azioni={
        <>
          <BottoneBarra etichetta="Le sue mosse" onClick={() => setStoria(true)}>
            <IconList size={20} />
          </BottoneBarra>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      {errore ? (
        <Vuoto
          titolo="La partita non si è aperta"
          testo={errore}
          azione={
            <Button
              variant="tinted"
              onClick={() => vai(libera ? ROTTE.libere : ROTTE.home, { direzione: 'indietro' })}
            >
              {libera ? 'Torna alle Libere' : 'Torna alle Giornaliere'}
            </Button>
          }
        />
      ) : !vista || !host ? (
        <div className="scr__attesa" aria-hidden="true" />
      ) : !tavola ? (
        <Vuoto titolo="Ancora niente" testo={`Aspetto che ${host.displayName} cominci una partita…`} />
      ) : (
        <Campo
          c={c}
          sconosciute={sconosciute}
          bloccato={finita || inviando || !tavola.tocca}
          restanti={tavola.restanti}
          suggerisci
          testa={
            <>
              <div className={`insieme__assist${vista.conta ? '' : ' is-spettatore'}`}>
                <IconPeople size={14} />
                {libera ? (
                  <span>La partita libera di {host.displayName}</span>
                ) : vista.conta ? (
                  vista.mioPunteggio !== null && finita ? (
                    <span>
                      La tua partita di oggi · <strong>+{vista.mioPunteggio}</strong> in classifica
                    </span>
                  ) : (
                    <span>
                      Prendi lo <strong>stesso punteggio</strong> di {host.displayName}
                    </span>
                  )
                ) : (
                  <span>Hai già giocato oggi: qui non prendi punti</span>
                )}
              </div>
              <Tabellino
                nomeIo={host.displayName}
                iconaIo={<Avatar nickname={host.nickname} color={host.avatarColor} size={20} />}
                iconaAltro={
                  <IconaScheda>
                    <IconComputer size={12} />
                  </IconaScheda>
                }
                avviso={c.messaggio}
                posa={c.anteprima}
                sconosciute={sconosciute}
                io={tavola.punti}
                altro={tavola.computer}
                nomeAltro="Computer"
                notaAltro={libera ? undefined : 'stesse tessere'}
                turno={libera && !finita ? (tavola.tocca ? 'io' : 'altro') : null}
                sotto={
                  finita
                    ? libera
                      ? 'Partita finita'
                      : 'Giornata chiusa'
                    : !tavola.tocca
                      ? 'Tocca al computer'
                      : `Mossa ${Math.min(tavola.mosseUsate + 1, tavola.mosseTotali)} di ${tavola.mosseTotali}`
                }
                avanzamento={libera ? undefined : tavola.computer > 0 ? tavola.punti / tavola.computer : 0}
                onApri={() => setStoria(true)}
              />
              {!finita && (
                <Suggerimenti
                  suggerimenti={vista.suggerimenti}
                  etichetta={etichettaScarabeo}
                  onScegli={(s) => {
                    if (s.proposta.gioco === 'scarabeo' && !c.proponi(s.proposta.posa)) {
                      c.avvisa('Quella posa è di un turno passato.')
                    }
                  }}
                  disabled={inviando || !tavola.tocca}
                />
              )}
            </>
          }
          fine={
            finita ? (
              <div className="scr-fine">
                <p className="scr-fine__titolo">{fineTitolo}</p>
                <p className="scr-fine__nota">
                  {tavola.punti} contro {tavola.computer} del computer
                </p>
                {!libera && (
                  <div className="scr-fine__azioni">
                    <Button variant="tinted" onClick={() => vai(ROTTE.classifica('scarabeo'))}>
                      Classifica
                    </Button>
                  </div>
                )}
              </div>
            ) : undefined
          }
          onGioca={() => void suggerisci()}
          onPassa={() => {}}
          onCambia={() => {}}
        />
      )}

      <ComeSiGiocaScarabeo open={aiuto} onClose={() => setAiuto(false)} />
      <Sheet
        open={storia}
        onClose={() => setStoria(false)}
        title={host ? `Le mosse di ${host.displayName}` : 'Le mosse'}
      >
        {tavola && (
          <ElencoMosse
            mosse={tavola.mosse}
            totale={tavola.mosse.length > 0 && !libera ? tavola.punti : undefined}
            vuoto="Nessuna mossa, per ora."
          />
        )}
      </Sheet>
      {festa && <Coriandoli />}
    </Pagina>
  )
}
