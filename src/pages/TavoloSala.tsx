import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Elenco, Riga, Sezione, Tacche, Vuoto } from '@/components/Elementi'
import { IconCopy, IconInfo, IconShare } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { giocoTavoloDi } from '@/games/catalog'
import { ComeSiGiocaTavoliere } from '@/games/tavolo/ComeSiGioca'
import { A_GIOCO, nomeVariante } from '@/games/tavolo/nomi'
import {
  abbandona,
  cominciata,
  leggiConti,
  leggiContro,
  leggiPartita,
  leggiVariante,
  nuovaPartita,
  salvaContro,
  salvaVariante,
  type Contro,
} from '@/games/tavolo/locale'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { DOVE, usePresenza } from '@/lib/presenza'
import { BATTAGLIA_POLL_LOBBY_MS } from '@shared/config'
import { LIVELLI_TAVOLIERE, type GiocoTavoliere, type LivelloTavoliere } from '@shared/tavolo'
import { regoleDi } from '@shared/tavolo-regole'
import type { InvitoTavoloMandato, PartitaTavoloBreve, SalaTavolo } from '@shared/types'
import './Battaglia.css'
import './Tavolo.css'

/** Senza niente in sospeso la sala si rilegge di rado: serve solo a vedere chi entra. */
const RITMO_TRANQUILLO_MS = 12_000

export const NOMI_LIVELLI: Record<LivelloTavoliere, string> = {
  facile: 'Facile',
  normale: 'Normale',
  difficile: 'Difficile',
}

/**
 * La sala di un gioco da tavoliere — scacchi, dama, Forza 4, go — con le due cose
 * che si possono fare: una partita contro il computer, che sta nel telefono, o
 * una con un amico, online o con un link. Un interruttore sceglie quale, e si
 * vede solo quel che serve a quella: la difficoltà contro il computer, gli
 * inviti con un amico. Il colore non si sceglie: contro il computer cambia a
 * ogni partita, fra amici lo pesca il server. Quando l'amico accetta, la sala
 * porta tutti e due alla partita.
 */
