import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useAdesivo } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Sezione, Vuoto, useFesta } from '@/components/Elementi'
import { IconBook, IconCopy, IconInfo, IconLock, IconShare } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { useAmiciOnline } from '@/games/amici/amici'
import { Alba, Arringhe, Discussione, EsitoDelGiorno, Fine, Nomine } from '@/games/lupus/Giorno'
import { IconaLupus } from '@/games/lupus/Icone'
import { Rivelazione, SchermataBenvenuto, SchermataNotte, Schermo, VotoSegreto } from '@/games/lupus/Notte'
import {
  BadgeRuolo,
  Cronaca,
  Diario,
  PillolaFazione,
  TesseraGiocatore,
  TestaFase,
  VoltiDeiGiocatori,
} from '@/games/lupus/Pezzi'
import { FoglioMazzo, FoglioRegole, RigheDellaPartita } from '@/games/lupus/Preparazione'
import { ComeSiGiocaLupus } from '@/games/lupus/Regole'
import { VINCITORI } from '@/games/lupus/testi'
import { useNotte } from '@/games/lupus/useNotte'
import { useStanzaLupus, type InfoStanza } from '@/games/lupus/useStanza'
import { DOVE, usePresenza } from '@/lib/presenza'
import { suona } from '@/lib/suoni'
import { composizioneAutomatica, controllaComposizione, GIOCATORI_MINIMI } from '@shared/lupus-composizione'
import { PERSONAGGI } from '@shared/lupus-personaggi'
import { codiceDaTesto, type VistaStanzaLupus } from '@shared/lupus-stanza'
import type { VistaGiocatore } from '@shared/lupus-vista'
import '@/pages/Battaglia.css'
import '@/games/lupus/Lupus.css'

type Stanza = ReturnType<typeof useStanzaLupus>

const indietroSala = { a: ROTTE.lupus, etichetta: 'Lupus' }

/**
 * Una stanza online di Lupus: ognuno dal suo telefono, e chi l'ha aperta
 * conduce. Aprire il link e' gia' l'invito: se la stanza aspetta si entra da
 * soli, come con i link della battaglia; se la partita e' cominciata si vede
 * chi conduce, e basta. Dentro, prima della partita si aspettano gli altri e
 * si sceglie come giocare; poi ognuno vede la sua parte di partita, che il
 * server manda a ciascuno.
 */
export default function LupusStanza() {
  const { codice: grezzo = '' } = useParams()
  const codice = codiceDaTesto(grezzo)
  if (codice !== grezzo) return <Navigate to={ROTTE.stanzaLupus(codice)} replace />
  return <StanzaDi key={codice} codice={codice} />
}

function StanzaDi({ codice }: { codice: string }) {
  const { vai } = useNavigazione()
  const s = useStanzaLupus(codice)
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
      vai(ROTTE.lupus, { direzione: 'indietro', replace: true })
    }
  }, [s, aggiorna, vai])

  const azioniBase = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )
  const foglioRegole = <ComeSiGiocaLupus open={regole} onClose={() => setRegole(false)} />

  if (stanza.tipo === 'carico') {
    return (
      <Pagina titolo="Lupus" indietro={indietroSala}>
        <div className="bat__attesa" aria-hidden="true" />
      </Pagina>
    )
  }
  if (stanza.tipo === 'assente') {
    return (
      <Pagina titolo="Lupus" indietro={indietroSala}>
        <Vuoto
          icona={<IconaLupus nome="luna" size={30} />}
          titolo="Questa stanza non c’è più"
          testo={`Nessuna stanza con il codice ${codice}.`}
          azione={
            <Button variant="tinted" onClick={() => vai(ROTTE.lupus, { replace: true })}>
              Vai alla sala
            </Button>
          }
        />
      </Pagina>
    )
  }
  if (stanza.tipo === 'fuori') {
    return (
      <Pagina titolo={`Stanza ${codice}`} indietro={indietroSala} azioni={azioniBase}>
        <Ingresso info={stanza.info} uscito={stanza.motivo === 'uscito'} s={s} onEntrato={aggiorna} />
        {foglioRegole}
      </Pagina>
    )
  }

  const v = stanza.vista
  if (v.stato === 'attesa') {
    return (
      <VoltiDellaStanza vista={v}>
        <Attesa v={v} s={s} onEsci={esci} azioni={azioniBase} />
        {foglioRegole}
      </VoltiDellaStanza>
    )
  }
  if (!v.partita) {
    return (
      <Pagina titolo={`Stanza ${codice}`} indietro={indietroSala} azioni={azioniBase}>
        <Vuoto
          icona={<IconaLupus nome="luna" size={30} />}
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
    <VoltiDellaStanza vista={v}>
      <PartitaOnline v={v} pv={v.partita} s={s} onEsci={esci} azioniBase={azioniBase} />
      {foglioRegole}
    </VoltiDellaStanza>
  )
}

