import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Sezione, Vuoto } from '@/components/Elementi'
import { IconCopy, IconInfo, IconShare } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { elencoSet, type SetProprio } from '@/games/indovina/archivio'
import { ComeSiGiocaIndovina } from '@/games/indovina/ComeSiGioca'
import { problemaDelSet } from '@/games/indovina/setFile'
import { SceltaSet, opzionePredefinita, useOpzioniProprie } from '@/games/indovina/SceltaSet'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { DOVE } from '@/lib/presenza'
import { BATTAGLIA_POLL_LOBBY_MS } from '@shared/config'
import { ANIMALI, NOMI_SET, PERSONE, type SetPredefinito } from '@shared/indovina'
import type { InvitoIndovinaMandato, PartitaIndovinaBreve, SalaIndovina } from '@shared/types'
import './Battaglia.css'
import './Indovina.css'

/** Senza niente in sospeso la sala si rilegge di rado: serve solo a vedere chi entra. */
const RITMO_TRANQUILLO_MS = 12_000
const CHIAVE_SCELTA = 'giochi.indovina.set'

function sceltaSalvata(): string {
  try {
    return localStorage.getItem(CHIAVE_SCELTA) ?? 'persone'
  } catch {
    return 'persone'
  }
}

/**
 * Indovina chi: la sala. Si scelgono i personaggi — le persone, gli animali, o
 * un set con le proprie foto — e poi con chi: un amico online, o chiunque apra
 * un link. Quando l'altro accetta, la sala porta tutti e due alla partita.
 */
