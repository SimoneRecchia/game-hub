import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Vuoto } from '@/components/Elementi'
import { IconLink } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { nomePartita } from '@/games/quiz/testi'
import { ApiFetchError, api } from '@/lib/api'
import type { InvitoConLink } from '@shared/types'
import './Battaglia.css'

/**
 * Una sfida a quiz arrivata con un link: come l'invito della battaglia.
 *
 * Chi lo apre senza un account passa prima dalla registrazione, che gli dice
 * chi lo sfida; appena entra la pagina accetta da sola e porta nel duello.
 * Aprire il link e' gia' la risposta.
 */
export default function QuizInvito() {
  const { codice = '' } = useParams()
  const { vai } = useNavigazione()
  const [invito, setInvito] = useState<InvitoConLink | null>(null)
  const [errore, setErrore] = useState<{ codice: string; testo: string } | null>(null)

  useEffect(() => {
    let annullato = false
    void api<InvitoConLink>(`/inviti/${codice}`)
      .then((i) => !annullato && setInvito(i))
      .catch(() => {})
    api<{ duelloId: string }>(`/quiz/sfide/link/${codice}/accetta`, { method: 'POST' })
      .then(({ duelloId }) => {
        if (!annullato) vai(ROTTE.duelloQuiz(duelloId), { replace: true, direzione: 'nessuna' })
      })
      .catch((e) => {
        if (annullato) return
        setErrore(
          e instanceof ApiFetchError
            ? { codice: e.code ?? '', testo: e.message }
            : { codice: '', testo: 'Non riesco ad aprire l’invito: controlla la connessione.' },
        )
      })
    return () => {
      annullato = true
    }
  }, [codice, vai])

  return (
    <Pagina titolo="Sfida a quiz" intera indietro={{ a: ROTTE.libera('quiz'), etichetta: 'Quiz' }}>
      {errore ? (
        <Vuoto
          icona={
            invito ? (
              <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={56} />
            ) : (
              <IconLink size={28} />
            )
          }
          titolo={errore.codice === 'SFIDA_TUA' ? 'È il tuo invito' : 'L’invito non vale più'}
          testo={
            errore.codice === 'SFIDA_TUA'
              ? 'Mandalo a chi vuoi sfidare.'
              : errore.testo
          }
          azione={
            <Button variant="tinted" onClick={() => vai(ROTTE.libera('quiz'), { replace: true })}>
              Vai al quiz
            </Button>
          }
        />
      ) : (
        <div className="bat-invito">
          {invito && <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={64} />}
          <p className="bat-invito__testo">
            {invito ? (
              <>
                <strong>{invito.da.displayName}</strong> ti aspetta per una sfida a quiz
                {invito.sfida ? `: ${nomePartita(invito.sfida)}` : ''}…
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