export default function TavoloSala({ gioco }: { gioco: GiocoTavoliere }) {
  const { vai } = useNavigazione()
  const toast = useToast()
  const catalogo = giocoTavoloDi(gioco)
  const presenza = usePresenza()
  const [dati, setDati] = useState<SalaTavolo | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState<string | null>(null)
  const [regole, setRegole] = useState(false)
  const [contro, setContro] = useState<Contro>(() => leggiContro(gioco))
  const varianti = regoleDi(gioco).varianti ?? null
  const [variante, setVariante] = useState(() => leggiVariante(gioco))
  const [locale, setLocale] = useState(() => leggiPartita(gioco))
  const [conti, setConti] = useState(() => leggiConti(gioco))
  const [conferma, setConferma] = useState<LivelloTavoliere | null>(null)
  /** Le partite viste al giro prima: quando ne compare una nuova, perché l'altro ha accettato, ci si va. */
  const viste = useRef<Set<string> | null>(null)

  const carica = useCallback(async () => {
    try {
      const nuovi = await api<SalaTavolo>(`/tavolo/sala?gioco=${gioco}`)
      const nuova = viste.current ? nuovi.partite.find((p) => !viste.current!.has(p.id)) : undefined
      viste.current = new Set(nuovi.partite.map((p) => p.id))
      if (nuova) vai(ROTTE.partitaTavolo(gioco, nuova.id))
      setDati(nuovi)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la sala.')
    }
  }, [gioco, vai])

  const aspetto = dati?.invito?.stato === 'attesa'
  useEffect(() => {
    void carica()
    const ritmo = aspetto ? BATTAGLIA_POLL_LOBBY_MS : RITMO_TRANQUILLO_MS
    const giro = () => {
      if (document.visibilityState === 'visible') void carica()
    }
    const t = setInterval(giro, ritmo)
    document.addEventListener('visibilitychange', giro)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', giro)
    }
  }, [carica, aspetto])

  // La partita contro il computer puo' essere cambiata altrove: si rilegge tornando qui.
  useEffect(() => {
    const rileggi = () => {
      if (document.visibilityState !== 'visible') return
      setLocale(leggiPartita(gioco))
      setConti(leggiConti(gioco))
    }
    document.addEventListener('visibilitychange', rileggi)
    return () => document.removeEventListener('visibilitychange', rileggi)
  }, [gioco])

  const scegliContro = (c: Contro) => {
    setContro(c)
    salvaContro(gioco, c)
  }

  const scegliVariante = (v: string) => {
    setVariante(v)
    salvaVariante(gioco, v)
  }

  const comincia = (livello: LivelloTavoliere) => {
    if (locale && cominciata(locale)) abbandona(locale)
    nuovaPartita(gioco, livello, variante)
    setConferma(null)
    vai(ROTTE.computerTavolo(gioco))
  }

  const scegliLivello = (livello: LivelloTavoliere) => {
    if (locale && cominciata(locale)) setConferma(livello)
    else comincia(livello)
  }

  const invita = async (playerId: string | null) => {
    setInvio(playerId ?? 'link')
    try {
      const creato = await api<{ id: string; codice: string | null }>('/tavolo/inviti', {
        method: 'POST',
        body: { gioco, playerId, variante },
      })
      if (creato.codice) await condividi(gioco, creato.codice, catalogo.nome, A_GIOCO[gioco], toast.show)
      await carica()
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Invito non mandato.', 'error')
    } finally {
      setInvio(null)
    }
  }

  const annulla = async (invito: InvitoTavoloMandato) => {
    await api(`/tavolo/inviti/${invito.id}/annulla`, { method: 'POST' }).catch(() => {})
    await carica()
  }

  const invito = dati?.invito ?? null
  const inAttesa = invito?.stato === 'attesa' ? invito : null
  const esito =
    invito && !invito.codice && (invito.stato === 'rifiutato' || invito.stato === 'scaduto') ? invito : null
  // Si gioca una partita da tavoliere alla volta: quella aperta, di questo gioco o di un altro, la dice il giro
  // di controllo. Una partita ferma da mezz'ora resta da riprendere, ma non tiene piu' occupati.
  const aperta = presenza.dati?.partitaTavolo ?? null
  const altrove = aperta && aperta.gioco !== gioco ? aperta : null
  const occupato = aperta !== null
  const inCorsoLocale = locale && !locale.esito ? locale : null

  // Un invito che aspetta risposta si vede anche se l'ultima volta si era scelto il computer.
  const vista: Contro = inAttesa ? 'amico' : contro

  return (
    <Pagina
      titolo={catalogo.nome}
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      eroe={<Copertina gioco={gioco} formato="eroe" transizione={`copertina-${gioco}`} />}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {dati?.partite.map((p) => <PartitaAperta key={p.id} partita={p} />)}
      {altrove && <PartitaAperta partita={altrove} />}

      <div className="tav-sala__scelte">
        <SegmentedControl
          ariaLabel="Contro chi"
          value={vista}
          onChange={scegliContro}
          options={[
            { value: 'computer', label: 'Computer' },
            { value: 'amico', label: 'Amico' },
          ]}
        />
        {varianti && variante && (
          <SegmentedControl
            ariaLabel="Il lato del goban"
            value={variante}
            onChange={scegliVariante}
            options={varianti.map((v) => ({ value: v, label: nomeVariante(gioco, v) ?? v }))}
          />
        )}
      </div>

      {vista === 'computer' ? (
        <Sezione titolo="Difficoltà">
          <Elenco>
            {inCorsoLocale && (
              <Riga
                icona={<span className="tavolo-riga__segno" aria-hidden="true" />}
                titolo="Riprendi la partita"
                sotto={[
                  NOMI_LIVELLI[inCorsoLocale.livello],
                  nomeVariante(gioco, regoleDi(gioco).varianteDi?.(inCorsoLocale.posizione)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                a={ROTTE.computerTavolo(gioco)}
              />
            )}
            {LIVELLI_TAVOLIERE.map((livello, i) => {
              const c = conti[livello]
              const giocate = c.vinte + c.perse + c.patte
              return (
                <Riga
                  key={livello}
                  icona={<Tacche piene={i + 1} colore={`var(--${gioco}-1)`} />}
                  titolo={NOMI_LIVELLI[livello]}
                  valore={giocate > 0 ? `${c.vinte}/${giocate}` : undefined}
                  onClick={() => scegliLivello(livello)}
                />
              )
            })}
          </Elenco>
        </Sezione>
      ) : errore && !dati ? (
        <Vuoto
          titolo="La sala non si è caricata"
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
        <Sezione titolo="Invita">
          {inAttesa?.codice ? (
            <LinkAttivo gioco={gioco} nome={catalogo.nome} invito={inAttesa} onRitira={() => void annulla(inAttesa)} />
          ) : (
            <Button
              variant="tinted"
              size="lg"
              fullWidth
              onClick={() => void invita(null)}
              loading={invio === 'link'}
              disabled={occupato || (invio !== null && invio !== 'link')}
            >
              <IconShare size={18} /> Invita con un link
            </Button>
          )}

          {inAttesa && !inAttesa.codice && (
            <InvitoInAttesa invito={inAttesa} onAnnulla={() => void annulla(inAttesa)} />
          )}

          {esito && (
            <p className="bat-sala__esito">
              {esito.stato === 'rifiutato'
                ? `${esito.a?.displayName} non può giocare adesso.`
                : `${esito.a?.displayName} non ha risposto in tempo.`}
            </p>
          )}

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
                    <span className="bat-sala__dove">{g.occupato ? 'sta già giocando' : DOVE[g.attivita]}</span>
                  </span>
                  <Button
                    variant={g.invitato ? 'plain' : 'tinted'}
                    disabled={g.occupato || g.invitato || occupato || invio !== null}
                    loading={invio === g.playerId}
                    onClick={() => void invita(g.playerId)}
                  >
                    {g.invitato ? 'Invitato' : 'Invita'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Sezione>
      )}

      <ComeSiGiocaTavoliere gioco={gioco} open={regole} onClose={() => setRegole(false)} />

      <Sheet open={conferma !== null} onClose={() => setConferma(null)} title="Una partita nuova?">
        <div className="tav-foglio">
          <p className="tav-foglio__testo">Se ne cominci un’altra, quella in corso conta come persa.</p>
          <Button variant="destructive" size="lg" fullWidth onClick={() => conferma && comincia(conferma)}>
            Comincia la nuova
          </Button>
          <Button
            variant="plain"
            size="lg"
            fullWidth
            onClick={() => {
              setConferma(null)
              vai(ROTTE.computerTavolo(gioco))
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
function PartitaAperta({ partita }: { partita: PartitaTavoloBreve }) {
  const { vai } = useNavigazione()
  const nome = giocoTavoloDi(partita.gioco).nome
  return (
    <button
      type="button"
      className={`bat-sala__partita tavolo-aperta tavolo-aperta--${partita.gioco}`}
      onClick={() => vai(ROTTE.partitaTavolo(partita.gioco, partita.id))}
    >
      <Avatar nickname={partita.avversario.nickname} color={partita.avversario.avatarColor} size={44} />
      <span className="bat-sala__partita-testo">
        <span className="bat-sala__partita-titolo">
          {nome}
          {partita.variante && ` ${nomeVariante(partita.gioco, partita.variante)}`} con {partita.avversario.displayName}
        </span>
        <span className="bat-sala__partita-stato">
          {partita.tuoTurno ? 'Tocca a te' : `Tocca a ${partita.avversario.displayName}`}
        </span>
      </span>
      <span className="bat-sala__riprendi">Riprendi</span>
    </button>
  )
}

function indirizzoDi(gioco: GiocoTavoliere, codice: string): string {
  return `${window.location.origin}${ROTTE.invitoTavolo(gioco, codice)}`
}

/** Il link nel foglio di sistema, dove c'e'; altrimenti negli appunti. */
async function condividi(
  gioco: GiocoTavoliere,
  codice: string,
  nome: string,
  a: string,
  avvisa: (testo: string) => void,
) {
  const url = indirizzoDi(gioco, codice)
  if (navigator.share) {
    try {
      await navigator.share({ title: nome, text: `Una partita ${a}?`, url })
      return
    } catch (err) {
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

function LinkAttivo({
  gioco,
  nome,
  invito,
  onRitira,
}: {
  gioco: GiocoTavoliere
  nome: string
  invito: InvitoTavoloMandato
  onRitira: () => void
}) {
  const toast = useToast()
  const restano = useCountdown(invito.scadeTraMs)
  const url = indirizzoDi(gioco, invito.codice!)
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
        <Button onClick={() => void condividi(gioco, invito.codice!, nome, A_GIOCO[gioco], toast.show)}>
          <IconShare size={18} /> Condividi
        </Button>
        <Button variant="tinted" onClick={() => void copia(url, toast.show)}>
          <IconCopy size={18} /> Copia
        </Button>
      </div>
      <p className="bat-link__nota">
        Scade fra {formatCronometro(restano)}.{' '}
        <button type="button" className="bat-link__ritira" onClick={onRitira}>
          Ritira il link
        </button>
      </p>
    </div>
  )
}

function InvitoInAttesa({ invito, onAnnulla }: { invito: InvitoTavoloMandato; onAnnulla: () => void }) {
  const restano = useCountdown(invito.scadeTraMs)
  return (
    <div className="bat-sala__in-attesa" aria-live="polite">
      <span className="bat-sala__onde" aria-hidden="true" />
      <p className="bat-sala__in-attesa-testo">
        Aspetto la risposta di <strong>{invito.a?.displayName}</strong>…
        <span className="bat-sala__scadenza u-tabnum"> {formatCronometro(restano)}</span>
      </p>
      <Button variant="plain" onClick={onAnnulla}>
        Annulla
      </Button>
    </div>
  )
}
