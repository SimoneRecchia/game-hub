import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Elenco, Riga, Sezione, Tacche, Vuoto } from '@/components/Elementi'
import { IconCopy, IconInfo, IconShare } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { ComeSiGiocaBattaglia } from '@/games/battaglia/ComeSiGioca'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { DOVE } from '@/lib/presenza'
import { LIVELLI_BATTAGLIA, type LivelloBattaglia } from '@shared/battaglia-computer'
import { BATTAGLIA_POLL_LOBBY_MS } from '@shared/config'
import type {
  GiocatoreOnline,
  InvitoInviato,
  LinkBattaglia,
  LobbyBattaglia,
  PartitaBreve,
  VistaBattaglia,
} from '@shared/types'
import './Battaglia.css'

/** Senza niente in sospeso la sala si rilegge di rado: serve solo a vedere chi entra. */
const RITMO_TRANQUILLO_MS = 12_000

const NOMI: Record<LivelloBattaglia, string> = { facile: 'Facile', normale: 'Normale', difficile: 'Difficile' }

type Contro = 'computer' | 'amico'
const CHIAVE_CONTRO = 'battaglia.contro'

/** Contro chi si gioca: quello dell'ultima volta, come nelle sale dei giochi da tavolo. */
function leggiContro(): Contro {
  try {
    return localStorage.getItem(CHIAVE_CONTRO) === 'amico' ? 'amico' : 'computer'
  } catch {
    return 'computer'
  }
}

function salvaContro(c: Contro): void {
  try {
    localStorage.setItem(CHIAVE_CONTRO, c)
  } catch {
    // E' una comodita'.
  }
}

/**
 * La battaglia libera: contro il computer a tre livelli, o contro un amico. Un
 * interruttore sceglie quale, come nelle sale dei giochi da tavolo, e si vede
 * solo quel che serve a quella.
 *
 * Un amico si sfida in due modi. Se e' online, dall'elenco: gli arriva la sfida
 * in qualunque schermata sia. Se no, con un **link**: lo si manda come si
 * vuole, e chi lo apre — anche senza un account, dopo la registrazione — entra
 * nella partita. In tutti e due i casi, quando l'altro accetta, questa pagina
 * porta nella partita da sola.
 */
