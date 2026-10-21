import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { FoglioAiuti } from '@/components/Aiuti'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { Sheet } from '@/components/Sheet'
import {
  IconClock,
  IconInfo,
  IconList,
  IconPeople,
  IconShuffle,
  IconTrophy,
} from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { api } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { ComeSiGiocaCruciverba } from '@/games/cruciverba/ComeSiGioca'
import { ADESIVO_COMPLETATO_MS, adesivoCompletato, adesivoControllo } from '@/games/cruciverba/adesivi'
import { AiutoVale, AiutoVoce } from '@/games/cruciverba/Aiuti'
import { BottoneFine, CartaFine } from '@/games/cruciverba/CartaFine'
import { Segno, SEGNI } from '@/games/cruciverba/segni'
import { BarraDefinizione } from '@/games/cruciverba/BarraDefinizione'
import { ElencoDefinizioni } from '@/games/cruciverba/ElencoDefinizioni'
import { Griglia } from '@/games/cruciverba/Griglia'
import { Tastiera } from '@/games/cruciverba/Tastiera'
import { CRUCIVERBA_DEL_GIORNO, indirizziLiberi, useCruciverba } from '@/games/cruciverba/useCruciverba'
import { PannelloCompagnia } from '@/games/compagnia/PannelloCompagnia'
import { etichettaCruciverba } from '@/games/compagnia/etichette'
import { Suggerimenti } from '@/games/compagnia/Suggerimenti'
import { useCompagniaHost } from '@/games/compagnia/useCompagniaHost'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown, formatCronometro, inPunti, pluralize } from '@/lib/format'
import { caselleDaPagare } from '@shared/aiuti'
import {
  NOMI_LIVELLI_CRUCIVERBA,
  VUOTA,
  costiCruciverba,
  numeriDelleCaselle,
  puntiDelTempoCruciverba,
} from '@shared/cruciverba'
import { isGameLetter } from '@shared/wordle'
import type { CruciverbaState, DefinizioneCruciverba } from '@shared/types'
import './Cruciverba.css'

/** Il fondo chiaro della carta della fine, e il colore del timbro. */
const FONDO_FINE = 'linear-gradient(180deg, #ecf2ff, #ffe1ec)'

/** Il conto intero, e quanto fa a lettera: scritto solo per lettera, sembrava il prezzo di una lettera sola. */
function prezzoDellaParola(svelata: number, lettere: number): string {
  return lettere === 1 ? inPunti(svelata) : `${inPunti(svelata * lettere)}, ${svelata} per lettera`
}

/** A cruciverba finito non si evidenzia niente: un insieme vuoto, sempre lo stesso. */
const NESSUNA: ReadonlySet<number> = new Set()

/**
 * Il cruciverba: quello del giorno, o uno schema libero.
 *
 * Una schermata sola, come lo Scarabeo: la griglia prende lo spazio che resta,
 * sotto stanno la definizione della parola selezionata e la tastiera — le due
 * cose che si guardano e si toccano a ogni lettera. Su un computer le
 * definizioni stanno tutte accanto alla griglia e la tastiera a schermo sparisce,
 * perché c'e' quella vera.
 *
 * La classificata e la libera sono la stessa partita sotto due indirizzi: lo
 * dice la rotta, `/cruciverba/classificata` o `/cruciverba/libera/:id`.
 */
