import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Vuoto } from '@/components/Elementi'
import { IconLink } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { SFIDE_LIBERE } from '@/games/sfide/giochi'
import { ApiFetchError, api } from '@/lib/api'
import type { GiocoSfidaLibera } from '@shared/sfide-libere'
import type { InvitoConLink } from '@shared/types'
import './Battaglia.css'

/**
 * Una sfida a una libera da soli arrivata con un link. Come per gli altri
 * giochi: aprirlo e' gia' accettarlo, e chi non ha un account passa prima dalla
 * registrazione, che gli dice chi lo sfida.
 */
export default function SfidaLiberaInvito({ gioco }: { gioco: GiocoSfidaLibera }) {
  const { codice = '' } = useParams()
  const { vai } = useNavigazione()
  const [invito, setInvito] = useState<InvitoConLink | null>(null)
  const [errore, setErrore] = useState<{ codice: string; testo: string } | null>(null)
  const info = SFIDE_LIBERE[gioco]

  useEffect(() => {
    let annullato = false
    void api<InvitoConLink>(`/inviti/${codice}`)
      .then((i) => !annullato && setInvito(i))
      .catch(() => {})
    api<{ partitaId: string; gioco: GiocoSfidaLibera }>(`/sfide/link/${codice}/accetta`, { method: 'POST' })
      .then(({ partitaId, gioco: suo }) => {
        if (!annullato) vai(ROTTE.sfidaLibera(suo, partitaId), { replace: true, direzione: 'nessuna' })
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
    <Pagina titolo="Invito" intera indietro={{ a: ROTTE.libera(gioco), etichetta: info.nome }}>
      {errore ? (
        <Vuoto
          icona={
            invito ? (
              <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={56} />
            ) : (
              <IconLink size={28} />
            )
          }
          titolo={errore.codice === 'INVITO_TUO' ? 'È il tuo invito' : 'L’invito non vale più'}
          testo={errore.codice === 'INVITO_TUO' ? 'Mandalo a chi vuoi sfidare.' : errore.testo}
          azione={
            <Button variant="tinted" onClick={() => vai(ROTTE.libera(gioco), { replace: true })}>
              Vai a {info.nome}
            </Button>
          }
        />
      ) : (
        <div className="bat-invito">
          {invito && <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={64} />}
          <p className="bat-invito__testo">
            {invito ? (
              <>
                <strong>{invito.da.displayName}</strong> {info.sfida.replace(/\.$/, '…')}
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
