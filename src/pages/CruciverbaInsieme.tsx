import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconChevronLeft, IconChevronRight, IconInfo, IconPeople } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { Suggerimenti } from '@/games/compagnia/Suggerimenti'
import { etichettaCruciverba } from '@/games/compagnia/etichette'
import { ComeSiGiocaCruciverba } from '@/games/cruciverba/ComeSiGioca'
import { ElencoDefinizioni } from '@/games/cruciverba/ElencoDefinizioni'
import { Griglia } from '@/games/cruciverba/Griglia'
import { Tastiera } from '@/games/cruciverba/Tastiera'
import type { Direzione, Selezione } from '@/games/cruciverba/useCruciverba'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { COOP_POLL_VIEW_MS } from '@shared/config'
import { VUOTA, caselleBianche, caselleScritte, numeriDelleCaselle } from '@shared/cruciverba'
import { isGameLetter } from '@shared/wordle'
import type { CruciverbaState, DefinizioneCruciverba, VistaCompagnia } from '@shared/types'
import './Cruciverba.css'
import './WordleInsieme.css'

const NOMI_DIREZIONE = { o: 'orizzontale', v: 'verticale' } as const
const NESSUNA: ReadonlySet<number> = new Set()
const DURATA_MESSAGGIO_MS = 2_000

/**
 * Il cruciverba di un collega, visto da chi gioca in sua compagnia.
 *
 * La griglia e' la sua, aggiornata a polling. Chi guarda ci scrive sopra le
 * sue proposte, in un'altra tinta, come a matita: restano sue finché non le
 * suggerisce, e la griglia dell'host non la tocca mai. "Suggerisci" manda la
 * parola della definizione scelta; l'host la vede in una capsula e decide lui.
 */
