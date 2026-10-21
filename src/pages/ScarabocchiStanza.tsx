import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Elenco, Riga, Sezione, Vuoto } from '@/components/Elementi'
import { IconCopy, IconInfo, IconShare } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useToast } from '@/components/Toast'
import { useAmiciOnline } from '@/games/amici/amici'
import { PartitaIndovina } from '@/games/scarabocchi/Indovina'
import { ComeSiGiocaScarabocchi } from '@/games/scarabocchi/Regole'
import { PartitaTelefono } from '@/games/scarabocchi/Telefono'
import { useStanzaScarabocchi, type InfoStanzaScarabocchi } from '@/games/scarabocchi/useStanza'
import { DOVE, usePresenza } from '@/lib/presenza'
import { suona } from '@/lib/suoni'
import {
  GIOCATORI_MINIMI_SCARABOCCHI,
  GIRI_SCARABOCCHI,
  MODI_SCARABOCCHI,
  NOMI_MODI_SCARABOCCHI,
  SECONDI_SCARABOCCHI,
  SECONDI_TELEFONO,
  codiceScarabocchiDaTesto,
  type IscrittoStanzaScarabocchi,
  type ModoScarabocchi,
  type VistaStanzaScarabocchi,
} from '@shared/scarabocchi'
import '@/pages/Battaglia.css'
import '@/games/scarabocchi/Scarabocchi.css'

type Stanza = ReturnType<typeof useStanzaScarabocchi>

const indietroSala = { a: ROTTE.scarabocchi, etichetta: 'Scarabocchi' }

/**
 * Una stanza di Scarabocchi: ognuno dal suo telefono, e chi l'ha aperta
 * sceglie come si gioca e da' il via. Aprire il link e' gia' l'invito: se la
 * stanza aspetta si entra da soli. Durante la partita la pagina prende lo
 * schermo intero, come gli altri giochi.
 */
export default function ScarabocchiStanza() {
  const { codice: grezzo = '' } = useParams()
  const codice = codiceScarabocchiDaTesto(grezzo)
  if (codice !== grezzo) return <Navigate to={ROTTE.stanzaScarabocchi(codice)} replace />
  return <StanzaDi key={codice} codice={codice} />
}

function StanzaDi({ codice }: { codice: string }) {
  const { vai } = useNavigazione()
  const s = useStanzaScarabocchi(codice)
  const { aggiorna } = usePresenza()
  const provato = useRef(false)
  const [regole, setRegole] = useState(false)
  const stanza = s.stanza

  // Il link aperto la prima volta: se la stanza aspetta, si entra da soli.
  useEffect(() => {
    if (stanza.tipo !== 'fuori' || stanza.motivo !== 'mai' || provato.current) return
    if (stanza.info?.stato !== 'attesa') return
    provato.current = true
    void s.entra().then((ok) => ok && aggiorna())
  }, [stanza, s, aggiorna])

  const esci = useCallback(async () => {
    if (await s.esci()) {
      aggiorna()
      vai(ROTTE.scarabocchi, { direzione: 'indietro', replace: true })
    }
  }, [s, aggiorna, vai])

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )
  const foglioRegole = <ComeSiGiocaScarabocchi open={regole} onClose={() => setRegole(false)} />

  const v = stanza.tipo === 'dentro' ? stanza.vista : null
  const volti = useMemo(() => new Map((v?.iscritti ?? []).map((i) => [i.playerId, i])), [v?.iscritti])

  if (stanza.tipo === 'carico') {
    return (
      <Pagina titolo="Scarabocchi" indietro={indietroSala}>
        <div className="bat__attesa" aria-hidden="true" />
      </Pagina>
    )
  }
  if (stanza.tipo === 'assente') {
    return (
      <Pagina titolo="Scarabocchi" indietro={indietroSala}>
        <Vuoto
          titolo="Questa stanza non c’è più"
          testo={`Nessuna stanza con il codice ${codice}.`}
          azione={
            <Button variant="tinted" onClick={() => vai(ROTTE.scarabocchi, { replace: true })}>
              Vai alla sala
            </Button>
          }
        />
      </Pagina>
    )
  }
  if (stanza.tipo === 'fuori') {
    return (
      <Pagina titolo={`Stanza ${codice}`} indietro={indietroSala} azioni={info}>
        <Ingresso info={stanza.info} uscito={stanza.motivo === 'uscito'} s={s} onEntrato={aggiorna} />
        {foglioRegole}
      </Pagina>
    )
  }

  const vista = stanza.vista
  if (vista.stato === 'attesa') {
    return (
      <>
        <Attesa v={vista} s={s} onEsci={esci} azioni={info} />
        {foglioRegole}
      </>
    )
  }
  const p = vista.partita
  if (!p) {
    return (
      <Pagina titolo={`Stanza ${codice}`} indietro={indietroSala} azioni={info}>
        <Vuoto
          titolo="La partita è cominciata senza di te"
          testo="Aspetta la prossima, o esci dalla stanza."
          azione={
            <Button variant="tinted" onClick={() => void esci()}>
              Esci dalla stanza
            </Button>
          }
        />
        {foglioRegole}
      </Pagina>
    )
  }
  return (
    // In partita il titolo e' il gioco, come nel mockup: il nome del modo, lungo, si scontrava con la freccia.
    <Pagina titolo="Scarabocchi" intera indietro={{ ...indietroSala, etichetta: 'Stanza' }} azioni={info}>
      {p.modo === 'indovina' ? (
        <PartitaIndovina v={vista} pv={p} s={s} volti={volti} />
      ) : (
        <PartitaTelefono v={vista} pv={p} s={s} volti={volti} />
      )}
      {vista.stato === 'finita' && (
        <div className="scr-esci">
          <Button variant="plain" disabled={s.occupato !== null} onClick={() => void esci()}>
            Esci dalla stanza
          </Button>
        </div>
      )}
      {foglioRegole}
    </Pagina>
  )
}