export default function IndovinaChi() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const [dati, setDati] = useState<SalaIndovina | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [propri, setPropri] = useState<SetProprio[]>([])
  const [scelta, setScelta] = useState(sceltaSalvata)
  const [invio, setInvio] = useState<string | null>(null)
  const [regole, setRegole] = useState(false)
  const partitaVista = useRef<string | null>(null)

  useEffect(() => {
    void elencoSet().then(setPropri)
  }, [])

  const carica = useCallback(async () => {
    try {
      const nuovi = await api<SalaIndovina>('/indovina/sala')
      // Una partita nuova, perché l'altro ha accettato: ci si va.
      if (nuovi.partita && partitaVista.current !== null && partitaVista.current !== nuovi.partita.id) {
        vai(ROTTE.partitaIndovina(nuovi.partita.id))
      }
      partitaVista.current = nuovi.partita?.id ?? ''
      setDati(nuovi)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la sala.')
    }
  }, [vai])

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

  const proprie = useOpzioniProprie(propri)
  const opzioni = useMemo(
    () => [
      opzionePredefinita('persone', NOMI_SET.persone, PERSONE.length),
      opzionePredefinita('animali', NOMI_SET.animali, ANIMALI.length),
      ...proprie,
    ],
    [proprie],
  )
  // Un set proprio cancellato nel frattempo: si torna alle persone.
  const sceltaValida = opzioni.some((o) => o.chiave === scelta) ? scelta : 'persone'

  const scegli = (chiave: string) => {
    setScelta(chiave)
    try {
      localStorage.setItem(CHIAVE_SCELTA, chiave)
    } catch {
      /* la scelta resta per questa visita */
    }
  }

  /** I personaggi scelti, come vanno al server: di un set proprio solo i nomi e le impronte. */
  const personaggi = (): unknown => {
    if (sceltaValida === 'persone' || sceltaValida === 'animali') return { set: sceltaValida as SetPredefinito }
    const s = propri.find((p) => p.id === sceltaValida)
    if (!s) return { set: 'persone' }
    return { set: 'mio', nome: s.nome, voci: s.voci.map((v) => ({ nome: v.nome, img: v.img })) }
  }

  /** Un set proprio non ancora pronto — pochi personaggi, nomi mancanti o doppi — lo si dice prima di invitare. */
  const setDaCompletare = () => {
    const s = propri.find((p) => p.id === sceltaValida)
    const problema = s ? problemaDelSet(s) : null
    if (problema) toast.show(`${s!.nome || 'Il set'}: ${problema.charAt(0).toLowerCase()}${problema.slice(1)}`, 'error')
    return problema !== null
  }

  const invita = async (playerId: string | null) => {
    if (setDaCompletare()) return
    setInvio(playerId ?? 'link')
    try {
      const creato = await api<{ id: string; codice: string | null }>('/indovina/inviti', {
        method: 'POST',
        body: { playerId, personaggi: personaggi() },
      })
      if (creato.codice) await condividi(creato.codice, toast.show)
      await carica()
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Invito non mandato.', 'error')
    } finally {
      setInvio(null)
    }
  }

  const annulla = async (invito: InvitoIndovinaMandato) => {
    await api(`/indovina/inviti/${invito.id}/annulla`, { method: 'POST' }).catch(() => {})
    await carica()
  }

  const invito = dati?.invito ?? null
  const inAttesa = invito?.stato === 'attesa' ? invito : null
  const esito =
    invito && !invito.codice && (invito.stato === 'rifiutato' || invito.stato === 'scaduto') ? invito : null

  return (
    <Pagina
      titolo="Indovina chi"
      indietro={{ a: ROTTE.salotto, etichetta: 'Salotto' }}
      eroe={<Copertina gioco="indovina" formato="eroe" transizione="copertina-indovina" />}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {dati?.partita && <PartitaAperta partita={dati.partita} />}

      <Sezione titolo="Personaggi">
        <SceltaSet
          opzioni={opzioni}
          scelta={sceltaValida}
          onScegli={scegli}
          onModifica={(id) => vai(ROTTE.setIndovina(id))}
          onNuovo={() => vai(ROTTE.setIndovina('nuovo'))}
        />
      </Sezione>

      <Sezione titolo="Invita">
        {errore && !dati ? (
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
          <>
            {inAttesa?.codice ? (
              <LinkAttivo invito={inAttesa} onRitira={() => void annulla(inAttesa)} />
            ) : (
              <Button
                variant="tinted"
                size="lg"
                fullWidth
                onClick={() => void invita(null)}
                loading={invio === 'link'}
                disabled={Boolean(dati.partita) || (invio !== null && invio !== 'link')}
              >
                <IconShare size={18} /> Invita con un link
              </Button>
            )}

            {inAttesa && !inAttesa.codice && <InvitoInAttesa invito={inAttesa} onAnnulla={() => void annulla(inAttesa)} />}

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
                      disabled={g.occupato || g.invitato || Boolean(dati.partita) || invio !== null}
                      loading={invio === g.playerId}
                      onClick={() => void invita(g.playerId)}
                    >
                      {g.invitato ? 'Invitato' : 'Invita'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Sezione>

      <ComeSiGiocaIndovina open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

function PartitaAperta({ partita }: { partita: PartitaIndovinaBreve }) {
  const { vai } = useNavigazione()
  return (
    <button type="button" className="bat-sala__partita ic-partita-aperta" onClick={() => vai(ROTTE.partitaIndovina(partita.id))}>
      <Avatar nickname={partita.avversario.nickname} color={partita.avversario.avatarColor} size={44} />
      <span className="bat-sala__partita-testo">
        <span className="bat-sala__partita-titolo">Partita con {partita.avversario.displayName}</span>
        <span className="bat-sala__partita-stato">
          {partita.tocca === 'risposta'
            ? 'Ti ha fatto una domanda'
            : partita.tocca === 'domanda'
              ? 'Tocca a te'
              : `Tocca a ${partita.avversario.displayName}`}
        </span>
      </span>
      <span className="bat-sala__riprendi">Riprendi</span>
    </button>
  )
}

function indirizzoDi(codice: string): string {
  return `${window.location.origin}${ROTTE.invitoIndovina(codice)}`
}

/** Il link nel foglio di sistema, dove c'e'; altrimenti negli appunti. */
async function condividi(codice: string, avvisa: (testo: string) => void) {
  const url = indirizzoDi(codice)
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Indovina chi', text: 'Giochiamo a Indovina chi?', url })
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

function LinkAttivo({ invito, onRitira }: { invito: InvitoIndovinaMandato; onRitira: () => void }) {
  const toast = useToast()
  const restano = useCountdown(invito.scadeTraMs)
  const url = indirizzoDi(invito.codice!)
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
        <Button onClick={() => void condividi(invito.codice!, toast.show)}>
          <IconShare size={18} /> Condividi
        </Button>
        <Button variant="tinted" onClick={() => void copia(url, toast.show)}>
          <IconCopy size={18} /> Copia
        </Button>
      </div>
      <p className="bat-link__nota">
        Con {invito.set}. Scade fra {formatCronometro(restano)}.{' '}
        <button type="button" className="bat-link__ritira" onClick={onRitira}>
          Ritira il link
        </button>
      </p>
    </div>
  )
}

function InvitoInAttesa({ invito, onAnnulla }: { invito: InvitoIndovinaMandato; onAnnulla: () => void }) {
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
