import { useCallback, useEffect, useRef, useState } from 'react'
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
import { Campo, ElencoMosse, Tabellino } from '@/games/scarabeo/Campo'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import { preparaComputer } from '@/games/scarabeo/computer'
import { useComposizione } from '@/games/scarabeo/useComposizione'
import { nonNelDizionario, useParoleSconosciute } from '@/games/scarabeo/useScarabeo'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { COOP_POLL_VIEW_MS } from '@shared/config'
import type { CellaPiena, ScarabeoState, VistaCompagnia } from '@shared/types'
import './Scarabeo.css'
import './WordleInsieme.css'

const NESSUNA: readonly CellaPiena[] = []
const NESSUNO: readonly string[] = []

/**
 * Lo Scarabeo di un collega, visto da chi gioca in sua compagnia.
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
        vai(ROTTE.insiemeA(fresca.gioco, id), { replace: true, direzione: 'nessuna' })
        return
      }
      caricata.current = true
      setVista(fresca)
      setErrore(null)
    } catch (err) {
      if (err instanceof ApiFetchError && (err.status === 403 || err.status === 404)) setErrore(err.message)
      else if (!caricata.current) setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricarla.')
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

  const stato: ScarabeoState | null = vista?.gioco === 'scarabeo' ? vista.partita : null
  const finita = stato?.status === 'done'
  const c = useComposizione({
    celle: stato?.celle ?? NESSUNA,
    leggio: stato?.leggio ?? NESSUNO,
    bloccata: !stato || finita || inviando,
  })
  const sconosciute = useParoleSconosciute(c.anteprima)

  const suggerisci = useCallback(async () => {
    if (inviando || !stato) return
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
  }, [c, id, inviando, sconosciute, stato])

  // Chi gioca con l'host finisce con lui: la stessa festa, se ha battuto il computer.
  const festa = useFesta(
    stato ? !finita : null,
    !!finita && !!vista?.conta && stato.punti >= stato.computer.punti && stato.punti > 0,
  )
  useEffect(() => {
    if (festa) suona('vittoria')
  }, [festa])
  // Una mossa nuova dell'host si sente come una tessera posata.
  const mosse = stato?.mosseUsate ?? 0
  const viste = useRef<number | null>(null)
  useEffect(() => {
    if (viste.current !== null && mosse > viste.current) suona('posa')
    viste.current = mosse
  }, [mosse])

  const host = vista?.host
  return (
    <Pagina
      titolo={host ? `Con ${host.displayName}` : 'In compagnia'}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}
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
            <Button variant="tinted" onClick={() => vai(ROTTE.home, { direzione: 'indietro' })}>
              Torna alle Giornaliere
            </Button>
          }
        />
      ) : !stato || !vista || !host ? (
        <div className="scr__attesa" aria-hidden="true" />
      ) : (
        <Campo
          c={c}
          sconosciute={sconosciute}
          bloccato={finita || inviando}
          restanti={stato.restanti}
          suggerisci
          testa={
            <>
              <div className={`insieme__assist${vista.conta ? '' : ' is-spettatore'}`}>
                <IconPeople size={14} />
                {vista.conta ? (
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
                io={stato.punti}
                altro={stato.computer.punti}
                nomeAltro="Computer"
                notaAltro="stesse tessere"
                sotto={
                  finita
                    ? 'Giornata chiusa'
                    : `Mossa ${Math.min(stato.mosseUsate + 1, stato.mosseTotali)} di ${stato.mosseTotali}`
                }
                avanzamento={stato.computer.punti > 0 ? stato.punti / stato.computer.punti : 0}
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
                  disabled={inviando}
                />
              )}
            </>
          }
          fine={
            finita ? (
              <div className="scr-fine">
                <p className="scr-fine__titolo">Giornata chiusa</p>
                <p className="scr-fine__nota">
                  {stato.punti} contro {stato.computer.punti} del computer
                </p>
                <div className="scr-fine__azioni">
                  <Button variant="tinted" onClick={() => vai(ROTTE.classifica('scarabeo'))}>
                    Classifica
                  </Button>
                </div>
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
        {stato && (
          <ElencoMosse
            mosse={stato.mosse}
            totale={stato.mosse.length > 0 ? stato.punti : undefined}
            vuoto="Nessuna mossa, per ora."
          />
        )}
      </Sheet>
      {festa && <Coriandoli />}
    </Pagina>
  )
}