export default function Cruciverba() {
  const { id } = useParams()
  const libera = id !== undefined
  const indirizzi = useMemo(() => (id ? indirizziLiberi(id) : CRUCIVERBA_DEL_GIORNO), [id])
  const g = useCruciverba(indirizzi)
  const [aiuto, setAiuto] = useState(false)
  const [elenco, setElenco] = useState(false)
  const [aiuti, setAiuti] = useState(false)
  const [compagniaAperta, setCompagniaAperta] = useState(false)
  const { vai } = useNavigazione()

  const stato = g.stato
  // In compagnia si gioca la classificata finché non e' finita, e solo se e' la propria; nelle libere sempre,
  // e chi guarda segue lo schema che si sta giocando.
  const inCompagnia = stato?.inCompagnia ?? null
  const ospitante = libera ? !!stato : !!stato && !g.finita && !inCompagnia
  const compagnia = useCompagniaHost(
    'cruciverba',
    libera ? 'libera' : 'classificata',
    ospitante,
    compagniaAperta,
    libera && stato ? { partitaId: stato.partitaId } : null,
  )
  const dentro = compagnia.compagnia?.ospiti.filter((o) => o.stato === 'dentro').length ?? 0
  // Chi gioca la giornata in compagnia non ha una griglia sua: la partita e' quella dell'host.
  useEffect(() => {
    if (inCompagnia) vai(ROTTE.insiemeA('cruciverba', inCompagnia.id), { replace: true, direzione: 'nessuna' })
  }, [inCompagnia, vai])
  const numeri = useMemo(
    () => numeriDelleCaselle(stato?.definizioni ?? []),
    [stato?.definizioni],
  )
  const parola = useMemo(() => new Set(g.corrente?.caselle ?? []), [g.corrente])
  const costi = useMemo(() => (stato ? costiCruciverba(stato.schema) : null), [stato?.schema])
  // Quel che svelerebbe la parola, come lo conta il server: le sue lettere non ancora svelate.
  const daSvelare = g.corrente ? caselleDaPagare(g.corrente.caselle, g.svelate).length : 0
  const letteraSvelata = g.selezione !== null && g.svelate.has(g.selezione.casella)
  const fogliAperti = aiuto || elenco || aiuti || compagniaAperta

  // La tastiera vera. Quando un foglio e' aperto le lettere non devono finire
  // nella griglia che sta dietro.
  const { scrivi, cancella, sposta, vaiAllaDefinizione, cambiaDirezione } = g
  useEffect(() => {
    if (!stato || g.finita || fogliAperti) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tasto = e.key.toLowerCase()
      if (isGameLetter(tasto)) {
        e.preventDefault()
        scrivi(tasto)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        cancella()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        sposta(0, -1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        sposta(0, 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        sposta(-1, 0)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        sposta(1, 0)
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        vaiAllaDefinizione(e.shiftKey ? -1 : 1)
      } else if (e.key === ' ') {
        e.preventDefault()
        cambiaDirezione()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stato, g.finita, fogliAperti, scrivi, cancella, sposta, vaiAllaDefinizione, cambiaDirezione])

  const scegli = useCallback(
    (d: DefinizioneCruciverba) => {
      const vuota = d.caselle.find((k) => g.lettere[k] === VUOTA) ?? d.caselle[0]
      g.seleziona(vuota, d.direzione)
      setElenco(false)
    },
    [g],
  )

  const aiutoScelto = (fai: () => void) => {
    setAiuti(false)
    fai()
  }

  // Un cruciverba appena completato si festeggia, uno riaperto gia' finito no.
  const festa = useFesta(stato ? !g.finita : null, g.finita)

  // I controlli e il completamento, al centro dello schermo.
  const { adesivo, accoda } = useCodaAdesivi()
  const controllo = g.ultimoControllo
  useEffect(() => {
    if (controllo) accoda(adesivoControllo(controllo))
  }, [accoda, controllo])
  const puntiRef = useRef(g.punti)
  puntiRef.current = g.punti
  useEffect(() => {
    if (festa) accoda(adesivoCompletato(puntiRef.current))
  }, [accoda, festa])

  // La carta della fine arriva dopo l'adesivo del completamento, e resta finché non la si chiude.
  const [cartaFine, setCartaFine] = useState(false)
  useEffect(() => {
    if (!festa) return
    const t = window.setTimeout(() => setCartaFine(true), ADESIVO_COMPLETATO_MS)
    return () => window.clearTimeout(t)
  }, [festa])
  const altro = useUnAltroSchema(stato)

  const nomeLivello = stato ? NOMI_LIVELLI_CRUCIVERBA[stato.livello ?? 'facile'] : ''
  const corrente = g.corrente

  return (
    <Pagina
      titolo="Cruciverba"
      sotto={libera ? `Libera${nomeLivello ? ` · ${nomeLivello}` : ''}` : 'Lo schema di oggi'}
      intera
      larga
      indietro={
        libera ? { a: ROTTE.libera('cruciverba'), etichetta: 'Cruciverba' } : { a: ROTTE.home, etichetta: 'Giornaliere' }
      }
      azioni={
        <>
          {ospitante && (
            <BottoneBarra etichetta="Gioca in compagnia" onClick={() => setCompagniaAperta(true)} badge={dentro}>
              <IconPeople size={21} />
            </BottoneBarra>
          )}
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      <div className="cru">
        {g.loadError ? (
          <div className="cru__ripiego">
            <p>{g.loadError}</p>
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          </div>
        ) : !stato ? (
          <div className="cru__attesa" aria-hidden="true" />
        ) : (
          <>
            <div className="cru__principale">
              <div className="cru__riga">
                <div className="cru__stato">
                  <span className="cru__tempo u-tabnum" aria-label={`Tempo di gioco ${formatCronometro(g.tempoMs)}`}>
                    <IconClock size={17} />
                    {formatCronometro(g.tempoMs)}
                  </span>
                  {/* Un messaggio prende il posto del livello e dei punti, nella stessa riga:
                      prima era una pillola sopra la griglia, e copriva le lettere. */}
                  {g.messaggio ? (
                    <span key={g.messaggio} className="cru__avviso" aria-live="polite">
                      {g.messaggio}
                    </span>
                  ) : (
                    <>
                      <span className="cru__livello">{nomeLivello}</span>
                      <span className="cru__valore u-tabnum">
                        {g.finita ? 'Punti' : 'Vale'} <strong>{g.punti}</strong>
                      </span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="cru__strumento"
                  onClick={() => setElenco(true)}
                  aria-label="Tutte le definizioni"
                  title="Tutte le definizioni"
                >
                  <IconList size={22} />
                </button>
                {!g.finita && (
                  <button
                    type="button"
                    className="cru__strumento is-aiuti"
                    onClick={() => setAiuti(true)}
                    disabled={g.inviando}
                    aria-label="Aiuti"
                    title="Aiuti"
                  >
                    <Segno d={SEGNI.salvagente} size={22} spessore={2.3} />
                  </button>
                )}
              </div>

              <div className="cru__campo">
                <Griglia
                  righe={stato.righe}
                  colonne={stato.colonne}
                  schema={stato.schema}
                  lettere={g.lettere}
                  numeri={numeri}
                  attiva={g.finita ? null : (g.selezione?.casella ?? null)}
                  parola={g.finita ? NESSUNA : parola}
                  svelate={g.svelate}
                  segnalate={g.segnalate}
                  onda={festa}
                  onTocca={g.tocca}
                />
              </div>

              {g.finita ? (
                <Esito
                  stato={stato}
                  libera={libera}
                  onRiepilogo={() => setCartaFine(true)}
                  onElenco={() => setElenco(true)}
                  altro={altro}
                />
              ) : (
                <>
                  {corrente && (
                    <BarraDefinizione
                      definizione={corrente}
                      onPrecedente={() => vaiAllaDefinizione(-1)}
                      onSuccessiva={() => vaiAllaDefinizione(1)}
                      onElenco={() => setElenco(true)}
                    />
                  )}
                  {/* I suggerimenti di chi gioca in compagnia: toccarne uno scrive la parola, che si
                      salva come le altre. Quel che resta nella griglia lo decide l'host. */}
                  {ospitante && (
                    <Suggerimenti
                      suggerimenti={compagnia.compagnia?.suggerimenti ?? []}
                      etichetta={(s) => etichettaCruciverba(s, stato.definizioni)}
                      onScegli={(s) => {
                        if (s.proposta.gioco !== 'cruciverba') return
                        const { definizione, parola } = s.proposta
                        const d = stato.definizioni.find((x) => x.chiave === definizione)
                        if (d) g.riempi(d, parola)
                      }}
                      disabled={g.inviando}
                    />
                  )}
                  <Tastiera
                    direzione={g.selezione?.direzione ?? 'o'}
                    disabled={false}
                    onLettera={g.scrivi}
                    onCancella={g.cancella}
                    onDirezione={g.cambiaDirezione}
                  />
                </>
              )}
            </div>

            <aside className="cru__laterale" aria-label="Definizioni">
              <ElencoDefinizioni
                definizioni={stato.definizioni}
                lettere={g.lettere}
                soluzione={stato.soluzione}
                corrente={corrente?.chiave ?? null}
                onScegli={scegli}
              />
            </aside>
          </>
        )}
      </div>

      <ComeSiGiocaCruciverba open={aiuto} onClose={() => setAiuto(false)} costi={costi} />

      <PannelloCompagnia
        gioco="cruciverba"
        modalita={libera ? 'libera' : 'classificata'}
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

      <Sheet open={elenco} onClose={() => setElenco(false)} title="Definizioni">
        {stato && (
          <ElencoDefinizioni
            definizioni={stato.definizioni}
            lettere={g.lettere}
            soluzione={stato.soluzione}
            corrente={corrente?.chiave ?? null}
            onScegli={scegli}
          />
        )}
      </Sheet>

      <FoglioAiuti open={aiuti} onClose={() => setAiuti(false)}>
        <AiutoVale>
          Adesso vale <strong className="u-tabnum">{g.punti}</strong> punti
        </AiutoVale>
        <AiutoVoce
          icona={<Segno d={SEGNI.lente} />}
          colore={COLORE_AIUTI}
          nome="Controlla la parola"
          costo={costi ? `${inPunti(costi.controllo)}, più ${costi.errore} per lettera sbagliata` : undefined}
          onClick={() => aiutoScelto(() => g.controlla('parola'))}
          disabled={!corrente}
        />
        <AiutoVoce
          icona={<Segno d={SEGNI.griglia} />}
          colore={COLORE_AIUTI}
          nome="Controlla tutto lo schema"
          costo={costi ? `${inPunti(costi.controlloSchema)}, più ${costi.errore} per lettera sbagliata` : undefined}
          onClick={() => aiutoScelto(() => g.controlla('tutto'))}
        />
        <AiutoVoce
          icona={<Segno d={SEGNI.occhio} />}
          colore={COLORE_AIUTI}
          nome="Svela la lettera"
          costo={costi && !letteraSvelata ? inPunti(costi.svelata) : undefined}
          onClick={() => aiutoScelto(() => g.svela('lettera'))}
          disabled={!g.selezione || letteraSvelata}
        />
        <AiutoVoce
          icona={<Segno d={SEGNI.parola} />}
          colore={COLORE_AIUTI}
          nome="Svela la parola"
          costo={costi && daSvelare > 0 ? prezzoDellaParola(costi.svelata, daSvelare) : undefined}
          onClick={() => aiutoScelto(() => g.svela('parola'))}
          disabled={!corrente || daSvelare === 0}
        />
      </FoglioAiuti>

      {stato && g.finita && (
        <CartaDelCruciverba
          aperta={cartaFine}
          stato={stato}
          libera={libera}
          altro={altro}
          onChiudi={() => setCartaFine(false)}
          onElenco={() => {
            setCartaFine(false)
            setElenco(true)
          }}
        />
      )}
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Il fondo dell'icona degli aiuti: l'azzurro chiaro del cruciverba. */
const COLORE_AIUTI = '#d2e1ff'

/** Un altro schema libero dello stesso livello, dalla fine di uno schema libero. */
function useUnAltroSchema(stato: CruciverbaState | null) {
  const { vai } = useNavigazione()
  const toast = useToast()
  const [cercando, setCercando] = useState(false)
  const apri = async () => {
    if (!stato) return
    setCercando(true)
    try {
      const nuovo = await api<CruciverbaState>('/cruciverba/libera', {
        method: 'POST',
        body: { livello: stato.livello ?? 'difficile' },
      })
      vai(ROTTE.cruciverbaLibero(nuovo.partitaId), { replace: true })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Non riesco ad aprire un altro schema.', 'error')
    } finally {
      setCercando(false)
    }
  }
  return { apri, cercando }
}

type UnAltro = ReturnType<typeof useUnAltroSchema>

/** Gli aiuti di uno schema finito, in parole: "2 lettere svelate · 1 controllo". */
function aiutiDi(stato: CruciverbaState): string[] {
  const svelate = stato.svelate.length
  const controlli = stato.controlli + stato.controlliSchema
  return [
    svelate > 0 && `${svelate} ${pluralize(svelate, 'lettera svelata', 'lettere svelate')}`,
    controlli > 0 && `${controlli} ${pluralize(controlli, 'controllo', 'controlli')}`,
    stato.errori > 0 && `${stato.errori} ${pluralize(stato.errori, 'errore segnalato', 'errori segnalati')}`,
  ].filter((a): a is string => Boolean(a))
}

/**
 * La carta della fine, sopra lo schema appena completato: il timbro con i
 * punti, il conto del tempo e degli aiuti, e dove andare.
 */
function CartaDelCruciverba({
  aperta,
  stato,
  libera,
  altro,
  onChiudi,
  onElenco,
}: {
  aperta: boolean
  stato: CruciverbaState
  libera: boolean
  altro: UnAltro
  onChiudi: () => void
  onElenco: () => void
}) {
  const { vai } = useNavigazione()
  const costi = costiCruciverba(stato.schema)
  const tempo = formatCronometro(stato.tempoMs)
  const pulito = aiutiDi(stato).length === 0
  return (
    <CartaFine
      aperta={aperta}
      onChiudi={onChiudi}
      gioco="cruciverba"
      colore="var(--cruciverba-tinta)"
      fondo={FONDO_FINE}
      titolo="Completato!"
      testo={`${libera && stato.livello ? `${NOMI_LIVELLI_CRUCIVERBA[stato.livello]} · ` : ''}in ${tempo} · ${
        pulito ? 'senza aiuti' : 'con gli aiuti'
      }`}
      timbro={`+${stato.punti}`}
      righe={[
        { nome: 'Il tempo', valore: `${tempo} · ${puntiDelTempoCruciverba(stato.tempoMs, costi)} punti` },
        { nome: 'Gli aiuti', valore: stato.spesi > 0 ? `−${stato.spesi}` : 'nessuno' },
      ]}
    >
      <BottoneFine largo onClick={onElenco}>
        Le definizioni e le voci
      </BottoneFine>
      {libera ? (
        <>
          <BottoneFine onClick={() => vai(ROTTE.libere, { direzione: 'indietro' })}>Esci</BottoneFine>
          <BottoneFine tono="pieno" onClick={() => void altro.apri()} disabled={altro.cercando}>
            Un altro schema
          </BottoneFine>
        </>
      ) : (
        <BottoneFine tono="giallo" largo onClick={() => vai(ROTTE.home, { direzione: 'indietro' })}>
          Torna alle Giornaliere
        </BottoneFine>
      )}
    </CartaFine>
  )
}

/** Cruciverba finito, sotto lo schema: i punti nel timbro, il tempo e gli aiuti, e cosa fare adesso. */
function Esito({
  stato,
  libera,
  altro,
  onRiepilogo,
  onElenco,
}: {
  stato: CruciverbaState
  libera: boolean
  altro: UnAltro
  onRiepilogo: () => void
  onElenco: () => void
}) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const aiuti = aiutiDi(stato)
  return (
    <div className="cru-esito">
      <div className="cru-esito__testa">
        <button type="button" className="cru-esito__timbro u-tabnum" onClick={onRiepilogo} aria-label="Il riepilogo">
          {stato.punti}
          <small>punti</small>
        </button>
        <div className="cru-esito__testo">
          <p className="cru-esito__titolo">Completato</p>
          <p className="cru-esito__dettaglio u-tabnum">
            {libera && stato.livello && `${NOMI_LIVELLI_CRUCIVERBA[stato.livello]} · `}
            in {formatCronometro(stato.tempoMs)}
            {aiuti.length > 0 ? ` · ${aiuti.join(' · ')}` : ' · senza aiuti'}
          </p>
        </div>
      </div>
      <div className="cru-esito__azioni">
        {libera ? (
          <Button onClick={() => void altro.apri()} loading={altro.cercando}>
            <IconShuffle size={17} /> Un altro schema
          </Button>
        ) : (
          <Collegamento to={ROTTE.classifica('cruciverba')} className="cru-esito__link">
            <IconTrophy size={18} />
            Classifica
          </Collegamento>
        )}
        <Button variant="tinted" onClick={onElenco}>
          Definizioni e fonti
        </Button>
      </div>
      <p className="cru-esito__attesa">
        {libera ? (
          'Gli schemi liberi non contano per la classifica.'
        ) : (
          <>
            Il prossimo fra <span className="u-tabnum">{formatCountdown(restano)}</span>
          </>
        )}
      </p>
    </div>
  )
}
