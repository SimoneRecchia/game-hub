import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Sezione, Vuoto } from '@/components/Elementi'
import { IconChevronRight, IconPeople } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { GIOCHI_INSIEME, invitaA, type GiocoInsieme } from '@/games/amici/amici'
import { ApiFetchError, api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatGameDate, formatNumber } from '@/lib/format'
import { DOVE, usePresenza } from '@/lib/presenza'
import { AMICI_POLL_MS } from '@shared/config'
import { NOMI_CHIAMATA } from '@shared/notifiche'
import { conSegno } from '@shared/ruota'
import type { GiocoClassificato, ProfiloAmico, PuntiDelPeriodo, PuntiGiocatore } from '@shared/types'
import { ContiDi } from './classifica/Conti'
import { NOMI_CLASSIFICHE, ORDINE_GIOCHI } from './classifica/voci'
import './Amico.css'

/**
 * Il profilo di una persona del gruppo: chi e', se e' online e dove, il gioco
 * che preferisce, i suoi posti nella generale e i punti di ogni gioco. Gli
 * inviti stanno dietro un bottone solo, che apre i giochi in un foglio: online
 * l'invito e' quello della sala del gioco, e si va li' ad aspettare la
 * risposta; se non c'e' gli arriva una notifica (`/chiamate`), e quando
 * risponde l'invito vero lo manda lui.
 *
 * E' anche il proprio: dalla classifica ci si arriva toccando chiunque, se
 * stessi compresi, e allora al posto dell'invito ogni gioco apre i propri
 * numeri. Lo stato si rilegge mentre la pagina e' aperta; i punti no, perché
 * non cambiano mentre li si guarda.
 */
