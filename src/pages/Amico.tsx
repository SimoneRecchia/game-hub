import { useEffect, useState, type CSSProperties } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Sezione, Vuoto } from '@/components/Elementi'
import { IconPeople } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { GIOCHI_INSIEME, invitaA, salaDi, type GiocoInsieme } from '@/games/amici/amici'
import { ApiFetchError } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatGameDate } from '@/lib/format'
import { DOVE, usePresenza } from '@/lib/presenza'
import { AMICI_POLL_MS } from '@shared/config'
import type { ProfiloAmico } from '@shared/types'
import './Amico.css'

const NOMI: Record<GiocoInsieme, string> = {
  battaglia: 'Battaglia navale',
  quiz: 'Sfida a quiz',
  nomi: 'Nomi, cose e città',
  scarabeo: 'Scarabeo',
  tris: 'Tris',
  indovina: 'Indovina chi',
  scacchi: 'Scacchi',
  dama: 'Dama',
  forza4: 'Forza 4',
  go: 'Go',
  lupus: 'Lupus',
  scarabocchi: 'Scarabocchi',
}

/**
 * Il profilo di un amico: chi e', se e' online e dove, e i giochi a cui lo si
 * invita. Online, un tocco manda l'invito e porta nella sala del gioco, che
 * aspetta la risposta; se non c'e', porta nella sala, da cui lo si invita con
 * un link. Lo stato si rilegge mentre la pagina e' aperta.
 */
export default function Amico() {
  const { nickname = '' } = useParams()
  const io = usePlayer()
  const { vai } = useNavigazione()
  const toast = useToast()
  const { state } = useLocation()
  const da = (state as { da?: string } | null)?.da ?? 'Profilo'
  const { dati: amico, errore, ricarica } = useDati<ProfiloAmico>(`/amici/${encodeURIComponent(nickname)}`)
  const { dati: presenza } = usePresenza()
  const [invio, setInvio] = useState<GiocoInsieme | null>(null)

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

  if (amico && amico.playerId === io.id) return <Navigate to={ROTTE.profilo} replace />

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

  const gioca = async (gioco: GiocoInsieme) => {
    if (!amico || invio) return
    if (!amico.online) {
      vai(salaDi(gioco))
      return
    }
    setInvio(gioco)
    try {
      vai(await invitaA(gioco, amico, presenza?.stanzaLupus ?? null, presenza?.stanzaScarabocchi ?? null))
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Invito non mandato.', 'error')
      void ricarica()
    } finally {
      setInvio(null)
    }
  }

  const nome = amico?.displayName ?? nickname
  const dove = amico?.attivita ? DOVE[amico.attivita] : 'online'
  const stato = !amico ? ' ' : amico.online ? `Online · ${dove}` : 'Non è online'
  return (
    <Pagina titolo={nome} indietro={indietro}>
      <section className={`amico-testa entra${amico?.online ? ' is-online' : ''}`}>
        <span className="amico-testa__alone" aria-hidden="true" />
        <span className="amico-testa__avatar">
          <Avatar nickname={amico?.nickname ?? nickname} color={amico?.avatarColor} size={96} />
          {amico?.online && <span className="amico-testa__online" aria-hidden="true" />}
        </span>
        <span className="amico-testa__chi">
          @{amico?.nickname ?? nickname}
          {amico && ` · nel gruppo dal ${formatGameDate(amico.createdAt.slice(0, 10))}`}
        </span>
        <span className="amico-stato" aria-live="polite">
          {stato}
        </span>
      </section>

      <Sezione titolo={`Gioca con ${nome}`}>
        <ul className="amico-giochi">
          {GIOCHI_INSIEME.map((g, i) => (
            <li key={g} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
              <button
                type="button"
                className={`amico-gioco${invio === g ? ' is-invio' : ''}`}
                style={{ '--c1': `var(--${g}-1)`, '--c2': `var(--${g}-2)` } as CSSProperties}
                disabled={!amico || invio !== null}
                onClick={() => void gioca(g)}
              >
                <Copertina gioco={g} formato="icona" />
                <span className="amico-gioco__nome">{NOMI[g]}</span>
                <span className="amico-gioco__azione">
                  {invio === g ? 'Invito…' : amico?.online ? 'Invita' : 'Con un link'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sezione>
    </Pagina>
  )
}
