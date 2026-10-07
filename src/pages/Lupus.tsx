import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { CampoCodice } from '@/components/CampoCodice'
import { Copertina } from '@/components/Copertina'
import { Elenco, Riga, Sezione } from '@/components/Elementi'
import { IconClose, IconInfo, IconPlus } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { IconaLupus } from '@/games/lupus/Icone'
import { FoglioMazzo, FoglioRegole, RigheDellaPartita } from '@/games/lupus/Preparazione'
import { ComeSiGiocaLupus } from '@/games/lupus/Regole'
import {
  comincia,
  leggiPreparazione,
  leggiTelefono,
  NOME_MASSIMO,
  nomiDellaPartita,
  problemaDellaPreparazione,
  salvaPreparazione,
  salvaTelefono,
  type Preparazione,
} from '@/games/lupus/telefono'
import { ApiFetchError, api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { usePresenza } from '@/lib/presenza'
import type { PartitaLupus } from '@shared/lupus'
import { semeACaso } from '@shared/lupus-caso'
import { GIOCATORI_MASSIMI, GIOCATORI_MINIMI } from '@shared/lupus-composizione'
import { LUNGHEZZA_CODICE_LUPUS, type StanzaLupusBreve, type VistaStanzaLupus } from '@shared/lupus-stanza'
import '@/games/lupus/Lupus.css'

type Modo = 'telefono' | 'online'

/** Le stesse chiavi di `salaDi` in amici.ts, che apre la sala dalla parte delle stanze. */
const CHIAVE_MODO = 'giochi.lupus.modo'

function leggiModo(): Modo {
  try {
    return localStorage.getItem(CHIAVE_MODO) === 'online' ? 'online' : 'telefono'
  } catch {
    return 'telefono'
  }
}

/** La prima volta il primo nome e' quello di chi ha il telefono: di solito gioca anche lui. */
function preparazioneDi(io: string): Preparazione {
  const p = leggiPreparazione()
  if (p.nomi.some((n) => n.trim())) return p
  return { ...p, nomi: [io.slice(0, NOME_MASSIMO), ...p.nomi.slice(1)] }
}

/**
 * La sala di Lupus. In cima si sceglie come giocare, e la scelta si ricorda:
 * **un telefono**, che passa di mano e fa da moderatore — si scrivono i nomi
 * in senso orario, si sceglie il mazzo e le regole, e via — oppure **online**,
 * ognuno dal suo telefono, in una stanza con un codice di quattro lettere.
 * Se si e' gia' in una stanza, la si ritrova in cima.
 */
export default function Lupus() {
  const { vai } = useNavigazione()
  const io = usePlayer()
  const { dati: presenza } = usePresenza()
  const [modo, setModo] = useState<Modo>(leggiModo)
  const [regoleDelGioco, setRegoleDelGioco] = useState(false)

  const scegliModo = (m: Modo) => {
    setModo(m)
    try {
      localStorage.setItem(CHIAVE_MODO, m)
    } catch {
      /* la scelta vale per questa visita */
    }
  }

  const stanza = presenza?.stanzaLupus ?? null

  return (
    <Pagina
      titolo="Lupus"
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      eroe={<Copertina gioco="lupus" formato="eroe" />}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegoleDelGioco(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {stanza && <StanzaAperta stanza={stanza} onApri={() => vai(ROTTE.stanzaLupus(stanza.codice))} />}

      <SegmentedControl
        ariaLabel="Come giocare"
        value={modo}
        onChange={scegliModo}
        options={[
          { value: 'telefono', label: 'Un telefono' },
          { value: 'online', label: 'Online' },
        ]}
      />

      {modo === 'telefono' ? <UnTelefono io={io.displayName} /> : <Online stanza={stanza} />}

      <ComeSiGiocaLupus open={regoleDelGioco} onClose={() => setRegoleDelGioco(false)} />
    </Pagina>
  )
}

/** La stanza in cui si e', per tornarci. */
function StanzaAperta({ stanza, onApri }: { stanza: StanzaLupusBreve; onApri: () => void }) {
  const stato =
    stanza.stato === 'partita' ? 'Partita in corso' : stanza.stato === 'finita' ? 'Partita finita' : 'In attesa'
  const quanti = stanza.iscritti === 1 ? '1 giocatore' : `${stanza.iscritti} giocatori`
  return (
    <button type="button" className="lupus-aperta" onClick={onApri}>
      <span className="lupus-aperta__icona" aria-hidden="true">
        <IconaLupus nome="luna" size={24} />
      </span>
      <span className="lupus-aperta__testo">
        <span className="lupus-aperta__titolo">Stanza {stanza.codice}</span>
        <span className="lupus-aperta__stato">
          {stato} · {quanti}
        </span>
      </span>
      <span className="lupus-aperta__vai">Torna</span>
    </button>
  )
}

/* ─────────────────────────────  Un telefono  ───────────────────────────── */

/** A che punto e' una partita, per la riga che la riprende. */
/** A che punto e' una partita lasciata a meta', per la riga che la riprende. */
function quandoDi(p: PartitaLupus): string {
  if (p.fase === 'ruoli') return `I ruoli · ${p.giocatori.length} giocatori`
  const vivi = p.giocatori.filter((g) => g.vivo).length
  return `${p.fase === 'notte' ? `Notte ${p.notte}` : `Giorno ${p.giorno}`} · ${vivi} in vita`
}

function UnTelefono({ io }: { io: string }) {
  const { vai } = useNavigazione()
  const [prep, setPrep] = useState<Preparazione>(() => preparazioneDi(io))
  const [foglio, setFoglio] = useState<'mazzo' | 'regole' | null>(null)
  const [conferma, setConferma] = useState(false)
  const [inCorso, setInCorso] = useState(() => {
    const t = leggiTelefono()
    return t && t.partita.fase !== 'finita' ? t : null
  })

  useEffect(() => salvaPreparazione(prep), [prep])

  // La partita si puo' cambiare da un'altra scheda: si rilegge tornando qui.
  useEffect(() => {
    const rileggi = () => {
      if (document.visibilityState !== 'visible') return
      const t = leggiTelefono()
      setInCorso(t && t.partita.fase !== 'finita' ? t : null)
    }
    document.addEventListener('visibilitychange', rileggi)
    return () => document.removeEventListener('visibilitychange', rileggi)
  }, [])

  const giocatori = nomiDellaPartita(prep.nomi).length
  const problema = problemaDellaPreparazione(prep)

  const via = () => {
    salvaTelefono(comincia(prep, semeACaso(), Date.now()))
    setConferma(false)
    vai(ROTTE.telefonoLupus)
  }

  const p = inCorso?.partita
  return (
    <>
      {p && (
        <Elenco>
          <Riga
            icona={<span className="lupus-segno-vivo" aria-hidden="true" />}
            titolo="Riprendi la partita"
            sotto={quandoDi(p)}
            a={ROTTE.telefonoLupus}
          />
        </Elenco>
      )}

      <Sezione titolo="Giocatori" nota="In senso orario, come siete seduti.">
        <EditorNomi nomi={prep.nomi} onCambia={(nomi) => setPrep((x) => ({ ...x, nomi }))} />
      </Sezione>

      <Sezione titolo="Partita">
        <RigheDellaPartita
          giocatori={giocatori}
          composizione={prep.composizione}
          regole={prep.regole}
          onMazzo={() => setFoglio('mazzo')}
          onRegole={() => setFoglio('regole')}
        />
      </Sezione>

      <div className="lupus-via">
        {problema && <p className="lupus-via__perche">{problema}</p>}
        <Button size="lg" fullWidth disabled={problema !== null} onClick={() => (p ? setConferma(true) : via())}>
          {giocatori >= GIOCATORI_MINIMI ? `Comincia con ${giocatori} giocatori` : 'Comincia'}
        </Button>
      </div>

      <FoglioMazzo
        open={foglio === 'mazzo'}
        onClose={() => setFoglio(null)}
        giocatori={giocatori}
        composizione={prep.composizione}
        onCambia={(composizione) => setPrep((x) => ({ ...x, composizione }))}
      />
      <FoglioRegole
        open={foglio === 'regole'}
        onClose={() => setFoglio(null)}
        regole={prep.regole}
        onCambia={(regole) => setPrep((x) => ({ ...x, regole }))}
      />

      <Sheet open={conferma} onClose={() => setConferma(false)} title="Una partita nuova?">
        <div className="lupus-foglio">
          <p className="lupus-foglio__testo">Quella in corso non si potrà più riprendere.</p>
          <Button variant="destructive" size="lg" fullWidth onClick={via}>
            Comincia la nuova
          </Button>
          <Button
            variant="plain"
            size="lg"
            fullWidth
            onClick={() => {
              setConferma(false)
              vai(ROTTE.telefonoLupus)
            }}
          >
            Riprendi quella in corso
          </Button>
        </div>
      </Sheet>
    </>
  )
}

/** I nomi dei giocatori, uno per riga, con il loro posto. Invio passa alla riga dopo, e in fondo ne aggiunge una. */
function EditorNomi({ nomi, onCambia }: { nomi: string[]; onCambia: (nomi: string[]) => void }) {
  const lista = useRef<HTMLDivElement>(null)
  const metti = (i: number, nome: string) => onCambia(nomi.map((n, j) => (j === i ? nome : n)))
  const togli = (i: number) => onCambia(nomi.filter((_, j) => j !== i))
  const aggiungi = () => {
    onCambia([...nomi, ''])
    const ultimo = () => lista.current?.querySelector<HTMLInputElement>('.lupus-nomi__riga:last-of-type input')
    window.setTimeout(() => ultimo()?.focus(), 0)
  }
  const invio = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const campi = lista.current?.querySelectorAll<HTMLInputElement>('input') ?? []
    if (i < campi.length - 1) campi[i + 1].focus()
    else if (nomi.length < GIOCATORI_MASSIMI) aggiungi()
  }
  return (
    <div className="lupus-nomi" ref={lista}>
      {nomi.map((nome, i) => (
        <div key={i} className="lupus-nomi__riga">
          <span className="lupus-nomi__posto u-tabnum" aria-hidden="true">
            {i + 1}
          </span>
          <input
            className="lupus-nomi__campo"
            value={nome}
            placeholder={`Giocatore ${i + 1}`}
            aria-label={`Giocatore ${i + 1}`}
            maxLength={NOME_MASSIMO}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            onChange={(e) => metti(i, e.target.value)}
            onKeyDown={invio(i)}
          />
          <button
            type="button"
            className="lupus-nomi__togli"
            aria-label={`Togli il giocatore ${i + 1}`}
            disabled={nomi.length <= GIOCATORI_MINIMI}
            onClick={() => togli(i)}
          >
            <IconClose size={16} />
          </button>
        </div>
      ))}
      {nomi.length < GIOCATORI_MASSIMI && (
        <button type="button" className="lupus-nomi__aggiungi" onClick={aggiungi}>
          <IconPlus size={18} /> Aggiungi un giocatore
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────  Online  ───────────────────────────── */

function Online({ stanza }: { stanza: StanzaLupusBreve | null }) {
  const { vai } = useNavigazione()
  const toast = useToast()
  const { aggiorna } = usePresenza()
  const [codice, setCodice] = useState('')
  const [invio, setInvio] = useState<'crea' | 'entra' | null>(null)

  const crea = async () => {
    setInvio('crea')
    try {
      const v = await api<VistaStanzaLupus>('/lupus/stanze', { method: 'POST' })
      aggiorna()
      vai(ROTTE.stanzaLupus(v.codice))
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco a creare la stanza.', 'error')
    } finally {
      setInvio(null)
    }
  }

  const entra = async (c: string) => {
    if (c.length !== LUNGHEZZA_CODICE_LUPUS || invio) return
    setInvio('entra')
    try {
      await api<VistaStanzaLupus>(`/lupus/stanze/${c}/entra`, { method: 'POST' })
      aggiorna()
      vai(ROTTE.stanzaLupus(c))
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco a entrare.', 'error')
    } finally {
      setInvio(null)
    }
  }

  return (
    <>
      <Button size="lg" fullWidth loading={invio === 'crea'} disabled={invio !== null} onClick={() => void crea()}>
        <IconPlus size={18} /> {stanza ? 'Crea una stanza nuova' : 'Crea una stanza'}
      </Button>

      <Sezione titolo="Entra con un codice">
        <CampoCodice
          id="lupus-codice"
          etichetta="Il codice della stanza"
          valore={codice}
          onCambia={setCodice}
          onCompleto={(c) => void entra(c)}
          lunghezza={LUNGHEZZA_CODICE_LUPUS}
          lettere
          disabled={invio === 'entra'}
        />
        <Button
          variant="tinted"
          size="lg"
          fullWidth
          loading={invio === 'entra'}
          disabled={codice.length !== LUNGHEZZA_CODICE_LUPUS || invio !== null}
          onClick={() => void entra(codice)}
        >
          Entra
        </Button>
      </Sezione>
    </>
  )
}
