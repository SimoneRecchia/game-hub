import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconChevronLeft, IconInfo, IconTrophy } from '@/components/Icons'
import { ComeSiGiocaBattaglia } from '@/games/battaglia/ComeSiGioca'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro, pluralize } from '@/lib/format'
import { BATTAGLIA_POLL_LOBBY_MS } from '@shared/config'
import type { Attivita, GiocatoreOnline, InvitoInviato, LobbyBattaglia } from '@shared/types'
import './Battaglia.css'

const DOVE: Record<Attivita, string> = {
  hub: 'nell’hub',
  wordle: 'gioca a Wordle',
  scarabeo: 'gioca a Scarabeo',
  cruciverba: 'fa il cruciverba',
  battaglia: 'nella sala della battaglia',
  classifica: 'guarda la classifica',
  profilo: 'nel profilo',
  altro: 'online',
}

/**
 * La sala d'attesa della battaglia navale: chi e' online adesso, e la sfida.
 *
 * Si guarda ogni tre secondi, perché qui si aspetta una risposta: quando la
 * sfida viene accettata si entra nella partita da soli, senza toccare niente.
 */
export default function BattagliaLobby() {
  const navigate = useNavigate()
  const [dati, setDati] = useState<LobbyBattaglia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState<string | null>(null)
  const [aiuto, setAiuto] = useState(false)
  const [avviso, setAvviso] = useState<string | null>(null)

  const carica = useCallback(async () => {
    try {
      const nuovi = await api<LobbyBattaglia>('/battaglia/lobby')
      setDati(nuovi)
      setErrore(null)
      // La sfida mandata e' stata accettata: si va alla partita.
      const accettata = nuovi.inviti.find((i) => i.stato === 'accettato' && i.partitaId)
      if (accettata && nuovi.partita?.id === accettata.partitaId) {
        navigate(`/battaglia/${accettata.partitaId}`)
      }
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare la sala.')
    }
  }, [navigate])

  useEffect(() => {
    void carica()
    const giro = setInterval(() => {
      if (document.visibilityState === 'visible') void carica()
    }, BATTAGLIA_POLL_LOBBY_MS)
    return () => clearInterval(giro)
  }, [carica])

  const sfida = async (g: GiocatoreOnline) => {
    setInvio(g.playerId)
    setAvviso(null)
    try {
      await api('/battaglia/sfida', { method: 'POST', body: { playerId: g.playerId } })
      await carica()
    } catch (err) {
      setAvviso(err instanceof ApiFetchError ? err.message : 'La sfida non è partita.')
    } finally {
      setInvio(null)
    }
  }

  const annulla = async (invito: InvitoInviato) => {
    await api(`/battaglia/sfide/${invito.id}/annulla`, { method: 'POST' }).catch(() => {})
    await carica()
  }

  const inAttesa = dati?.inviti.find((i) => i.stato === 'attesa') ?? null
  // L'esito dell'ultima sfida, se e' andata male: si dice, una volta.
  const ultima = dati?.inviti[0] ?? null
  const esitoUltima =
    ultima && !inAttesa && (ultima.stato === 'rifiutato' || ultima.stato === 'scaduto') ? ultima : null

  return (
    <AppShell
      title="Battaglia navale"
      hideTabBar
      leading={
        <button type="button" className="navbtn" onClick={() => navigate('/')} aria-label="Torna all'hub">
          <IconChevronLeft size={22} />
        </button>
      }
      trailing={
        <button type="button" className="navbtn" onClick={() => setAiuto(true)} aria-label="Come si gioca">
          <IconInfo size={21} />
        </button>
      }
    >
      <div className="bat-sala">
        {errore && !dati ? (
          <div className="bat__ripiego">
            <p>{errore}</p>
            <Button variant="tinted" onClick={() => void carica()}>
              Riprova
            </Button>
          </div>
        ) : !dati ? (
          <div className="bat__attesa" aria-hidden="true" />
        ) : (
          <>
            <header className="bat-sala__testa">
              <p className="bat-sala__record u-tabnum">
                {dati.vinte} {pluralize(dati.vinte, 'vinta', 'vinte')} · {dati.perse}{' '}
                {pluralize(dati.perse, 'persa', 'perse')}
              </p>
              <Link to="/classifica?gioco=battaglia" className="bat-sala__classifica">
                <IconTrophy size={16} />
                Classifica
              </Link>
            </header>

            {dati.partita && (
              <Link to={`/battaglia/${dati.partita.id}`} className="bat-sala__partita">
                <Avatar
                  nickname={dati.partita.avversario.nickname}
                  color={dati.partita.avversario.avatarColor}
                  size={44}
                />
                <span className="bat-sala__partita-testo">
                  <span className="bat-sala__partita-titolo">
                    Battaglia con {dati.partita.avversario.displayName}
                  </span>
                  <span className="bat-sala__partita-stato">
                    {dati.partita.stato === 'disposizione'
                      ? 'Si dispongono le flotte'
                      : dati.partita.tuoTurno
                        ? 'Tocca a te'
                        : `Tocca a ${dati.partita.avversario.displayName}`}
                  </span>
                </span>
                <span className="bat-sala__riprendi">Riprendi</span>
              </Link>
            )}

            {inAttesa && <SfidaInAttesa invito={inAttesa} onAnnulla={() => void annulla(inAttesa)} />}

            {esitoUltima && (
              <p className="bat-sala__esito">
                {esitoUltima.stato === 'rifiutato'
                  ? `${esitoUltima.a.displayName} ha rifiutato la sfida.`
                  : `${esitoUltima.a.displayName} non ha risposto in tempo.`}
              </p>
            )}

            {avviso && <p className="bat-sala__avviso">{avviso}</p>}

            <section className="bat-sala__sezione">
              <h2 className="bat-sala__titolo">Chi è online</h2>
              {dati.giocatori.length === 0 ? (
                <p className="bat-sala__vuoto">
                  Adesso non c&rsquo;è nessun altro. Appena un collega apre l&rsquo;app, in qualunque
                  gioco, compare qui e lo puoi sfidare.
                </p>
              ) : (
                <ul className="bat-sala__elenco">
                  {dati.giocatori.map((g) => (
                    <li key={g.playerId} className="bat-sala__giocatore">
                      <Avatar nickname={g.nickname} color={g.avatarColor} size={40} />
                      <span className="bat-sala__chi">
                        <span className="bat-sala__nome">{g.displayName}</span>
                        <span className="bat-sala__dove">
                          {g.occupato ? 'sta combattendo' : DOVE[g.attivita]}
                        </span>
                      </span>
                      <Button
                        variant={g.invitato ? 'plain' : 'tinted'}
                        disabled={g.occupato || g.invitato || Boolean(dati.partita) || invio !== null}
                        loading={invio === g.playerId}
                        onClick={() => void sfida(g)}
                      >
                        {g.invitato ? 'Sfidato' : 'Sfida'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <ComeSiGiocaBattaglia open={aiuto} onClose={() => setAiuto(false)} />
    </AppShell>
  )
}

function SfidaInAttesa({ invito, onAnnulla }: { invito: InvitoInviato; onAnnulla: () => void }) {
  const restano = useCountdown(invito.scadeTraMs)
  return (
    <div className="bat-sala__in-attesa" aria-live="polite">
      <span className="bat-sala__onde" aria-hidden="true" />
      <p className="bat-sala__in-attesa-testo">
        Hai sfidato <strong>{invito.a.displayName}</strong>. Aspetta la risposta…
        <span className="bat-sala__scadenza u-tabnum"> {formatCronometro(restano)}</span>
      </p>
      <Button variant="plain" onClick={onAnnulla}>
        Annulla
      </Button>
    </div>
  )
}