/* ─────────────────────────────  Prima di entrare  ───────────────────────────── */

function Ingresso({
  info,
  uscito,
  s,
  onEntrato,
}: {
  info: InfoStanzaScarabocchi | null
  uscito: boolean
  s: Stanza
  onEntrato: () => void
}) {
  if (!info) return null
  const aspetta = info.stato === 'attesa'
  return (
    <div className="scr-ingresso">
      <Avatar nickname={info.conduttore.nickname} color={info.conduttore.avatarColor} size={72} />
      <p className="scr-ingresso__testo">
        <strong>{info.conduttore.displayName}</strong> ti aspetta nella stanza <strong>{info.codice}</strong>.
      </p>
      <p className="scr-nota">
        {NOMI_MODI_SCARABOCCHI[info.modo]} ·{' '}
        {info.iscritti === 1 ? '1 giocatore' : `${info.iscritti} giocatori`}
        {aspetta ? '' : ', e la partita è già cominciata'}
      </p>
      {uscito && <p className="scr-nota">Non sei più nella stanza.</p>}
      {aspetta && (
        <Button
          size="lg"
          fullWidth
          loading={s.occupato === 'entra'}
          disabled={s.occupato !== null}
          onClick={() => void s.entra().then((ok) => ok && onEntrato())}
        >
          Entra
        </Button>
      )}
    </div>
  )
}

/* ─────────────────────────────  L'attesa  ───────────────────────────── */

const indirizzoDi = (codice: string) => `${window.location.origin}${ROTTE.stanzaScarabocchi(codice)}`

async function copia(testo: string, avvisa: (t: string) => void) {
  try {
    await navigator.clipboard.writeText(testo)
    avvisa('Link copiato')
  } catch {
    avvisa('Non riesco a copiare: tieni premuto il link.')
  }
}

async function condividi(codice: string, avvisa: (t: string) => void) {
  const url = indirizzoDi(codice)
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Scarabocchi', text: `Disegniamo? Il codice è ${codice}.`, url })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  await copia(url, avvisa)
}

