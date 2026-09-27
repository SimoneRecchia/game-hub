import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Vuoto } from '@/components/Elementi'
import { IconLink } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { ApiFetchError, api } from '@/lib/api'
import type { InvitoConLink } from '@shared/types'
import './Battaglia.css'

/**
 * Un invito a battaglia navale arrivato con un link.
 *
 * Chi lo apre senza un account passa prima dalla registrazione (vedi App.tsx),
 * che gli dice chi lo sta sfidando; appena entra, l'indirizzo e' ancora questo,
 * e la pagina accetta da sola e porta nella partita. Non c'e' un "vuoi
 * accettare?": aprire il link e' gia' la risposta, e chi si e' appena
 * registrato apposta non deve cercare un altro bottone.
 */
export default function BattagliaInvito() {
  const { codice = '' } = useParams()
  const { vai } = useNavigazione()
  const [invito, setInvito] = useState<InvitoConLink | null>(null)
  const [errore, setErrore] = useState<{ codice: string; testo: string } | null>(null)

  useEffect(() => {
    let annullato = false
    void api<InvitoConLink>(`/inviti/${codice}`)
      .then((i) => !annullato && setInvito(i))
      .catch(() => {})
    api<{ partitaId: string }>(`/battaglia/link/${codice}/accetta`, { method: 'POST' })
      .then(({ partitaId }) => {
        if (!annullato) vai(ROTTE.partitaBattaglia(partitaId), { replace: true, direzione: 'nessuna' })
      })
      .catch((e) => {
        if (annullato) return
        setErrore(
          e instanceof ApiFetchError
            ? { codice: e.code ?? '', testo: e.message }
            : { codice: '', testo: 'Non riesco ad aprire l’invito.' },
        )
      })
    return () => {
      annullato = true
    }
  }, [codice, vai])

  return (
    <Pagina titolo="Invito" intera indietro={{ a: ROTTE.libera('battaglia'), etichetta: 'Battaglia' }}>
      {errore ? (
        <Vuoto
          icona={
            invito ? (
              <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={56} />
            ) : (
              <IconLink size={28} />
            )
          }
          titolo={errore.codice === 'LINK_TUO' ? 'È il tuo invito' : 'L’invito non vale più'}
          testo={errore.codice === 'LINK_TUO' ? 'Mandalo a chi vuoi sfidare.' : errore.testo}
          azione={
            <Button variant="tinted" onClick={() => vai(ROTTE.libera('battaglia'), { replace: true })}>
              Vai alla battaglia navale
            </Button>
          }
        />
      ) : (
        <div className="bat-invito">
          {invito && <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={64} />}
          <p className="bat-invito__testo">
            {invito ? (
              <>
                <strong>{invito.da.displayName}</strong> ti aspetta per una battaglia navale…
              </>
            ) : (
              'Apro l’invito…'
            )}
          </p>
          <span className="bat-sala__onde" aria-hidden="true" />
        </div>
      )}
    </Pagina>
  )
}
