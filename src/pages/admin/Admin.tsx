import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import type { AdminIo } from '@shared/admin'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Elenco, Riga, Sezione as SezioneElenco } from '@/components/Elementi'
import { IconChevronLeft, IconLock } from '@/components/Icons'
import { Sheet } from '@/components/Sheet'
import { api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { InAttesa, Sblocco, SenzaAccesso } from './Accesso'
import { AdminContext, messaggioDi, type Chiusura } from './dati'
import { durata } from './formato'
import { GRUPPI, GuscioContext, SEZIONI, indirizzoDi, type IdSezione } from './Schermata'
import Annunci from './sezioni/Annunci'
import Cloudflare from './sezioni/Cloudflare'
import Console from './sezioni/Console'
import Contenuti from './sezioni/Contenuti'
import Database from './sezioni/Database'
import Errori from './sezioni/Errori'
import Fortuna from './sezioni/Fortuna'
import Giocatore from './sezioni/Giocatore'
import Giocatori from './sezioni/Giocatori'
import Giochi from './sezioni/Giochi'
import Panoramica from './sezioni/Panoramica'
import Registro from './sezioni/Registro'
import Sistema from './sezioni/Sistema'
import './Admin.css'

/**
 * Il pannello di amministrazione, a /admin.
 *
 * Tre porte prima del pannello: chi non ha il ruolo vede che non ha accesso;
 * chi ce l'ha ma non ha sbloccato il pannello su questo dispositivo — o lo
 * sblocco e' scaduto — deve chiedere il codice all'email; poi le sezioni. La
 * porta la decide `/admin/io`, e la rimette in discussione ogni risposta del
 * server (`useChiama`): se lo sblocco scade a meta' di una modifica, si torna
 * al codice da qualunque sezione.
 *
 * Il pannello e' un attrezzo a parte e non una scheda: la tab bar e il menu dei
 * giochi spariscono (Admin.css), e al loro posto, sul computer, c'e' il menu
 * delle sezioni. Una rotta sola (`/admin/*`), cosi' cambiando sezione il menu
 * resta dov'e'; le sezioni sostituiscono l'indirizzo invece di aggiungerne uno,
 * e la freccia indietro torna al profilo e non alla sezione di prima.
 */

/** Chi sono per il pannello, fra una visita e l'altra: tornandoci non si rivede l'attesa. */
let ioRicordato: AdminIo | null = null

export default function Admin() {
  const resto = useParams()['*'] ?? ''
  const [io, setIo] = useState<AdminIo | null>(ioRicordato)
  const [errore, setErrore] = useState<string | null>(null)

  const cambiaIo = useCallback((nuovo: AdminIo) => {
    ioRicordato = nuovo
    setIo(nuovo)
  }, [])

  const leggi = useCallback(async () => {
    setErrore(null)
    try {
      cambiaIo(await api<AdminIo>('/admin/io'))
    } catch (e) {
      setErrore(messaggioDi(e, 'Non riesco a raggiungere il pannello.'))
    }
  }, [cambiaIo])

  useEffect(() => {
    void leggi()
  }, [leggi])

  // Lo sblocco scade: alla sua ora il pannello si richiude da solo, senza aspettare la prossima richiesta.
  const fino = io?.sbloccatoFino ?? null
  useEffect(() => {
    if (!fino) return
    const resta = new Date(fino).getTime() - Date.now()
    if (resta > 2 ** 31 - 1) return
    const t = window.setTimeout(() => setIo((x) => (x ? { ...x, sbloccatoFino: null } : x)), Math.max(0, resta))
    return () => window.clearTimeout(t)
  }, [fino])

  const segnala = useCallback(
    (perche: Chiusura) => {
      setIo((x) => {
        if (!x) return x
        const dopo = perche === 'negato' ? { ...x, admin: false, sbloccatoFino: null } : { ...x, sbloccatoFino: null }
        ioRicordato = dopo
        return dopo
      })
      void leggi()
    },
    [leggi],
  )

  const contesto = useMemo(() => (io ? { io, segnala, cambiaIo } : null), [io, segnala, cambiaIo])

  if (!io) return <InAttesa errore={errore} onRiprova={() => void leggi()} />
  if (!io.admin) return <SenzaAccesso />
  if (!io.sbloccatoFino) return <Sblocco io={io} onSbloccato={cambiaIo} />

  return (
    <AdminContext.Provider value={contesto}>
      <Pannello resto={resto} io={io} />
    </AdminContext.Provider>
  )
}

/** Dall'indirizzo, la sezione e il giocatore aperto: "giocatori/abc" e' il giocatore abc. */
function sezioneDa(resto: string): { sezione: IdSezione | null; giocatore: string | null } {
  const [prima, seconda] = resto.split('/').filter(Boolean)
  if (!prima) return { sezione: 'panoramica', giocatore: null }
  const sezione = SEZIONI.find((s) => s.id === prima)?.id ?? null
  if (sezione === 'giocatori' && seconda) return { sezione, giocatore: decodeURIComponent(seconda) }
  return { sezione, giocatore: null }
}

function Pannello({ resto, io }: { resto: string; io: AdminIo }) {
  const { sezione, giocatore } = sezioneDa(resto)
  const [menu, setMenu] = useState(false)
  const guscio = useMemo(() => ({ apriMenu: () => setMenu(true) }), [])

  if (!sezione) return <Navigate to={ROTTE.admin()} replace />

  return (
    <GuscioContext.Provider value={guscio}>
      <Laterale attiva={sezione} io={io} />
      {/* Ogni schermata ha la sua chiave: cambiando sezione la pagina ricomincia dal titolo. */}
      <Contenuto key={giocatore ? `g:${giocatore}` : sezione} sezione={sezione} giocatore={giocatore} />
      <MenuSezioni aperto={menu} onChiudi={() => setMenu(false)} attiva={sezione} />
    </GuscioContext.Provider>
  )
}

function Contenuto({ sezione, giocatore }: { sezione: IdSezione; giocatore: string | null }) {
  if (giocatore) return <Giocatore id={giocatore} />
  switch (sezione) {
    case 'panoramica':
      return <Panoramica />
    case 'giocatori':
      return <Giocatori />
    case 'giochi':
      return <Giochi />
    case 'contenuti':
      return <Contenuti />
    case 'fortuna':
      return <Fortuna />
    case 'cloudflare':
      return <Cloudflare />
    case 'database':
      return <Database />
    case 'sql':
      return <Console />
    case 'annunci':
      return <Annunci />
    case 'registro':
      return <Registro />
    case 'errori':
      return <Errori />
    case 'sistema':
      return <Sistema />
  }
}

/**
 * Il menu delle sezioni sul computer, al posto di quello dei giochi: lo stesso
 * vetro e lo stesso posto, i gruppi delle sezioni, e in fondo chi sono, quanto
 * resta dello sblocco e la strada per tornare ai giochi.
 */
function Laterale({ attiva, io }: { attiva: IdSezione; io: AdminIo }) {
  const player = usePlayer()
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAdesso(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const resta = io.sbloccatoFino ? new Date(io.sbloccatoFino).getTime() - adesso : 0
  return (
    <aside className="adm-laterale" aria-label="Sezioni del pannello">
      <Collegamento to={ROTTE.admin()} direzione="scheda" replace className="adm-laterale__marchio">
        {/* L'impronta nell'indirizzo la scrive npm run icone. */}
        <img src="/icon.svg?v=cdd019ff" alt="" width={30} height={30} />
        <span>Giochi</span>
        <span className="adm-laterale__admin">Admin</span>
      </Collegamento>
      <nav className="adm-laterale__voci">
        {GRUPPI.map((g) => (
          <div key={g} className="adm-laterale__gruppo">
            <p className="adm-laterale__gruppo-nome">{g}</p>
            <ul>
              {SEZIONI.filter((s) => s.gruppo === g).map((s) => (
                <li key={s.id}>
                  <Collegamento
                    to={indirizzoDi(s.id)}
                    direzione="scheda"
                    replace
                    className={`adm-laterale__voce${s.id === attiva ? ' is-attiva' : ''}`}
                    aria-current={s.id === attiva ? 'page' : undefined}
                  >
                    <s.Icona size={19} />
                    <span>{s.nome}</span>
                  </Collegamento>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="adm-laterale__piede">
        <div className="adm-laterale__io">
          <Avatar nickname={player.nickname} color={player.avatarColor} size={30} />
          <span className="adm-laterale__io-testo">
            <span className="adm-laterale__io-nome">{player.displayName}</span>
            <span className="adm-laterale__io-sotto">
              <IconLock size={11} /> {resta > 0 ? `Aperto ancora ${durata(resta)}` : 'In chiusura'}
            </span>
          </span>
        </div>
        <Collegamento to={ROTTE.home} direzione="scheda" className="adm-laterale__esci">
          <IconChevronLeft size={16} />
          Torna ai giochi
        </Collegamento>
      </div>
    </aside>
  )
}

/** Le sezioni sul telefono: un foglio con i gruppi, e la spunta su quella aperta. */
function MenuSezioni({ aperto, onChiudi, attiva }: { aperto: boolean; onChiudi: () => void; attiva: IdSezione }) {
  const { vai } = useNavigazione()
  return (
    <Sheet open={aperto} onClose={onChiudi} title="Sezioni">
      {GRUPPI.map((g) => (
        <SezioneElenco key={g} titolo={g} className="adm-menu__gruppo">
          <Elenco>
            {SEZIONI.filter((s) => s.gruppo === g).map((s) => (
              <Riga
                key={s.id}
                icona={<s.Icona size={18} />}
                titolo={s.nome}
                scelta={s.id === attiva}
                onClick={() => {
                  onChiudi()
                  vai(indirizzoDi(s.id), { direzione: 'scheda', replace: true })
                }}
              />
            ))}
          </Elenco>
        </SezioneElenco>
      ))}
    </Sheet>
  )
}