function Attesa({
  v,
  s,
  onEsci,
  azioni,
}: {
  v: VistaStanzaScarabocchi
  s: Stanza
  onEsci: () => void
  azioni: ReactNode
}) {
  const toast = useToast()
  const amici = useAmiciOnline()
  const [invitati, setInvitati] = useState<Set<string>>(new Set())
  const n = v.iscritti.length
  const imp = v.impostazioni
  const minimi = GIOCATORI_MINIMI_SCARABOCCHI[imp.modo]
  const conduttore = v.iscritti.find((i) => i.conduce)
  const dentro = new Set(v.iscritti.map((i) => i.playerId))
  const daInvitare = (amici ?? []).filter((a) => !dentro.has(a.playerId))

  // Chi entra si sente: la stanza si riempie.
  const quanti = useRef(n)
  useEffect(() => {
    if (n > quanti.current) suona('entra')
    else if (n < quanti.current) suona('esce')
    quanti.current = n
  }, [n])

  const invita = async (playerId: string) => {
    if (await s.invita(playerId)) setInvitati((x) => new Set(x).add(playerId))
  }

  return (
    <Pagina titolo={`Stanza ${v.codice}`} indietro={indietroSala} azioni={azioni}>
      <section className="scr-codice" aria-label="Il codice della stanza">
        <p className="scr-codice__etichetta">Il codice</p>
        <p className="scr-codice__lettere" data-selezionabile>
          {v.codice}
        </p>
        <div className="scr-codice__azioni">
          <Button onClick={() => void condividi(v.codice, toast.show)}>
            <IconShare size={18} /> Condividi
          </Button>
          <Button variant="tinted" onClick={() => void copia(indirizzoDi(v.codice), toast.show)}>
            <IconCopy size={18} /> Copia
          </Button>
        </div>
      </section>

      <Sezione titolo="Come si gioca">
        {v.conduco ? (
          <div className="scr-impostazioni">
            <SegmentedControl<ModoScarabocchi>
              ariaLabel="Modo"
              value={imp.modo}
              onChange={(modo) => void s.impostazioni({ modo })}
              options={MODI_SCARABOCCHI.map((m) => ({ value: m, label: NOMI_MODI_SCARABOCCHI[m] }))}
            />
            {imp.modo === 'indovina' ? (
              <>
                <p className="scr-impostazioni__etichetta">Quante volte disegna ognuno</p>
                <SegmentedControl
                  ariaLabel="Giri"
                  value={String(imp.giri)}
                  onChange={(g) => void s.impostazioni({ giri: Number(g) })}
                  options={GIRI_SCARABOCCHI.map((g) => ({ value: String(g), label: String(g) }))}
                />
                <p className="scr-impostazioni__etichetta">Secondi per disegnare</p>
                <SegmentedControl
                  ariaLabel="Secondi per disegnare"
                  value={String(imp.secondi)}
                  onChange={(x) => void s.impostazioni({ secondi: Number(x) })}
                  options={SECONDI_SCARABOCCHI.map((x) => ({ value: String(x), label: String(x) }))}
                />
              </>
            ) : (
              <>
                <p className="scr-impostazioni__etichetta">Secondi per disegnare</p>
                <SegmentedControl
                  ariaLabel="Secondi per disegnare"
                  value={String(imp.secondiTelefono)}
                  onChange={(x) => void s.impostazioni({ secondiTelefono: Number(x) })}
                  options={SECONDI_TELEFONO.map((x) => ({ value: String(x), label: String(x) }))}
                />
              </>
            )}
          </div>
        ) : (
          <Elenco>
            <Riga titolo="Modo" valore={NOMI_MODI_SCARABOCCHI[imp.modo]} />
            {imp.modo === 'indovina' && (
              <Riga titolo="Disegna ognuno" valore={imp.giri === 1 ? 'una volta' : `${imp.giri} volte`} />
            )}
            <Riga
              titolo="Per disegnare"
              valore={`${imp.modo === 'indovina' ? imp.secondi : imp.secondiTelefono} secondi`}
            />
          </Elenco>
        )}
      </Sezione>

      <Sezione titolo={`Nella stanza · ${n}`}>
        <ul className="bat-sala__elenco">
          {v.iscritti.map((i) => (
            <Iscritto key={i.playerId} i={i} v={v} s={s} />
          ))}
        </ul>
      </Sezione>

      <Sezione titolo="Invita">
        {amici === null ? (
          <div className="bat__attesa scr-attesa-breve" aria-hidden="true" />
        ) : daInvitare.length === 0 ? (
          <p className="bat-sala__vuoto">Nessun altro online. Manda il link, o di’ il codice.</p>
        ) : (
          <ul className="bat-sala__elenco">
            {daInvitare.map((a) => {
              const fatto = invitati.has(a.playerId)
              return (
                <li key={a.playerId} className="bat-sala__giocatore">
                  <Avatar nickname={a.nickname} color={a.avatarColor} size={40} />
                  <span className="bat-sala__chi">
                    <span className="bat-sala__nome">{a.displayName}</span>
                    <span className="bat-sala__dove">{DOVE[a.attivita]}</span>
                  </span>
                  <Button
                    variant={fatto ? 'plain' : 'tinted'}
                    disabled={fatto || s.occupato !== null}
                    loading={s.occupato === `invita:${a.playerId}`}
                    onClick={() => void invita(a.playerId)}
                  >
                    {fatto ? 'Invitato' : 'Invita'}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Sezione>

      <div className="scr-via">
        {v.conduco ? (
          <>
            {n < minimi && <p className="scr-nota">Servono almeno {minimi} giocatori.</p>}
            <Button
              size="lg"
              fullWidth
              disabled={n < minimi || s.occupato !== null}
              loading={s.occupato === 'via'}
              onClick={() => void s.via()}
            >
              {n >= minimi ? `Comincia con ${n} giocatori` : 'Comincia'}
            </Button>
          </>
        ) : (
          <p className="scr-nota">Aspetta che {conduttore?.displayName ?? 'chi ha aperto la stanza'} dia il via.</p>
        )}
        <Button variant="plain" fullWidth disabled={s.occupato !== null} onClick={onEsci}>
          Esci dalla stanza
        </Button>
      </div>
    </Pagina>
  )
}

function Iscritto({ i, v, s }: { i: IscrittoStanzaScarabocchi; v: VistaStanzaScarabocchi; s: Stanza }) {
  return (
    <li className="bat-sala__giocatore">
      <span className="scr-iscritto__volto">
        <Avatar nickname={i.nickname} color={i.avatarColor} size={40} />
        {i.online && <span className="scr-iscritto__online" aria-label="Online" />}
      </span>
      <span className="bat-sala__chi">
        <span className="bat-sala__nome">
          {i.displayName}
          {i.playerId === v.io && ' (tu)'}
        </span>
        <span className="bat-sala__dove">
          {i.conduce ? 'Ha aperto la stanza' : i.online ? 'Online' : 'Fuori linea'}
        </span>
      </span>
      {v.conduco && i.playerId !== v.io && (
        <Button
          variant="plain"
          loading={s.occupato === `espelli:${i.playerId}`}
          disabled={s.occupato !== null}
          onClick={() => void s.espelli(i.playerId)}
        >
          Manda via
        </Button>
      )}
    </li>
  )
}
