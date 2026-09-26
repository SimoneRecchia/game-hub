import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { IconChevronLeft, IconInfo, IconTrophy } from '@/components/Icons'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import { Leggio, ScegliJolly } from '@/games/scarabeo/Leggio'
import { Tabellone } from '@/games/scarabeo/Tabellone'
import { useScarabeo } from '@/games/scarabeo/useScarabeo'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown, formatNumber } from '@/lib/format'
import './Scarabeo.css'

/**
 * Lo Scarabeo del giorno.
 *
 * Una schermata sola: tabellone, leggio, comandi. Il tabellone prende lo spazio
 * che resta ed e' l'unica parte che scorre, così leggio e bottoni stanno sempre
 * sotto il pollice anche su un telefono basso — sono le due cose che si toccano
 * a ogni mossa.
 */
export default function Scarabeo() {
  const navigate = useNavigate()
  const g = useScarabeo()
  const [aiuto, setAiuto] = useState(false)
  const [cronologia, setCronologia] = useState(false)
  const [cambio, setCambio] = useState(false)
  const [selezione, setSelezione] = useState<Set<number>>(new Set())

  const stato = g.stato
  const finita = stato?.status === 'done'

  const esciDalCambio = useCallback(() => {
    setCambio(false)
    setSelezione(new Set())
  }, [])

  const tocca = useCallback(
    (indice: number) => {
      if (!cambio) {
        g.usaTessera(indice)
        return
      }
      setSelezione((prima) => {
        const dopo = new Set(prima)
        if (dopo.has(indice)) dopo.delete(indice)
        else dopo.add(indice)
        return dopo
      })
    },
    [cambio, g],
  )

  const confermaCambio = useCallback(() => {
    const tessere = [...selezione].map((i) => g.mano[i])
    esciDalCambio()
    g.cambia(tessere)
  }, [esciDalCambio, g, selezione])

  const anteprima = g.anteprima
  const puntiPosa = anteprima?.ok ? anteprima.punti : null

  return (
    <AppShell
      title={stato ? `Scarabeo #${stato.puzzleNumber}` : 'Scarabeo'}
      hideTabBar
      leading={
        <button
          type="button"
          className="navbtn"
          onClick={() => navigate('/')}
          aria-label="Torna all'hub"
        >
          <IconChevronLeft size={22} />
        </button>
      }
      trailing={
        <button
          type="button"
          className="navbtn"
          onClick={() => setAiuto(true)}
          aria-label="Come si gioca"
        >
          <IconInfo size={21} />
        </button>
      }
    >
      <div className="scr">
        {g.loadError ? (
          <div className="scr__fallback">
            <p>{g.loadError}</p>
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          </div>
        ) : !stato ? (
          <div className="scr__attesa" aria-hidden="true" />
        ) : (
          <>
            {/*
              La riga di stato: punteggio, mosse, tessere che restano. Il
              punteggio si tocca e apre la cronologia — le parole fatte sono la
              cosa che si vuole rivedere, e non meritano spazio fisso in una
              schermata dove l'altezza serve al tabellone.
            */}
            <button
              type="button"
              className="scr__stato"
              onClick={() => setCronologia(true)}
              aria-label="Le tue mosse"
            >
              <span className="scr__punti u-tabnum">{formatNumber(stato.punti)}</span>
              <span className="scr__punti-label">punti</span>
              <span className="scr__mosse u-tabnum">
                mossa {Math.min(stato.mosseUsate + (finita ? 0 : 1), stato.mosseTotali)}/
                {stato.mosseTotali}
              </span>
              <span className="scr__sacchetto u-tabnum">{stato.restanti} nel sacchetto</span>
            </button>

            <div className="scr__campo">
              <Tabellone
                tabellone={g.tabellone}
                sospese={g.sospese}
                cursore={g.cursore}
                bloccato={finita || g.inviando}
                onTocca={g.tocca}
              />
            </div>

            {/* Messaggio effimero: si sovrappone, non sposta il tabellone. */}
            <div className="scr__messaggio" aria-live="polite">
              {g.messaggio && <span className="scr__pillola">{g.messaggio}</span>}
            </div>

            {finita ? (
              <Chiusa punti={stato.punti} ms={stato.msToNextPuzzle} />
            ) : (
              <>
                <Leggio
                  mano={g.mano}
                  impegnate={g.impegnate}
                  cambio={cambio}
                  selezione={selezione}
                  bloccato={g.inviando}
                  onUsa={tocca}
                />

                {cambio ? (
                  <div className="scr__comandi">
                    <Button variant="plain" onClick={esciDalCambio}>
                      Annulla
                    </Button>
                    <Button
                      variant="tinted"
                      disabled={selezione.size === 0 || g.inviando}
                      onClick={confermaCambio}
                    >
                      Cambia {selezione.size > 0 ? selezione.size : ''}
                    </Button>
                  </div>
                ) : (
                  <div className="scr__comandi">
                    <Button variant="plain" onClick={g.mischia} disabled={g.sospese.length > 0}>
                      Mischia
                    </Button>
                    <Button
                      variant="plain"
                      onClick={() => setCambio(true)}
                      disabled={g.inviando || stato.restanti === 0 || g.mano.length === 0}
                    >
                      Cambia
                    </Button>
                    <Button variant="plain" onClick={g.passa} disabled={g.inviando}>
                      Passa
                    </Button>
                  </div>
                )}

                <div className="scr__gioca">
                  {g.sospese.length > 0 && (
                    <Button variant="plain" onClick={g.annulla}>
                      Rimetti in mano
                    </Button>
                  )}
                  <Button
                    size="lg"
                    fullWidth
                    onClick={g.gioca}
                    disabled={g.sospese.length === 0 || g.inviando}
                  >
                    {puntiPosa !== null
                      ? `Gioca · +${puntiPosa}${anteprima?.ok && anteprima.scarabeo ? ' scarabeo!' : ''}`
                      : 'Gioca'}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <ComeSiGiocaScarabeo open={aiuto} onClose={() => setAiuto(false)} />
      <ScegliJolly
        aperto={g.jollyAperto !== null}
        onScegli={g.scegliJolly}
        onChiudi={g.chiudiJolly}
      />

      <Sheet open={cronologia} onClose={() => setCronologia(false)} title="Le tue mosse">
        {stato && stato.mosse.length > 0 ? (
          <ol className="scr-storia">
            {stato.mosse.map((m) => (
              <li className="scr-storia__riga" key={m.numero}>
                <span className="scr-storia__numero u-tabnum">{m.numero}</span>
                <span className="scr-storia__parole">
                  {m.tipo === 'posa'
                    ? m.parole.map((p) => p.toUpperCase()).join(' · ')
                    : m.tipo === 'passo'
                      ? 'passata'
                      : 'tessere cambiate'}
                  {m.scarabeo && <span className="scr-storia__scarabeo">scarabeo</span>}
                </span>
                <span className="scr-storia__punti u-tabnum">{m.punti > 0 ? `+${m.punti}` : '—'}</span>
              </li>
            ))}
            <li className="scr-storia__riga scr-storia__riga--totale">
              <span className="scr-storia__numero" />
              <span className="scr-storia__parole">Totale</span>
              <span className="scr-storia__punti u-tabnum">{stato.punti}</span>
            </li>
          </ol>
        ) : (
          <p className="scr-storia__vuota">Nessuna mossa, per ora.</p>
        )}

        {/*
          Chiudere prima delle dieci mosse: sta qui e non fra i comandi perché
          e' una decisione che si prende una volta, guardando quel che si e'
          fatto — mentre un bottone accanto a "Passa" si preme per sbaglio.
        */}
        {stato && !finita && stato.mosseUsate > 0 && (
          <div className="scr-storia__chiudi">
            <p className="scr-storia__chiudi-nota">
              Ti restano {stato.mosseTotali - stato.mosseUsate} mosse. Se hai finito le idee puoi
              chiudere la giornata: il punteggio diventa definitivo e in classifica non risulti
              più &ldquo;in corso&rdquo;.
            </p>
            <Button
              variant="tinted"
              onClick={() => {
                setCronologia(false)
                g.chiudiGiornata()
              }}
              disabled={g.inviando}
            >
              Chiudi la giornata
            </Button>
          </div>
        )}
      </Sheet>
    </AppShell>
  )
}

/** Giornata chiusa: quanto ha reso, quanto manca alla prossima, la classifica. */
function Chiusa({ punti, ms }: { punti: number; ms: number }) {
  const restano = useCountdown(ms)

  return (
    <div className="scr__chiusa">
      <p className="scr__chiusa-punti u-tabnum">{formatNumber(punti)} punti</p>
      <p className="scr__chiusa-attesa">
        Tessere nuove fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
      <Link to="/classifica?gioco=scarabeo" className="scr__chiusa-link">
        <IconTrophy size={18} />
        Vedi la classifica
      </Link>
    </div>
  )
}