export default function BattagliaLibera() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const [dati, setDati] = useState<LobbyBattaglia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState<string | null>(null)
  const [aiuto, setAiuto] = useState(false)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [conferma, setConferma] = useState<LivelloBattaglia | null>(null)
  const [contro, setContro] = useState<Contro>(leggiContro)
  /** La partita fra amici vista al giro prima: quando ne compare una nuova, ci si entra. */
  const vista = useRef<string | null | undefined>(undefined)

  const carica = useCallback(async () => {
    try {
      const nuovi = await api<LobbyBattaglia>('/battaglia/lobby')
      setDati(nuovi)
      setErrore(null)
      const id = nuovi.partita?.id ?? null
      if (vista.current !== undefined && id && id !== vista.current) {
        // La sfida o il link sono stati accettati: si va alla partita.
        vai(ROTTE.partitaBattaglia(id))
      }
      vista.current = id
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare le partite.')
    }
  }, [vai])

  const inAttesa = dati?.inviti.find((i) => i.stato === 'attesa') ?? null
  const aspetto = Boolean(inAttesa || dati?.link)

  useEffect(() => {
    void carica()
  }, [carica])

  // Stretto quando si aspetta una risposta, largo quando si guarda e basta.
  useEffect(() => {
    const giro = setInterval(
      () => {
        if (document.visibilityState === 'visible') void carica()
      },
      aspetto ? BATTAGLIA_POLL_LOBBY_MS : RITMO_TRANQUILLO_MS,
    )
    const onVisibilita = () => {
      if (document.visibilityState === 'visible') void carica()
    }
    document.addEventListener('visibilitychange', onVisibilita)
    return () => {
      clearInterval(giro)
      document.removeEventListener('visibilitychange', onVisibilita)
    }
  }, [aspetto, carica])

  const controComputer = async (livello: LivelloBattaglia) => {
    setConferma(null)
    setInvio(livello)
    try {
      const partita = await api<VistaBattaglia>('/battaglia/computer', { method: 'POST', body: { livello } })
      vai(ROTTE.partitaBattaglia(partita.id))
    } catch (err) {
      toast.show(err instanceof ApiFetchError ? err.message : 'Non riesco a iniziare la partita.', 'error')
    } finally {
      setInvio(null)
    }
  }

  const scegliLivello = (livello: LivelloBattaglia) => {
    // Una partita contro il computer gia' in battaglia si chiuderebbe persa: prima si chiede.
    if (dati?.computer && dati.computer.stato === 'battaglia') setConferma(livello)
    else void controComputer(livello)
  }

  const sfida = async (g: GiocatoreOnline) => {
    setInvio(g.playerId)
    setAvviso(null)
    try {
      await api('/battaglia/sfida', { method: 'POST', body: { playerId: g.playerId } })
      await carica()
    } catch (err) {
      setAvviso(err instanceof ApiFetchError ? err.message : 'Non riesco a mandare la sfida.')
    } finally {
      setInvio(null)
    }
  }

  const annulla = async (invito: InvitoInviato) => {
    await api(`/battaglia/sfide/${invito.id}/annulla`, { method: 'POST' }).catch(() => {})
    await carica()
  }

  const creaLink = async () => {
    setInvio('link')
    try {
      const link = await api<LinkBattaglia>('/battaglia/link', { method: 'POST' })
      setDati((prima) => (prima ? { ...prima, link } : prima))
      await condividi(link, toast.show)
    } catch (err) {
      toast.show(err instanceof ApiFetchError ? err.message : 'Non riesco a creare il link.', 'error')
    } finally {
      setInvio(null)
    }
  }

  const ritiraLink = async () => {
    await api('/battaglia/link/annulla', { method: 'POST' }).catch(() => {})
    setDati((prima) => (prima ? { ...prima, link: null } : prima))
  }

  // L'esito dell'ultima sfida, se e' andata male: si dice, una volta.
  const ultima = dati?.inviti[0] ?? null
  const esitoUltima =
    ultima && !inAttesa && (ultima.stato === 'rifiutato' || ultima.stato === 'scaduto') ? ultima : null

  // Una sfida che aspetta risposta, o un link aperto, si vedono anche se l'ultima volta si era scelto il computer.
  const mostrata: Contro = aspetto ? 'amico' : contro

  return (
    <Pagina
      titolo="Battaglia navale"
      indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {errore && !dati ? (
        <Vuoto
          titolo="Le partite non si sono caricate"
          testo={errore}
          azione={
            <Button variant="tinted" onClick={() => void carica()}>
              Riprova
            </Button>
          }
        />
      ) : !dati ? (
        <div className="bat__attesa" aria-hidden="true" />
      ) : (
        <>
          {dati.partita && <PartitaAperta partita={dati.partita} />}

          <SegmentedControl
            ariaLabel="Contro chi"
            value={mostrata}
            onChange={(c) => {
              setContro(c)
              salvaContro(c)
            }}
            options={[
              { value: 'computer', label: 'Computer' },
              { value: 'amico', label: 'Amico' },
            ]}
          />

          {mostrata === 'computer' ? (
            <Sezione titolo="Difficoltà">
              <Elenco>
                {dati.computer && (
                  <Riga
                    icona={<span className="bat-riga__onda" aria-hidden="true" />}
                    titolo="Riprendi la partita"
                    sotto={dati.computer.stato === 'disposizione' ? 'Flotta da disporre' : 'Tocca a te'}
                    a={ROTTE.partitaBattaglia(dati.computer.id)}
                  />
                )}
                {LIVELLI_BATTAGLIA.map((livello, i) => {
                  const conti = dati.controComputer[livello]
                  const giocate = conti.vinte + conti.perse
                  return (
                    <Riga
                      key={livello}
                      icona={<Tacche piene={i + 1} colore="var(--battaglia-1)" />}
                      titolo={invio === livello ? `${NOMI[livello]}…` : NOMI[livello]}
                      valore={giocate > 0 ? `${conti.vinte}/${giocate}` : undefined}
                      onClick={invio ? undefined : () => scegliLivello(livello)}
                    />
                  )
                })}
              </Elenco>
            </Sezione>
          ) : (
            <Sezione titolo="Invita">
              {dati.link ? (
                <LinkAttivo link={dati.link} onRitira={() => void ritiraLink()} />
              ) : (
                <Button
                  variant="tinted"
                  size="lg"
                  fullWidth
                  onClick={() => void creaLink()}
                  loading={invio === 'link'}
                  disabled={Boolean(dati.partita) || (invio !== null && invio !== 'link')}
                >
                  <IconShare size={18} /> Invita con un link
                </Button>
              )}

              {inAttesa && <SfidaInAttesa invito={inAttesa} onAnnulla={() => void annulla(inAttesa)} />}

              {esitoUltima && (
                <p className="bat-sala__esito">
                  {esitoUltima.stato === 'rifiutato'
                    ? `${esitoUltima.a.displayName} ha rifiutato la sfida.`
                    : `${esitoUltima.a.displayName} non ha risposto in tempo.`}
                </p>
              )}

              {avviso && <p className="bat-sala__avviso">{avviso}</p>}

              <p className="bat-sala__titolo">Online</p>
              {dati.giocatori.length === 0 ? (
                <p className="bat-sala__vuoto">Nessuno online.</p>
              ) : (
                <ul className="bat-sala__elenco">
                  {dati.giocatori.map((g) => (
                    <li key={g.playerId} className="bat-sala__giocatore">
                      <Avatar nickname={g.nickname} color={g.avatarColor} size={40} />
                      <span className="bat-sala__chi">
                        <span className="bat-sala__nome">{g.displayName}</span>
                        <span className="bat-sala__dove">{g.occupato ? 'sta combattendo' : DOVE[g.attivita]}</span>
                      </span>
                      <Button
                        variant={g.invitato ? 'plain' : 'tinted'}
                        disabled={g.occupato || g.invitato || Boolean(dati.partita) || invio !== null}
                        loading={invio === g.playerId}
                        onClick={() => void sfida(g)}
                      >
                        {g.invitato ? 'Sfidato' : 'Sfida'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Sezione>
          )}
        </>
      )}

      <ComeSiGiocaBattaglia open={aiuto} onClose={() => setAiuto(false)} />

      <Sheet open={conferma !== null} onClose={() => setConferma(null)} title="Una partita nuova?">
        <div className="bat-resa">
          <p>Se ne cominci un’altra, quella in corso conta come persa.</p>
          <Button
            variant="destructive"
            size="lg"
            fullWidth
            onClick={() => conferma && void controComputer(conferma)}
          >
            Comincia la nuova
          </Button>
          <Button
            variant="plain"
            size="lg"
            fullWidth
            onClick={() => {
              setConferma(null)
              if (dati?.computer) vai(ROTTE.partitaBattaglia(dati.computer.id))
            }}
          >
            Riprendi quella in corso
          </Button>
        </div>
      </Sheet>
    </Pagina>
  )
}

/** La partita aperta con un amico: in cima, perché e' la prima cosa da fare. */
function PartitaAperta({ partita }: { partita: PartitaBreve }) {
  const { vai } = useNavigazione()
  return (
    <button type="button" className="bat-sala__partita" onClick={() => vai(ROTTE.partitaBattaglia(partita.id))}>
      <Avatar nickname={partita.avversario.nickname} color={partita.avversario.avatarColor} size={44} />
      <span className="bat-sala__partita-testo">
        <span className="bat-sala__partita-titolo">Battaglia con {partita.avversario.displayName}</span>
        <span className="bat-sala__partita-stato">
          {partita.stato === 'disposizione'
            ? 'Si dispongono le flotte'
            : partita.tuoTurno
              ? 'Tocca a te'
              : `Tocca a ${partita.avversario.displayName}`}
        </span>
      </span>
      <span className="bat-sala__riprendi">Riprendi</span>
    </button>
  )
}

function indirizzoDi(link: LinkBattaglia): string {
  return `${window.location.origin}${ROTTE.invitoBattaglia(link.codice)}`
}

/**
 * Condivide il link con il foglio di sistema, dove c'e' — su un telefono e'
 * WhatsApp, Messaggi, la posta — e altrimenti lo copia.
 */
async function condividi(link: LinkBattaglia, avvisa: (testo: string) => void) {
  const url = indirizzoDi(link)
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Battaglia navale', text: 'Ti sfido a battaglia navale!', url })
      return
    } catch (err) {
      // Chiuso il foglio senza scegliere: non e' un errore, e non si copia di nascosto.
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  await copia(url, avvisa)
}

async function copia(url: string, avvisa: (testo: string) => void) {
  try {
    await navigator.clipboard.writeText(url)
    avvisa('Link copiato')
  } catch {
    avvisa('Non riesco a copiare: tieni premuto il link.')
  }
}

/** Il link in attesa: l'indirizzo, i due modi di mandarlo, quanto vale ancora. */
function LinkAttivo({ link, onRitira }: { link: LinkBattaglia; onRitira: () => void }) {
  const toast = useToast()
  const restano = useCountdown(link.scadeTraMs)
  const url = indirizzoDi(link)
  return (
    <div className="bat-link bat-link--attivo" aria-live="polite">
      <div className="bat-link__riga">
        <span className="bat-sala__onde" aria-hidden="true" />
        <p className="bat-link__titolo">Aspetto che qualcuno apra il link…</p>
      </div>
      <p className="bat-link__url" title={url}>
        {url.replace(/^https?:\/\//, '')}
      </p>
      <div className="bat-link__azioni">
        <Button onClick={() => void condividi(link, toast.show)}>
          <IconShare size={18} /> Condividi
        </Button>
        <Button variant="tinted" onClick={() => void copia(url, toast.show)}>
          <IconCopy size={18} /> Copia
        </Button>
      </div>
      <p className="bat-link__nota">
        Scade fra {restano > 2 * 3_600_000 ? `${Math.floor(restano / 3_600_000)} ore` : formatCronometro(restano)}.{' '}
        <button type="button" className="bat-link__ritira" onClick={onRitira}>
          Ritira il link
        </button>
      </p>
    </div>
  )
}

function SfidaInAttesa({ invito, onAnnulla }: { invito: InvitoInviato; onAnnulla: () => void }) {
  const restano = useCountdown(invito.scadeTraMs)
  return (
    <div className="bat-sala__in-attesa" aria-live="polite">
      <span className="bat-sala__onde" aria-hidden="true" />
      <p className="bat-sala__in-attesa-testo">
        Aspetto la risposta di <strong>{invito.a.displayName}</strong>…
        <span className="bat-sala__scadenza u-tabnum"> {formatCronometro(restano)}</span>
      </p>
      <Button variant="plain" onClick={onAnnulla}>
        Annulla
      </Button>
    </div>
  )
}