/** I volti dei giocatori della stanza: quelli dei loro profili, con i loro colori. */
function VoltiDellaStanza({ vista, children }: { vista: VistaStanzaLupus; children: ReactNode }) {
  const volti = useMemo(() => new Map(vista.iscritti.map((i) => [i.playerId, i])), [vista.iscritti])
  const volto = useCallback(
    (id: string, nome: string) => {
      const i = volti.get(id)
      return i ? { nickname: i.nickname, colore: i.avatarColor } : { nickname: nome }
    },
    [volti],
  )
  return <VoltiDeiGiocatori value={volto}>{children}</VoltiDeiGiocatori>
}

/* ─────────────────────────────  Prima di entrare  ───────────────────────────── */

function Ingresso({
  info,
  uscito,
  s,
  onEntrato,
}: {
  info: InfoStanza | null
  uscito: boolean
  s: Stanza
  onEntrato: () => void
}) {
  if (!info) return null
  const aspetta = info.stato === 'attesa'
  const entrando = s.occupato === 'entra'
  return (
    <div className="lupus-ingresso">
      <Avatar nickname={info.conduttore.nickname} color={info.conduttore.avatarColor} size={72} />
      <p className="lupus-ingresso__testo">
        <strong>{info.conduttore.displayName}</strong> conduce la stanza <strong>{info.codice}</strong>.
      </p>
      <p className="lupus-ingresso__sotto">
        {info.iscritti === 1 ? 'Dentro c’è 1 giocatore' : `Dentro ci sono ${info.iscritti} giocatori`}
        {aspetta ? '.' : ', e la partita è già cominciata.'}
      </p>
      {uscito && <p className="lupus-avviso">Non sei più nella stanza.</p>}
      {aspetta && (
        <Button
          size="lg"
          fullWidth
          loading={entrando}
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

function indirizzoDi(codice: string): string {
  return `${window.location.origin}${ROTTE.stanzaLupus(codice)}`
}

async function copia(testo: string, avvisa: (t: string) => void) {
  try {
    await navigator.clipboard.writeText(testo)
    avvisa('Link copiato')
  } catch {
    avvisa('Non riesco a copiare: tieni premuto il link.')
  }
}

/** Il link nel foglio di sistema, dove c'e'; altrimenti negli appunti. */
async function condividi(codice: string, avvisa: (t: string) => void) {
  const url = indirizzoDi(codice)
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Lupus', text: `Giochiamo a Lupus? Il codice è ${codice}.`, url })
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
  v: VistaStanzaLupus
  s: Stanza
  onEsci: () => void
  azioni: ReactNode
}) {
  const toast = useToast()
  const amici = useAmiciOnline()
  const [foglio, setFoglio] = useState<'mazzo' | 'regole' | null>(null)
  const [invitati, setInvitati] = useState<Set<string>>(new Set())
  const n = v.iscritti.length
  const conduttore = v.iscritti.find((i) => i.conduce)
  const { composizione, regole } = v.impostazioni
  const mazzo = composizione ?? composizioneAutomatica(Math.max(GIOCATORI_MINIMI, n))
  const problema =
    n < GIOCATORI_MINIMI
      ? `Servono almeno ${GIOCATORI_MINIMI} giocatori.`
      : (controllaComposizione(mazzo, n).find((p) => p.livello === 'errore')?.messaggio ?? null)
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
      <section className="lupus-codice" aria-label="Il codice della stanza">
        <p className="lupus-etichetta">Il codice</p>
        <p className="lupus-codice__lettere" data-selezionabile>
          {v.codice}
        </p>
        <div className="lupus-codice__azioni">
          <Button onClick={() => void condividi(v.codice, toast.show)}>
            <IconShare size={18} /> Condividi
          </Button>
          <Button variant="tinted" onClick={() => void copia(indirizzoDi(v.codice), toast.show)}>
            <IconCopy size={18} /> Copia
          </Button>
        </div>
      </section>

      <Sezione titolo={`Nella stanza · ${n}`}>
        <ul className="bat-sala__elenco">
          {v.iscritti.map((i, posto) => (
            <li key={i.playerId} className="bat-sala__giocatore">
              <span className="lupus-iscritto__volto">
                <Avatar nickname={i.nickname} color={i.avatarColor} size={40} />
                {i.online && <span className="lupus-iscritto__online" aria-label="Online" />}
              </span>
              <span className="bat-sala__chi">
                <span className="bat-sala__nome">
                  {i.displayName}
                  {i.playerId === v.io && ' (tu)'}
                </span>
                <span className="bat-sala__dove">
                  {posto + 1}° posto{i.conduce ? ' · conduce' : ''}
                </span>
              </span>
              {v.conduco && i.playerId !== v.io && (
                <Button
                  variant="plain"
                  className="lupus-manda-via"
                  loading={s.occupato === `espelli:${i.playerId}`}
                  disabled={s.occupato !== null}
                  onClick={() => void s.espelli(i.playerId)}
                >
                  Manda via
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Sezione>

      <Sezione titolo="Invita">
        {amici === null ? (
          <div className="bat__attesa lupus-attesa-breve" aria-hidden="true" />
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

      <Sezione titolo="Partita">
        <RigheDellaPartita
          giocatori={n}
          composizione={composizione}
          regole={regole}
          onMazzo={() => setFoglio('mazzo')}
          onRegole={() => setFoglio('regole')}
        />
      </Sezione>

      <div className="lupus-via">
        {v.conduco ? (
          <>
            {problema && <p className="lupus-via__perche">{problema}</p>}
            <Button
              size="lg"
              fullWidth
              disabled={problema !== null || s.occupato !== null}
              loading={s.occupato === 'via'}
              onClick={() => void s.via()}
            >
              {n >= GIOCATORI_MINIMI ? `Comincia con ${n} giocatori` : 'Comincia'}
            </Button>
          </>
        ) : (
          <p className="lupus-attesa">
            Aspetta che {conduttore?.displayName ?? 'chi conduce'} dia il via.
          </p>
        )}
        <Button variant="plain" fullWidth disabled={s.occupato !== null} onClick={onEsci}>
          Esci dalla stanza
        </Button>
      </div>

      <FoglioMazzo
        open={foglio === 'mazzo'}
        onClose={() => setFoglio(null)}
        giocatori={n}
        composizione={composizione}
        onCambia={v.conduco ? (c) => void s.impostazioni({ composizione: c }) : undefined}
      />
      <FoglioRegole
        open={foglio === 'regole'}
        onClose={() => setFoglio(null)}
        regole={regole}
        onCambia={v.conduco ? (r) => void s.impostazioni({ regole: r }) : undefined}
      />
    </Pagina>
  )
}

/* ─────────────────────────────  La partita  ───────────────────────────── */

/** La notte di cui si e' visto com'e' andato il giorno prima, per stanza: riaprendo la pagina non si rivede. */
function useNotteAnnunciata(codice: string): [number, (n: number) => void] {
  const chiave = `lupus.notte.${codice}`
  const [n, setN] = useState(() => {
    try {
      return Number(sessionStorage.getItem(chiave)) || 0
    } catch {
      return 0
    }
  })
  const segna = useCallback(
    (x: number) => {
      setN(x)
      try {
        sessionStorage.setItem(chiave, String(x))
      } catch {
        /* senza sessionStorage la si rivede riaprendo la pagina */
      }
    },
    [chiave],
  )
  return [n, segna]
}

function PartitaOnline({
  v,
  pv,
  s,
  onEsci,
  azioniBase,
}: {
  v: VistaStanzaLupus
  pv: VistaGiocatore
  s: Stanza
  onEsci: () => void
  azioniBase: ReactNode
}) {
  const [cronaca, setCronaca] = useState(false)
  const [io, setIo] = useState(false)
  const [scelto, setScelto] = useState<string | null>(null)
  const [annunciata, annuncia] = useNotteAnnunciata(v.codice)
  const { adesivo, mostra } = useAdesivo()

  const puo = v.conduco || v.conduttoreAssente
  const conduttore = v.iscritti.find((i) => i.conduce)?.displayName ?? 'chi conduce'
  const avanti = puo ? () => void s.azione({ tipo: 'avanti' }) : undefined
  const aspetta = (cosa: string) => `Aspetta che ${conduttore} ${cosa}.`

  const giornoDaVedere = pv.fase === 'notte' && pv.notte > 1 && annunciata < pv.notte
  const notte =
    pv.fase === 'ruoli' ||
    (pv.fase === 'notte' && !giornoDaVedere) ||
    (pv.fase === 'decisione' && pv.decisioneDa === 'notte')
  useNotte(notte)

  // Il voto scelto non sopravvive a un'altra votazione.
  useEffect(() => setScelto(null), [pv.fase, pv.giorno])

  // La fine vista arrivare: l'adesivo, e i coriandoli a chi ha vinto.
  const finita = pv.fase === 'finita'
  const vinto = finita && (pv.esito?.vincitori.includes(pv.tu.id) ?? false)
  const festa = useFesta(!finita, vinto)
  const vistaGiocare = useRef(false)
  useEffect(() => {
    if (!finita) {
      vistaGiocare.current = true
      return
    }
    if (!vistaGiocare.current || !pv.esito) return
    vistaGiocare.current = false
    const titolo = VINCITORI[pv.esito.vincitore].titolo
    mostra(
      vinto
        ? { tono: 'vivace', titolo, sotto: 'Hai vinto', durata: 2_600, suono: 'vittoria' }
        : { tono: 'bordato', titolo, sotto: 'Hai perso', durata: 2_600, suono: 'sconfitta' },
    )
  }, [finita, vinto, pv.esito, mostra])

  const titolo =
    pv.fase === 'ruoli'
      ? 'I ruoli'
      : pv.fase === 'finita'
        ? 'Fine'
        : notte
          ? `Notte ${pv.notte}`
          : `Giorno ${pv.giorno}`

  const corpo = (() => {
    const r = pv.richiesta
    switch (pv.fase) {
      case 'ruoli':
        if (!pv.fatto) return <Rivelazione vista={pv} onVisto={() => void s.azione({ tipo: 'ruolo_visto' })} />
        return (
          <Schermo
            piede={
              puo &&
              pv.aspetta.length > 0 && (
                <Button variant="plain" size="lg" fullWidth onClick={avanti}>
                  Comincia la notte senza aspettare
                </Button>
              )
            }
          >
            <div className="lupus-centro">
              <TestaFase
                icona="nascosto"
                titolo="Ruolo nascosto"
                sotto={
                  pv.aspetta.length === 1
                    ? 'Manca 1 giocatore che guardi il suo ruolo.'
                    : `Mancano ${pv.aspetta.length} giocatori che guardino il loro ruolo.`
                }
              />
            </div>
          </Schermo>
        )
      case 'notte':
        if (giornoDaVedere) {
          return <EsitoDelGiorno vista={pv} onAvanti={() => annuncia(pv.notte)} />
        }
        return (
          <>
            <SchermataNotte
              key={`${pv.notte}-${r.tipo === 'indica' || r.tipo === 'notizia' ? r.compito : r.tipo}`}
              vista={pv}
              notte={pv.notte}
              locale={false}
              onScelta={(scelta) => void s.azione({ tipo: 'notte', scelta })}
            />
            {puo && (
              <div className="lupus-conduce">
                <Button variant="plain" fullWidth onClick={avanti}>
                  Chiudi la notte
                </Button>
              </div>
            )}
          </>
        )
      case 'decisione':
        if (r.tipo === 'benvenuto' && !pv.fatto) {
          return (
            <SchermataBenvenuto
              vista={pv}
              richiesta={r}
              onRisposta={(rivela) => void s.azione({ tipo: 'benvenuto', rivela })}
            />
          )
        }
        return (
          <Schermo
            piede={
              puo && (
                <Button variant="plain" size="lg" fullWidth onClick={avanti}>
                  Avanti senza aspettare
                </Button>
              )
            }
          >
            <div className="lupus-centro">
              <TestaFase icona="fantasma" titolo="Un momento" sotto="Chi è morto riceve la notizia." />
            </div>
          </Schermo>
        )
      case 'alba':
        return <Alba vista={pv} onAvanti={avanti} attesa={aspetta('apra la discussione')} />
      case 'discussione':
        return <Discussione vista={pv} onAvanti={avanti} attesa={aspetta('chiuda la discussione')} scarto={s.scarto} />
      case 'nomine': {
        const votante = r.tipo === 'vota' && !pv.fatto ? pv.tu.id : null
        return (
          <Nomine
            vista={pv}
            votante={votante}
            io={pv.tu.id}
            bersagli={r.tipo === 'vota' ? r.bersagli : []}
            scelto={scelto}
            onScegli={(id) => {
              suona('tocco', { volume: 0.6 })
              setScelto(id)
            }}
            onVota={(bersaglio) => void s.azione({ tipo: 'voto', bersaglio })}
            onChiudi={avanti}
            attesa={pv.fatto ? 'Hai votato. Aspetta gli altri.' : 'Aspetta i voti degli altri.'}
          />
        )
      }
      case 'arringhe':
        return <Arringhe vista={pv} onAvanti={avanti} attesa={aspetta('apra il ballottaggio')} scarto={s.scarto} />
      case 'ballottaggio':
        if (r.tipo === 'vota' && !pv.fatto) {
          return (
            <VotoSegreto
              vista={pv}
              bersagli={r.bersagli}
              astensione={r.astensione}
              onVoto={(bersaglio) => void s.azione({ tipo: 'voto', bersaglio })}
            />
          )
        }
        return (
          <Schermo
            piede={
              puo &&
              pv.aspetta.length > 0 && (
                <Button variant="plain" size="lg" fullWidth onClick={avanti}>
                  Chiudi il ballottaggio
                </Button>
              )
            }
          >
            <TestaFase
              icona="teschio"
              tono="sangue"
              titolo="Ballottaggio"
              sotto={
                pv.fatto
                  ? pv.aspetta.length === 1
                    ? 'Hai votato. Manca 1 voto.'
                    : `Hai votato. Mancano ${pv.aspetta.length} voti.`
                  : pv.indiziati.includes(pv.tu.id)
                    ? 'Sei sotto accusa: non voti.'
                    : 'I fantasmi non votano al ballottaggio.'
              }
            />
            <div className="lupus-elenco">
              {pv.indiziati.map((id) => {
                const g = pv.giocatori.find((x) => x.id === id)
                return g ? <TesseraGiocatore key={id} giocatore={g} mostraRuolo={false} /> : null
              })}
            </div>
          </Schermo>
        )
      case 'finita':
        return (
          <Fine
            vista={pv}
            io={pv.tu.id}
            onAncora={v.conduco ? () => void s.ancora() : undefined}
            attesa={`Aspetta che ${conduttore} ne cominci un’altra.`}
            onEsci={onEsci}
            esci="Esci dalla stanza"
          />
        )
    }
  })()

  return (
    <Pagina
      titolo={titolo}
      intera
      indietro={indietroSala}
      azioni={
        <>
          {azioniBase}
          <BottoneBarra etichetta="La cronaca" onClick={() => setCronaca(true)}>
            <IconBook size={20} />
          </BottoneBarra>
          <BottoneBarra etichetta="Il tuo ruolo" onClick={() => setIo(true)}>
            <IconLock size={19} />
          </BottoneBarra>
        </>
      }
    >
      <div className={`lupus${notte ? ' lupus--notte' : ''}`}>{corpo}</div>

      <Sheet open={cronaca} onClose={() => setCronaca(false)} title="La cronaca">
        <Cronaca cronaca={pv.cronaca} giocatori={pv.giocatori} />
      </Sheet>
      <FoglioIo open={io} onClose={() => setIo(false)} pv={pv} codice={v.codice} onEsci={onEsci} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Il proprio ruolo, il diario delle notti, e l'uscita dalla stanza. Lo vede solo chi lo apre. */
function FoglioIo({
  open,
  onClose,
  pv,
  codice,
  onEsci,
}: {
  open: boolean
  onClose: () => void
  pv: VistaGiocatore
  codice: string
  onEsci: () => void
}) {
  const [esco, setEsco] = useState(false)
  const ruolo = pv.tu.ruoloAssunto ?? pv.tu.ruolo
  const p = PERSONAGGI[ruolo]
  useEffect(() => {
    if (!open) setEsco(false)
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Il tuo ruolo">
      <div className="lupus-foglio">
        <div className="lupus-personaggio" style={{ '--ruolo': p.colore } as CSSProperties}>
          <BadgeRuolo ruolo={ruolo} size={56} />
          <span className="lupus-personaggio__testo">
            <strong className="lupus-personaggio__nome">{p.nome}</strong>
            <span className="lupus-personaggio__pillole">
              <PillolaFazione fazione={p.fazione} />
              {!pv.tu.vivo && <span className="lupus-segno">{pv.tu.nonMorto ? 'Mortovivo' : 'Fantasma'}</span>}
            </span>
          </span>
        </div>
        <p className="lupus-foglio__testo">{p.descrizione}</p>
        <p className="lupus-etichetta">Il tuo diario</p>
        <Diario segreti={pv.segreti} giocatori={pv.giocatori} />
        {esco ? (
          <>
            <p className="lupus-foglio__testo">La partita va avanti senza di te.</p>
            <Button variant="destructive" size="lg" fullWidth onClick={onEsci}>
              Esci dalla stanza {codice}
            </Button>
            <Button variant="plain" size="lg" fullWidth onClick={() => setEsco(false)}>
              Resta
            </Button>
          </>
        ) : (
          <Button variant="plain" fullWidth onClick={() => setEsco(true)}>
            Esci dalla stanza
          </Button>
        )}
      </div>
    </Sheet>
  )
}