export default function Amico() {
  const { nickname = '' } = useParams()
  const io = usePlayer()
  const { vai } = useNavigazione()
  const toast = useToast()
  const { state } = useLocation()
  const da = (state as { da?: string } | null)?.da ?? 'Profilo'
  const chiave = encodeURIComponent(nickname)
  const { dati: amico, errore, ricarica } = useDati<ProfiloAmico>(`/amici/${chiave}`)
  const { dati: punti } = useDati<PuntiGiocatore>(`/amici/${chiave}/punti`)
  const { dati: presenza } = usePresenza()
  const [inviti, setInviti] = useState(false)
  const [invio, setInvio] = useState<GiocoInsieme | null>(null)
  const [conti, setConti] = useState<GiocoClassificato | null>(null)

  useEffect(() => {
    const giro = () => {
      if (document.visibilityState === 'visible') void ricarica()
    }
    const t = window.setInterval(giro, AMICI_POLL_MS)
    document.addEventListener('visibilitychange', giro)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', giro)
    }
  }, [ricarica])

  const mio = amico ? amico.playerId === io.id : nickname.toLowerCase() === io.nickname.toLowerCase()
  const indietro = { a: ROTTE.profilo, etichetta: da }
  if (errore && !amico) {
    return (
      <Pagina titolo={nickname} indietro={indietro}>
        <Vuoto
          icona={<IconPeople size={28} />}
          titolo="Non trovo questo giocatore"
          testo={errore}
          azione={
            <Button variant="tinted" onClick={() => void ricarica()}>
              Riprova
            </Button>
          }
        />
      </Pagina>
    )
  }

  const nome = amico?.displayName ?? nickname

  const invita = async (gioco: GiocoInsieme) => {
    if (!amico || invio) return
    setInvio(gioco)
    try {
      if (amico.online) {
        const dove = await invitaA(gioco, amico, presenza?.stanzaLupus ?? null, presenza?.stanzaScarabocchi ?? null)
        setInviti(false)
        vai(dove)
      } else {
        const { avvisato } = await api<{ avvisato: boolean }>('/chiamate', {
          method: 'POST',
          body: { playerId: amico.playerId, gioco },
        })
        setInviti(false)
        toast.show(
          avvisato ? `Invito mandato: a ${nome} arriva una notifica.` : `Invito mandato: ${nome} lo vedrà quando apre l’app.`,
          'success',
        )
      }
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Invito non mandato.', 'error')
      void ricarica()
    } finally {
      setInvio(null)
    }
  }

  const dove = amico?.attivita ? DOVE[amico.attivita] : 'online'
  const stato = !amico ? ' ' : mio ? 'Sei tu' : amico.online ? `Online · ${dove}` : 'Non è online'
  return (
    <Pagina titolo={nome} indietro={indietro}>
      <section className={`amico-testa entra${amico?.online && !mio ? ' is-online' : ''}`}>
        <span className="amico-testa__alone" aria-hidden="true" />
        <span className="amico-testa__avatar">
          <Avatar nickname={amico?.nickname ?? nickname} color={amico?.avatarColor} size={96} />
          {amico?.online && !mio && <span className="amico-testa__online" aria-hidden="true" />}
        </span>
        <span className="amico-testa__chi">
          @{amico?.nickname ?? nickname}
          {amico && ` · nel gruppo dal ${formatGameDate(amico.createdAt.slice(0, 10))}`}
        </span>
        <span className="amico-stato" aria-live="polite">
          {stato}
        </span>
      </section>

      {!mio && (
        <div className="amico-invita entra" style={{ '--n': 1 } as CSSProperties}>
          <Button size="lg" fullWidth disabled={!amico} onClick={() => setInviti(true)}>
            Invita a giocare
          </Button>
        </div>
      )}

      {punti ? (
        <Numeri punti={punti} mio={mio} onConti={mio ? setConti : null} />
      ) : (
        <div className="amico-attesa" aria-hidden="true">
          <div className="scheletro amico-attesa__numeri" />
          <div className="scheletro amico-attesa__giochi" />
        </div>
      )}

      <Sheet open={inviti} onClose={() => setInviti(false)} title={`Invita ${nome}`}>
        {inviti && amico && (
          <div className="amico-inviti">
            <p className="amico-inviti__nota">
              {amico.online ? `${nome} è online: l’invito arriva subito.` : `${nome} non è online: gli arriva una notifica.`}
            </p>
            <ul className="amico-giochi">
              {GIOCHI_INSIEME.map((g, i) => (
                <li key={g} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
                  <button
                    type="button"
                    className={`amico-gioco${invio === g ? ' is-invio' : ''}`}
                    style={colori(g)}
                    disabled={invio !== null}
                    onClick={() => void invita(g)}
                  >
                    <Copertina gioco={g} formato="icona" />
                    <span className="amico-gioco__nome">{NOMI_CHIAMATA[g]}</span>
                    {invio === g && <span className="amico-gioco__azione">Invito…</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Sheet>

      <Sheet open={conti !== null} onClose={() => setConti(null)} title={conti ? `I tuoi numeri · ${NOMI_CLASSIFICHE[conti]}` : undefined}>
        {conti && <ContiDi gioco={conti} />}
      </Sheet>
    </Pagina>
  )
}

function colori(gioco: string): CSSProperties {
  return { '--c1': `var(--${gioco}-1)`, '--c2': `var(--${gioco}-2)` } as CSSProperties
}

/** "3º", o un trattino per chi nel periodo non ha giocato. */
const posto = (p: PuntiDelPeriodo) => (p.rank === null ? '–' : `${p.rank}º`)

/**
 * I numeri: il gioco preferito, i posti nella generale del mese e di sempre, e
 * i punti di ogni gioco in due colonne, il mese e da sempre. I giochi mai
 * giocati non hanno una riga: stanno in fondo, solo l'icona.
 */
function Numeri({
  punti,
  mio,
  onConti,
}: {
  punti: PuntiGiocatore
  mio: boolean
  onConti: ((g: GiocoClassificato) => void) | null
}) {
  const { mese, sempre, preferito } = punti
  const giocati = ORDINE_GIOCHI.filter((g) => sempre.perGioco[g] > 0 || mese.perGioco[g] > 0).sort(
    (a, b) => sempre.perGioco[b] - sempre.perGioco[a] || mese.perGioco[b] - mese.perGioco[a],
  )
  const mai = ORDINE_GIOCHI.filter((g) => !giocati.includes(g))
  const massimo = Math.max(1, ...giocati.map((g) => sempre.perGioco[g]))

  return (
    <>
      <div className="amico-numeri entra" style={{ '--n': 2 } as CSSProperties}>
        {preferito && (
          <div className="amico-preferito" style={colori(preferito)}>
            <Copertina gioco={preferito} formato="icona" />
            <span className="amico-preferito__testo">
              <span className="amico-preferito__sopra">{mio ? 'Il tuo gioco preferito' : 'Gioco preferito'}</span>
              <span className="amico-preferito__nome">{NOMI_CLASSIFICHE[preferito]}</span>
            </span>
            <span className="amico-preferito__stella" aria-hidden="true">
              ★
            </span>
          </div>
        )}
        <dl className="amico-posti">
          <div className="amico-posto">
            <dt>Questo mese</dt>
            <dd>
              <span className="amico-posto__rank u-tabnum">{posto(mese)}</span>
              <span className="amico-posto__sotto u-tabnum">
                {mese.rank === null ? 'non ha giocato' : `${formatNumber(mese.punti)} punti`}
              </span>
            </dd>
          </div>
          <div className="amico-posto">
            <dt>Da sempre</dt>
            <dd>
              <span className="amico-posto__rank u-tabnum">{posto(sempre)}</span>
              <span className="amico-posto__sotto u-tabnum">
                {sempre.rank === null ? 'non ha giocato' : `${formatNumber(sempre.punti)} punti`}
              </span>
            </dd>
          </div>
          <div className="amico-posto">
            <dt>Partite</dt>
            <dd>
              <span className="amico-posto__rank u-tabnum">{formatNumber(sempre.partite)}</span>
              <span className="amico-posto__sotto">classificate</span>
            </dd>
          </div>
        </dl>
      </div>

      <Sezione titolo={mio ? 'I tuoi punteggi' : 'Punteggi'}>
        {giocati.length === 0 && sempre.fortuna === 0 && sempre.storici === 0 ? (
          <p className="amico-vuoto">Nessuna classificata, per ora.</p>
        ) : (
          <div className={`amico-punti entra${onConti ? ' amico-punti--tocca' : ''}`} style={{ '--n': 3 } as CSSProperties}>
            <div className="amico-punti__testa" aria-hidden="true">
              <span />
              <span />
              <span>Mese</span>
              <span>Sempre</span>
              {onConti && <span />}
            </div>
            <ul className="amico-punti__elenco">
              {giocati.map((g) => (
                <RigaPunti
                  key={g}
                  gioco={g}
                  nome={NOMI_CLASSIFICHE[g]}
                  mese={formatNumber(mese.perGioco[g])}
                  sempre={formatNumber(sempre.perGioco[g])}
                  quota={sempre.perGioco[g] / massimo}
                  onClick={onConti ? () => onConti(g) : undefined}
                />
              ))}
              {sempre.storici !== 0 && (
                <RigaPunti
                  gioco="battaglia"
                  nome="Battaglia e tris"
                  sotto="quando erano classificate"
                  mese={formatNumber(mese.storici)}
                  sempre={formatNumber(sempre.storici)}
                />
              )}
              {(sempre.fortuna !== 0 || mese.fortuna !== 0) && (
                <RigaPunti
                  gioco="fortuna"
                  nome="Fortuna"
                  sotto="vinto o perso"
                  mese={conSegno(mese.fortuna)}
                  sempre={conSegno(sempre.fortuna)}
                />
              )}
            </ul>
          </div>
        )}
        {mai.length > 0 && giocati.length > 0 && (
          <div className="amico-mai">
            <span className="amico-mai__titolo">Non ancora giocati</span>
            <span className="amico-mai__icone">
              {mai.map((g) => (
                <span key={g} title={NOMI_CLASSIFICHE[g]} aria-label={NOMI_CLASSIFICHE[g]} role="img">
                  <Copertina gioco={g} formato="icona" />
                </span>
              ))}
            </span>
          </div>
        )}
      </Sezione>
    </>
  )
}

function RigaPunti({
  gioco,
  nome,
  sotto,
  mese,
  sempre,
  quota,
  onClick,
}: {
  gioco: string
  nome: string
  sotto?: string
  mese: string
  sempre: string
  /** Da 0 a 1: la barra, rispetto al gioco con piu' punti. */
  quota?: number
  onClick?: () => void
}) {
  const corpo = (
    <>
      <Copertina gioco={gioco as GiocoClassificato} formato="icona" />
      <span className="amico-riga__chi">
        <span className="amico-riga__nome">{nome}</span>
        {quota !== undefined ? (
          <span className="amico-riga__barra" aria-hidden="true">
            <span style={{ width: `${Math.max(4, quota * 100)}%` }} />
          </span>
        ) : (
          sotto && <span className="amico-riga__sotto">{sotto}</span>
        )}
      </span>
      <span className="amico-riga__mese u-tabnum">{mese}</span>
      <span className="amico-riga__sempre u-tabnum">{sempre}</span>
      {onClick && <IconChevronRight size={16} className="amico-riga__freccia" />}
    </>
  )
  return (
    <li className="amico-riga" style={colori(gioco)}>
      {onClick ? (
        <button type="button" className="amico-riga__corpo amico-riga__corpo--tocca" onClick={onClick}>
          {corpo}
        </button>
      ) : (
        <div className="amico-riga__corpo">{corpo}</div>
      )}
    </li>
  )
}