export default function CruciverbaInsieme() {
  const { id = '' } = useParams()
  const { vai } = useNavigazione()
  const [vista, setVista] = useState<VistaCompagnia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [selezione, setSelezione] = useState<Selezione | null>(null)
  /** Le lettere scritte da chi guarda, casella per casella: sopra a quelle dell'host. */
  const [mie, setMie] = useState<ReadonlyMap<number, string>>(new Map())
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [elenco, setElenco] = useState(false)
  const [aiuto, setAiuto] = useState(false)
  const timer = useRef<number | null>(null)
  const caricata = useRef(false)

  const mostra = useCallback((testo: string) => {
    setMessaggio(testo)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessaggio(null), DURATA_MESSAGGIO_MS)
  }, [])
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const carica = useCallback(async () => {
    try {
      const fresca = await api<VistaCompagnia>(`/compagnia/partita/${id}`)
      // Un indirizzo di un altro gioco arrivato qui: la partita e' sua.
      if (fresca.gioco !== 'cruciverba') {
        vai(ROTTE.insiemeA(fresca.gioco, id, fresca.modalita), { replace: true, direzione: 'nessuna' })
        return
      }
      caricata.current = true
      setVista(fresca)
      setErrore(null)
    } catch (err) {
      // Un errore di rete durante il polling non svuota la schermata: si dice solo se non c'e' ancora niente.
      // Chi guardava e la compagnia si chiude: lo si dice cosi', non come un errore.
      if (err instanceof ApiFetchError && (err.status === 403 || err.status === 404)) {
        setErrore(caricata.current ? 'La partita non è più condivisa.' : err.message)
      } else if (!caricata.current) {
        setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricarla.')
      }
    }
  }, [id, vai])

  useEffect(() => {
    void carica()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carica()
    }, COOP_POLL_VIEW_MS)
    return () => window.clearInterval(t)
  }, [carica])

  const stato: CruciverbaState | null = vista?.gioco === 'cruciverba' ? vista.partita : null
  const finita = stato?.status === 'done'
  const libera = vista?.modalita === 'libera'

  // Nelle libere l'host passa a un altro schema: le proposte e la casella erano per quello di prima.
  const idPartita = stato?.partitaId ?? null
  useEffect(() => {
    setMie(new Map())
    setSelezione(null)
  }, [idPartita])
  const definizioni = useMemo(() => stato?.definizioni ?? [], [stato?.definizioni])
  const numeri = useMemo(() => numeriDelleCaselle(definizioni), [definizioni])

  const perCasella = useMemo(() => {
    const mappa = new Map<number, { o?: DefinizioneCruciverba; v?: DefinizioneCruciverba }>()
    for (const d of definizioni) {
      for (const k of d.caselle) mappa.set(k, { ...mappa.get(k), [d.direzione]: d })
    }
    return mappa
  }, [definizioni])

  // La prima selezione: la prima parola con un buco nella griglia dell'host.
  useEffect(() => {
    if (!stato || selezione) return
    const d = stato.definizioni.find((x) => x.caselle.some((k) => stato.lettere[k] === VUOTA)) ?? stato.definizioni[0]
    if (d) setSelezione({ casella: d.caselle[0], direzione: d.direzione })
  }, [selezione, stato])

  const corrente = useMemo(() => {
    if (!selezione) return null
    const voce = perCasella.get(selezione.casella)
    return voce?.[selezione.direzione] ?? voce?.o ?? voce?.v ?? null
  }, [perCasella, selezione])

  /** La griglia che si vede: quella dell'host, con sopra le lettere di chi guarda. */
  const lettere = useMemo(() => {
    if (!stato) return ''
    if (finita || mie.size === 0) return stato.lettere
    const celle = [...stato.lettere]
    for (const [k, l] of mie) celle[k] = l
    return celle.join('')
  }, [finita, mie, stato])
  const proposte = useMemo(() => {
    if (!stato || finita) return NESSUNA
    return new Set([...mie].filter(([k, l]) => l !== VUOTA && l !== stato.lettere[k]).map(([k]) => k))
  }, [finita, mie, stato])
  const parola = useMemo(() => new Set(corrente?.caselle ?? []), [corrente])
  const svelate = useMemo(() => new Set(stato?.svelate ?? []), [stato?.svelate])

  /* ───────────────────────────  Muoversi e scrivere  ─────────────────────────── */

  const tocca = useCallback(
    (casella: number) => {
      const voce = perCasella.get(casella)
      if (!voce) return
      setSelezione((prima) => {
        if (prima?.casella === casella) {
          const altra: Direzione = prima.direzione === 'o' ? 'v' : 'o'
          return voce[altra] ? { casella, direzione: altra } : prima
        }
        const voluta = prima?.direzione ?? 'o'
        return { casella, direzione: voce[voluta] ? voluta : voluta === 'o' ? 'v' : 'o' }
      })
    },
    [perCasella],
  )

  const vaiAllaDefinizione = useCallback(
    (passo: 1 | -1) => {
      if (!corrente || definizioni.length === 0) return
      const i = definizioni.findIndex((d) => d.chiave === corrente.chiave)
      const d = definizioni[(i + passo + definizioni.length) % definizioni.length]
      setSelezione({ casella: d.caselle[0], direzione: d.direzione })
    },
    [corrente, definizioni],
  )

  const scegli = useCallback((d: DefinizioneCruciverba) => {
    setSelezione({ casella: d.caselle[0], direzione: d.direzione })
    setElenco(false)
  }, [])

  const scrivi = useCallback(
    (lettera: string) => {
      if (finita || !selezione || !corrente || svelate.has(selezione.casella)) return
      suona('tocco')
      setMie((prima) => new Map(prima).set(selezione.casella, lettera))
      const posizione = corrente.caselle.indexOf(selezione.casella)
      const prossima = corrente.caselle[posizione + 1]
      if (prossima !== undefined) setSelezione({ casella: prossima, direzione: corrente.direzione })
    },
    [corrente, finita, selezione, svelate],
  )

  const cancella = useCallback(() => {
    if (finita || !selezione || !corrente) return
    let k = selezione.casella
    const vuota = (x: number) => (mie.get(x) ?? stato?.lettere[x]) === VUOTA
    if (vuota(k) || svelate.has(k)) {
      const posizione = corrente.caselle.indexOf(k)
      if (posizione <= 0) return
      k = corrente.caselle[posizione - 1]
      setSelezione({ casella: k, direzione: corrente.direzione })
    }
    if (svelate.has(k)) return
    suona('tocco', { volume: 0.7 })
    setMie((prima) => new Map(prima).set(k, VUOTA))
  }, [corrente, finita, mie, selezione, stato?.lettere, svelate])

  /** La parola della definizione scelta, com'e' adesso: le lettere di chi guarda sopra quelle dell'host. */
  const proposta = corrente ? corrente.caselle.map((k) => lettere[k] ?? VUOTA).join('') : ''
  const completa = proposta.length > 0 && !proposta.includes(VUOTA)

  const suggerisci = useCallback(async () => {
    if (!corrente || inviando || finita) return
    if (!completa) {
      haptic('error')
      mostra('Completa la parola')
      return
    }
    setInviando(true)
    try {
      const fresca = await api<VistaCompagnia>(`/compagnia/partita/${id}/suggerisci`, {
        method: 'POST',
        body: { definizione: corrente.chiave, parola: proposta },
      })
      setVista(fresca)
      haptic('success')
      suona('invito', { volume: 0.6 })
      mostra('Suggerimento inviato')
      // Avanti alla prossima definizione con un buco, come quando si scrive.
      const i = definizioni.findIndex((d) => d.chiave === corrente.chiave)
      for (let n = 1; n < definizioni.length; n += 1) {
        const d = definizioni[(i + n) % definizioni.length]
        const vuota = d.caselle.find((k) => lettere[k] === VUOTA)
        if (vuota !== undefined) {
          setSelezione({ casella: vuota, direzione: d.direzione })
          break
        }
      }
    } catch (err) {
      haptic('error')
      mostra(err instanceof ApiFetchError ? err.message : 'Non riesco a mandarlo.')
    } finally {
      setInviando(false)
    }
  }, [completa, corrente, definizioni, finita, id, inviando, lettere, mostra, proposta])

  // La tastiera vera: le lettere nella proposta, Invio la suggerisce, Tab cambia definizione.
  useEffect(() => {
    if (!stato || finita || elenco || aiuto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tasto = e.key.toLowerCase()
      if (isGameLetter(tasto)) {
        e.preventDefault()
        scrivi(tasto)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        cancella()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        void suggerisci()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        vaiAllaDefinizione(e.shiftKey ? -1 : 1)
      } else if (e.key === ' ' && selezione) {
        e.preventDefault()
        tocca(selezione.casella)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aiuto, cancella, elenco, finita, scrivi, selezione, stato, suggerisci, tocca, vaiAllaDefinizione])

  // Chi gioca con l'host finisce con lui: la stessa festa, se arriva mentre guarda.
  const festa = useFesta(stato ? !finita : null, !!finita && !!vista?.conta)
  useEffect(() => {
    if (festa) suona('vittoria')
  }, [festa])
  // Una parola nuova dell'host si sente, come le lettere che si scrivono.
  const scritteHost = stato ? caselleScritte(stato.lettere) : 0
  const viste = useRef<number | null>(null)
  useEffect(() => {
    if (viste.current !== null && scritteHost > viste.current) suona('posa', { volume: 0.5 })
    viste.current = scritteHost
  }, [scritteHost])

  const host = vista?.host
  return (
    <Pagina
      titolo={host ? `Con ${host.displayName}` : 'In compagnia'}
      intera
      larga
      indietro={libera ? { a: ROTTE.libere, etichetta: 'Libere' } : { a: ROTTE.home, etichetta: 'Giornaliere' }}
      azioni={
        <>
          {host && <Avatar nickname={host.nickname} color={host.avatarColor} size={32} />}
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      <div className="cru">
        {errore ? (
          <div className="cru__ripiego">
            <p>{errore}</p>
            <Button
              variant="tinted"
              onClick={() => vai(libera ? ROTTE.libere : ROTTE.home, { direzione: 'indietro' })}
            >
              {libera ? 'Torna alle Libere' : 'Torna alle Giornaliere'}
            </Button>
          </div>
        ) : !vista ? (
          <div className="cru__attesa" aria-hidden="true" />
        ) : !stato ? (
          <div className="cru__ripiego">
            <p>Aspetto che {vista.host.displayName} apra uno schema…</p>
          </div>
        ) : (
          <>
            <div className="cru__principale">
              {/* Che cosa vale questa partita per chi guarda: e' quel che rende l'invito una scelta neutra. */}
              <div className={`insieme__assist${vista.conta ? '' : ' is-spettatore'}`}>
                <IconPeople size={14} />
                {messaggio ? (
                  <span aria-live="polite">{messaggio}</span>
                ) : libera ? (
                  <span>Lo schema libero di {vista.host.displayName}</span>
                ) : vista.conta ? (
                  vista.mioPunteggio !== null ? (
                    <span>
                      La tua partita di oggi · <strong>+{vista.mioPunteggio}</strong> in classifica
                    </span>
                  ) : (
                    <span>
                      Prendi lo <strong>stesso punteggio</strong> di {vista.host.displayName}
                    </span>
                  )
                ) : (
                  <span>Hai già giocato oggi: qui non prendi punti</span>
                )}
              </div>

              <div className="cru__campo">
                <Griglia
                  righe={stato.righe}
                  colonne={stato.colonne}
                  schema={stato.schema}
                  lettere={lettere}
                  numeri={numeri}
                  attiva={finita ? null : (selezione?.casella ?? null)}
                  parola={finita ? NESSUNA : parola}
                  svelate={svelate}
                  segnalate={NESSUNA}
                  proposte={proposte}
                  onTocca={tocca}
                />
              </div>

              {finita ? (
                <div className="cru__fine">
                  <p className="cru__fine-titolo">Completato da {vista.host.displayName}</p>
                  <p className="cru__fine-punti u-tabnum">{stato.punti} punti</p>
                  <p className="cru__fine-dettaglio u-tabnum">in {formatCronometro(stato.tempoMs)}</p>
                  <div className="cru__fine-azioni">
                    {!libera && (
                      <Button variant="tinted" onClick={() => vai(ROTTE.classifica('cruciverba'))}>
                        Classifica
                      </Button>
                    )}
                    <Button variant="tinted" onClick={() => setElenco(true)}>
                      Definizioni e fonti
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {corrente && (
                    <div className="cbarra">
                      <button
                        type="button"
                        className="cbarra__freccia"
                        onClick={() => vaiAllaDefinizione(-1)}
                        aria-label="Definizione precedente"
                      >
                        <IconChevronLeft size={20} />
                      </button>
                      <button
                        type="button"
                        className="cbarra__testo"
                        onClick={() => setElenco(true)}
                        aria-label="Tutte le definizioni"
                      >
                        <span className="cbarra__dove">
                          {corrente.numero} {NOMI_DIREZIONE[corrente.direzione]}
                        </span>
                        <span className="cbarra__definizione">
                          {corrente.testo}
                          {corrente.nota && <span className="cbarra__nota">{corrente.nota}</span>}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="cbarra__freccia"
                        onClick={() => vaiAllaDefinizione(1)}
                        aria-label="Definizione successiva"
                      >
                        <IconChevronRight size={20} />
                      </button>
                    </div>
                  )}
                  <Suggerimenti
                    suggerimenti={vista.suggerimenti}
                    etichetta={(s) => etichettaCruciverba(s, definizioni)}
                    onScegli={(s) => {
                      if (s.proposta.gioco !== 'cruciverba') return
                      const { definizione, parola: testo } = s.proposta
                      const d = definizioni.find((x) => x.chiave === definizione)
                      if (!d) return
                      setSelezione({ casella: d.caselle[0], direzione: d.direzione })
                      setMie((prima) => {
                        const dopo = new Map(prima)
                        d.caselle.forEach((k, i) => dopo.set(k, testo[i]))
                        return dopo
                      })
                    }}
                    disabled={false}
                  />
                  <div className="cru-insieme__invio">
                    <Button
                      fullWidth
                      onClick={() => void suggerisci()}
                      loading={inviando}
                      disabled={!corrente || !completa}
                    >
                      {completa ? `Suggerisci ${proposta.toUpperCase()}` : 'Scrivi la parola da suggerire'}
                    </Button>
                  </div>
                  <Tastiera
                    direzione={selezione?.direzione ?? 'o'}
                    disabled={false}
                    onLettera={scrivi}
                    onCancella={cancella}
                    onDirezione={() => selezione && tocca(selezione.casella)}
                  />
                </>
              )}
            </div>

            <aside className="cru__laterale" aria-label="Definizioni">
              <ElencoDefinizioni
                definizioni={stato.definizioni}
                lettere={lettere}
                soluzione={stato.soluzione}
                corrente={corrente?.chiave ?? null}
                onScegli={scegli}
              />
            </aside>
          </>
        )}
      </div>

      <ComeSiGiocaCruciverba open={aiuto} onClose={() => setAiuto(false)} />
      <Sheet open={elenco} onClose={() => setElenco(false)} title="Definizioni">
        {stato && (
          <ElencoDefinizioni
            definizioni={stato.definizioni}
            lettere={lettere}
            soluzione={stato.soluzione}
            corrente={corrente?.chiave ?? null}
            onScegli={scegli}
          />
        )}
      </Sheet>
      {festa && <Coriandoli />}
      {stato && !finita && (
        <span className="u-visually-hidden" aria-live="polite">
          {`${vista?.host.displayName} ha scritto ${scritteHost} caselle su ${caselleBianche(stato.schema)}`}
        </span>
      )}
    </Pagina>
  )
}
