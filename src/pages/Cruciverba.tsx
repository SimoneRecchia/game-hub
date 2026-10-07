import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { FoglioAiuti, VoceAiuto } from '@/components/Aiuti'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { Sheet } from '@/components/Sheet'
import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconInfo,
  IconPeople,
  IconShuffle,
  IconTrophy,
} from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { api } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { ComeSiGiocaCruciverba } from '@/games/cruciverba/ComeSiGioca'
import { adesivoCompletato, adesivoControllo } from '@/games/cruciverba/adesivi'
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
import { VUOTA, caselleBianche, costiCruciverba, numeriDelleCaselle } from '@shared/cruciverba'
import { isGameLetter } from '@shared/wordle'
import type { CruciverbaState, DefinizioneCruciverba } from '@shared/types'
import './Cruciverba.css'

const NOMI_DIREZIONE = { o: 'orizzontale', v: 'verticale' } as const

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
  const bianche = stato ? caselleBianche(stato.schema) : 0
  const costi = useMemo(() => (stato ? costiCruciverba(stato.schema) : null), [stato?.schema])
  const scritte = useMemo(
    () => [...g.lettere].filter((l) => l !== VUOTA && l !== '#').length,
    [g.lettere],
  )
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

  return (
    <Pagina
      titolo={
        stato
          ? libera
            ? `Schema libero n. ${stato.puzzleNumber}`
            : `Cruciverba #${stato.puzzleNumber}`
          : 'Cruciverba'
      }
      intera
      larga
      indietro={libera ? { a: ROTTE.libere, etichetta: 'Libere' } : { a: ROTTE.home, etichetta: 'Giornaliere' }}
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
              <div className="cru__stato">
                <span className="cru__tempo u-tabnum" aria-label="Tempo di gioco">
                  <IconClock size={14} />
                  {formatCronometro(g.tempoMs)}
                </span>
                {/* Un messaggio prende il posto di punti e caselle, nella stessa riga:
                    prima era una pillola sopra la griglia, e copriva le lettere. */}
                {g.messaggio ? (
                  <span key={g.messaggio} className="cru__avviso" aria-live="polite">
                    {g.messaggio}
                  </span>
                ) : (
                  <>
                    <span className="cru__punti u-tabnum">
                      {g.punti} <span className="cru__punti-label">punti</span>
                    </span>
                    <span className="cru__avanzamento u-tabnum" aria-label={`${scritte} caselle scritte su ${bianche}`}>
                      <span className="cru__avanzamento-barra" aria-hidden="true">
                        <span style={{ transform: `scaleX(${bianche > 0 ? scritte / bianche : 0})` }} />
                      </span>
                      {scritte}/{bianche}
                    </span>
                  </>
                )}
                {!g.finita && (
                  <button
                    type="button"
                    className="cru__aiuti"
                    onClick={() => setAiuti(true)}
                    disabled={g.inviando}
                  >
                    Aiuti
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
                  onTocca={g.tocca}
                />
              </div>

              {g.finita ? (
                <Fine stato={stato} libera={libera} onElenco={() => setElenco(true)} />
              ) : (
                <>
                  {g.corrente && (
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
                          {g.corrente.numero} {NOMI_DIREZIONE[g.corrente.direzione]}
                        </span>
                        <span className="cbarra__definizione">
                          {g.corrente.testo}
                          {g.corrente.nota && (
                            <span className="cbarra__nota">{g.corrente.nota}</span>
                          )}
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
                corrente={g.corrente?.chiave ?? null}
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
            corrente={g.corrente?.chiave ?? null}
            onScegli={scegli}
          />
        )}
      </Sheet>

      <FoglioAiuti
        open={aiuti}
        onClose={() => setAiuti(false)}
        nota={
          <>
            Adesso il cruciverba vale <strong>{g.punti} punti</strong>.
          </>
        }
      >
        <VoceAiuto
          nome="Controlla la parola"
          costo={costi ? `${inPunti(costi.errore)} per lettera sbagliata` : undefined}
          onClick={() => aiutoScelto(() => g.controlla('parola'))}
          disabled={!g.corrente}
        />
        <VoceAiuto
          nome="Controlla tutto lo schema"
          costo={costi ? `${inPunti(costi.errore)} per lettera sbagliata` : undefined}
          onClick={() => aiutoScelto(() => g.controlla('tutto'))}
        />
        <VoceAiuto
          nome="Svela la lettera"
          costo={costi ? `${inPunti(costi.svelata)} se manca o è sbagliata` : undefined}
          onClick={() => aiutoScelto(() => g.svela('lettera'))}
          disabled={!g.selezione}
        />
        <VoceAiuto
          nome="Svela la parola"
          costo={costi ? `${inPunti(costi.svelata)} per lettera mancante o sbagliata` : undefined}
          onClick={() => aiutoScelto(() => g.svela('parola'))}
          disabled={!g.corrente}
        />
      </FoglioAiuti>
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Cruciverba finito: i punti, il tempo, cosa e' costato, e cosa fare adesso. */
function Fine({ stato, libera, onElenco }: { stato: CruciverbaState; libera: boolean; onElenco: () => void }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const { vai } = useNavigazione()
  const toast = useToast()
  const [cercando, setCercando] = useState(false)
  const svelate = stato.svelate.length
  const aiuti = [
    svelate > 0 && `${svelate} ${pluralize(svelate, 'lettera svelata', 'lettere svelate')}`,
    stato.errori > 0 &&
      `${stato.errori} ${pluralize(stato.errori, 'errore segnalato', 'errori segnalati')}`,
  ].filter(Boolean)

  const unAltro = async () => {
    setCercando(true)
    try {
      const nuovo = await api<CruciverbaState>('/cruciverba/libera', { method: 'POST' })
      vai(ROTTE.cruciverbaLibero(nuovo.partitaId), { replace: true })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Non riesco ad aprire un altro schema.', 'error')
    } finally {
      setCercando(false)
    }
  }

  return (
    <div className="cru__fine">
      <p className="cru__fine-titolo">Completato</p>
      <p className="cru__fine-punti u-tabnum">{stato.punti} punti</p>
      <p className="cru__fine-dettaglio u-tabnum">
        in {formatCronometro(stato.tempoMs)}
        {aiuti.length > 0 ? ` · ${aiuti.join(' · ')}` : ' · senza aiuti'}
      </p>
      <div className="cru__fine-azioni">
        {libera ? (
          <Button onClick={() => void unAltro()} loading={cercando}>
            <IconShuffle size={17} /> Un altro schema
          </Button>
        ) : (
          <Collegamento to={ROTTE.classifica('cruciverba')} className="cru__fine-link">
            <IconTrophy size={18} />
            Classifica
          </Collegamento>
        )}
        <Button variant="tinted" onClick={onElenco}>
          Definizioni e fonti
        </Button>
      </div>
      <p className="cru__fine-attesa">
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
