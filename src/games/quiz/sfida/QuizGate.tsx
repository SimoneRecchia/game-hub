import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { nomePartita } from '@/games/quiz/testi'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { usePresenza } from '@/lib/presenza'
import { NOMI_MODI, diGeografia, nomeAmbito, nomeGenere } from '@shared/quiz'
import { giornoInLettere } from '@shared/quiz-cultura'
import type { DuelloBreve, InvitoQuiz } from '@shared/types'
import '@/games/wordle/coop/InviteAlert.css'

const CHIAVE_ANNUNCIATI = 'quiz:duelli-annunciati'

function leggiAnnunciati(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CHIAVE_ANNUNCIATI) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * Le sfide a quiz, da qualunque schermata: come quelle della battaglia, dallo
 * stesso giro di controllo. Aspettano il loro turno se c'e' gia' un altro
 * avviso — un invito del Wordle, una sfida a battaglia — perché due insieme
 * non si leggerebbero.
 *
 * Dice anche quando l'altro ha accettato: chi ha sfidato con un link e poi e'
 * andato altrove deve sapere che la sfida comincia. Le rivincite, dentro la
 * pagina del duello, le mostra gia' la fine del duello.
 */
export function QuizGate() {
  const { vai } = useNavigazione()
  const { pathname } = useLocation()
  const { dati, aggiorna } = usePresenza()
  const [risposte, setRisposte] = useState<Set<string>>(new Set())
  const [annunciati, setAnnunciati] = useState<Set<string>>(leggiAnnunciati)

  const nelDuello = pathname.startsWith('/quiz/duello/')
  const altroAvviso =
    ((dati?.coop.length ?? 0) > 0 && !pathname.startsWith('/wordle/insieme/')) ||
    (!pathname.startsWith('/battaglia-navale/partita/') && (dati?.battaglia.length ?? 0) > 0)
  const sfida = altroAvviso
    ? null
    : (dati?.quiz.find((s) => !risposte.has(s.id) && !(s.rivincita && nelDuello)) ?? null)
  const duello = dati?.duello ?? null
  const daAnnunciare =
    !sfida && !altroAvviso && duello && duello.stato === 'attesa' && !nelDuello && !annunciati.has(duello.id)
      ? duello
      : null

  const segnaAnnunciato = (id: string) => {
    setAnnunciati((prima) => {
      const dopo = new Set(prima).add(id)
      try {
        sessionStorage.setItem(CHIAVE_ANNUNCIATI, JSON.stringify([...dopo]))
      } catch {
        /* senza sessionStorage l'avviso ricomparira' al prossimo caricamento */
      }
      return dopo
    })
  }

  if (sfida) {
    return (
      <AvvisoSfida
        sfida={sfida}
        onAccetta={async () => {
          const { duelloId } = await api<{ duelloId: string }>(`/quiz/sfide/${sfida.id}/accetta`, { method: 'POST' })
          setRisposte((prima) => new Set(prima).add(sfida.id))
          segnaAnnunciato(duelloId)
          aggiorna()
          vai(ROTTE.duelloQuiz(duelloId))
        }}
        onRifiuta={async () => {
          setRisposte((prima) => new Set(prima).add(sfida.id))
          await api(`/quiz/sfide/${sfida.id}/rifiuta`, { method: 'POST' }).catch(() => {})
          aggiorna()
        }}
      />
    )
  }

  if (daAnnunciare) {
    return (
      <AvvisoDuello
        duello={daAnnunciare}
        onVai={() => {
          segnaAnnunciato(daAnnunciare.id)
          vai(ROTTE.duelloQuiz(daAnnunciare.id))
        }}
        onDopo={() => segnaAnnunciato(daAnnunciare.id)}
      />
    )
  }

  return null
}

function AvvisoSfida({
  sfida,
  onAccetta,
  onRifiuta,
}: {
  sfida: InvitoQuiz
  onAccetta: () => Promise<void>
  onRifiuta: () => Promise<void>
}) {
  const [occupato, setOccupato] = useState<'accetta' | 'rifiuta' | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const restano = useCountdown(sfida.scadeTraMs)

  useEffect(() => {
    haptic('success')
    suona('invito')
  }, [sfida.id])

  async function rispondi(azione: 'accetta' | 'rifiuta') {
    setOccupato(azione)
    setErrore(null)
    try {
      if (azione === 'accetta') await onAccetta()
      else await onRifiuta()
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Risposta non inviata. Riprova.')
    } finally {
      setOccupato(null)
    }
  }

  const r = sfida.sfida
  // Qui non ci sono i nomi dei paesi: per la geografia basta il modo.
  const come = diGeografia(r.categoria)
    ? NOMI_MODI[r.modo]
    : (nomeAmbito(r.categoria, r.ambito) ?? (r.giorno ? giornoInLettere(r.giorno) : null))
  const cosa = [nomePartita(r), come, nomeGenere(r.categoria, r.genere), r.nazione, `${r.quante} domande`]
    .filter(Boolean)
    .join(' · ')
  return (
    <Sheet open onClose={() => {}} dismissible={false} title={sfida.rivincita ? 'Rivincita' : 'Sfida a quiz'}>
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={sfida.da.nickname} color={sfida.da.avatarColor} size={64} />
          <p className="avviso__testo">
            {sfida.rivincita ? (
              <>
                <strong>{sfida.da.displayName}</strong> vuole la rivincita.
              </>
            ) : (
              <>
                <strong>{sfida.da.displayName}</strong> ti sfida a un quiz: {cosa}.
              </>
            )}
          </p>
        </div>
        <p className="avviso__sereno">
          Scade fra <span className="u-tabnum">{formatCronometro(restano)}</span>.
        </p>
        {errore && <p className="avviso__errore">{errore}</p>}
        <div className="avviso__azioni">
          <Button
            size="lg"
            fullWidth
            loading={occupato === 'accetta'}
            disabled={occupato !== null || restano === 0}
            onClick={() => void rispondi('accetta')}
          >
            {sfida.rivincita ? 'Gioca ancora' : 'Accetta la sfida'}
          </Button>
          <Button
            variant="plain"
            size="lg"
            fullWidth
            loading={occupato === 'rifiuta'}
            disabled={occupato !== null}
            onClick={() => void rispondi('rifiuta')}
          >
            Non adesso
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function AvvisoDuello({ duello, onVai, onDopo }: { duello: DuelloBreve; onVai: () => void; onDopo: () => void }) {
  useEffect(() => {
    suona('entra')
  }, [duello.id])
  return (
    <Sheet open onClose={onDopo} title="Sfida a quiz">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={duello.avversario.nickname} color={duello.avversario.avatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{duello.avversario.displayName}</strong> ha accettato la tua sfida.
          </p>
        </div>
        <div className="avviso__azioni">
          <Button size="lg" fullWidth onClick={onVai}>
            Alla sfida
          </Button>
          <Button variant="plain" size="lg" fullWidth onClick={onDopo}>
            Più tardi
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
