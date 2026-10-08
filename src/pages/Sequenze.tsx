import { useCallback, useEffect, useRef, useState } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconPlay, IconShuffle, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaSequenze } from '@/games/sequenze/ComeSiGioca'
import { Pallini, Tavola } from '@/games/sequenze/Tavola'
import { useProva, type Prova } from '@/games/sequenze/useProva'
import { useSequenzeDelGiorno } from '@/games/sequenze/useSequenzeDelGiorno'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown } from '@/lib/format'
import { RITMO_NORMALE, SEQUENZE_PER_TURNO, TURNI_SEQUENZE, ULTIMA_LUNGHEZZA } from '@shared/sequenze'
import type { SequenzeStato } from '@shared/types'
import '@/games/sequenze/Sequenze.css'

/** Fin dove si e' arrivati in un turno, detto per esteso. */
const fino = (raggiunta: number) => (raggiunta > 0 ? `fino a ${raggiunta} cubetti` : 'nessuna sequenza')

/** Una giornata che vale la festa: in media sette cubetti per turno, ben sopra quel che fa una persona. */
const PUNTI_DA_FESTA = 40

/**
 * Le Sequenze del giorno: cinque turni, gli stessi per tutti. Ogni turno parte
 * da tre cubetti e cresce di uno a ogni sequenza giusta, fino a nove; il primo
 * errore lo chiude. Fra un turno e l'altro ci si ferma quanto si vuole.
 */
export default function Sequenze() {
  const g = useSequenzeDelGiorno()
  const [regole, setRegole] = useState(false)
  const s = g.stato
  const { adesivo, accoda } = useCodaAdesivi()
  const { rispondi } = g
  const prova = useProva({
    sequenza: g.aperta?.sequenza ?? null,
    chiave: g.aperta?.chiave ?? 0,
    ritmo: RITMO_NORMALE,
    onFine: useCallback((tocchi: number[]) => rispondi(tocchi), [rispondi]),
  })

  // Un turno chiuso con tutte e sette le sequenze: l'adesivo. La giornata finita: i punti.
  const raccontato = useRef<number | null>(null)
  useEffect(() => {
    if (g.chiuso === null || !s || raccontato.current === g.chiuso) return
    raccontato.current = g.chiuso
    const turno = s.turni[g.chiuso]
    if (turno?.giuste === SEQUENZE_PER_TURNO) {
      accoda({
        tono: 'vivace',
        titolo: `Fino a ${ULTIMA_LUNGHEZZA}!`,
        sotto: `Turno ${g.chiuso + 1}, senza errori`,
        colore: 'linear-gradient(160deg, var(--sequenze-1), var(--sequenze-2))',
        durata: 1_800,
        suono: 'vittoria',
      })
    }
    if (s.status === 'done') {
      accoda({
        tono: 'vivace',
        titolo: `${s.punti} punti`,
        sotto: 'La giornata è finita',
        colore: 'linear-gradient(160deg, var(--sequenze-1), var(--sequenze-2))',
        durata: 1_800,
        suono: s.punti >= PUNTI_DA_FESTA ? 'vittoria' : 'giusto',
      })
    }
  }, [accoda, g.chiuso, s])
  const bella = s !== null && s.status === 'done' && s.punti >= PUNTI_DA_FESTA
  const festa = useFesta(s ? s.status === 'playing' : null, bella)

  return (
    <Pagina
      titolo={s ? `Sequenze #${s.puzzleNumber}` : 'Sequenze'}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {g.errore ? (
        <Vuoto
          titolo="Le sequenze non si sono aperte"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : !s ? (
        <div className="seq" aria-hidden="true" />
      ) : s.status === 'done' && !g.aperta ? (
        <FineGiornata stato={s} />
      ) : (
        <div className="seq">
          <div className="seq-testa">
            <Turni stato={s} />
          </div>
          <div className="seq-campo">
            <Tavola
              fase={prova.fase}
              acceso={prova.acceso}
              sequenza={g.aperta?.sequenza ?? null}
              errore={prova.errore}
              onTocca={prova.tocca}
            />
          </div>
          <Piede stato={s} prova={prova} lunghezza={g.aperta?.sequenza.length ?? null} g={g} />
        </div>
      )}
      <ComeSiGiocaSequenze open={regole} onClose={() => setRegole(false)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** I cinque turni: fin dove si e' arrivati in quelli chiusi, quello in corso bordato. */
function Turni({ stato }: { stato: SequenzeStato }) {
  return (
    <ol className="seq-turni" aria-label="I turni di oggi">
      {Array.from({ length: TURNI_SEQUENZE }, (_, i) => {
        const t = stato.turni[i]
        const classe = !t
          ? ''
          : t.chiuso
            ? t.giuste === SEQUENZE_PER_TURNO
              ? ' is-chiuso is-nove'
              : ' is-chiuso'
            : ' is-corrente'
        return (
          <li
            key={i}
            className={`seq-turno${classe}`}
            aria-label={
              t?.chiuso ? `Turno ${i + 1}: ${fino(t.raggiunta)}` : `Turno ${i + 1}${t ? ', in corso' : ''}`
            }
          >
            {t?.chiuso ? (
              <span>
                {t.raggiunta}
                <span className="seq-turno__sotto">cubetti</span>
              </span>
            ) : (
              i + 1
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Sotto la tavola: che cosa fare adesso. */
function Piede({
  stato,
  prova,
  lunghezza,
  g,
}: {
  stato: SequenzeStato
  prova: Prova
  lunghezza: number | null
  g: ReturnType<typeof useSequenzeDelGiorno>
}) {
  if (lunghezza !== null && prova.fase !== 'ferma') {
    const testo =
      prova.fase === 'guarda'
        ? 'Guarda'
        : prova.fase === 'tocca'
          ? 'Tocca a te'
          : prova.fase === 'giusta'
            ? 'Giusta!'
            : 'Sbagliata'
    return (
      <div className="seq-piede" aria-live="polite">
        <p className={`seq-stato is-${prova.fase}`}>{testo}</p>
        <Pallini quanti={lunghezza} toccati={prova.tocchi.length} errore={prova.errore !== null} />
        <p className="seq-sotto u-tabnum">{lunghezza} cubetti</p>
      </div>
    )
  }
  const chiusi = stato.turni.filter((t) => t.chiuso)
  const ultimo = chiusi[chiusi.length - 1]
  const prossimo = stato.turni.length + 1
  return (
    <div className="seq-piede" aria-live="polite">
      {ultimo ? (
        <p className="seq-sotto u-tabnum">
          Turno {chiusi.length}: {fino(ultimo.raggiunta)}
          {ultimo.riaperto ? ', chiuso riaprendo la pagina' : ''}
        </p>
      ) : (
        <p className="seq-sotto">Ripeti l’ordine in cui si accendono.</p>
      )}
      <Button size="lg" onClick={g.comincia} loading={g.occupato}>
        <IconPlay size={18} /> {prossimo === 1 ? 'Comincia' : `Turno ${prossimo}`}
      </Button>
    </div>
  )
}

/** La giornata finita: i punti, i turni, e quando arriva la prossima. */
function FineGiornata({ stato }: { stato: SequenzeStato }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const migliore = Math.max(...stato.turni.map((t) => t.raggiunta))
  return (
    <div className="seq-fine">
      <div className="seq-totale">
        <p className="seq-totale__valore u-tabnum">{stato.punti} punti</p>
        <p className="seq-totale__dettaglio u-tabnum">
          {migliore > 0 ? `La sequenza più lunga: ${migliore} cubetti` : 'Nessuna sequenza ripetuta'}
        </p>
      </div>
      <ol className="seq-riepilogo">
        {stato.turni.map((t, i) => (
          <li key={i} className="seq-riepilogo__riga">
            <span className="seq-riepilogo__nome">Turno {i + 1}</span>
            <span className="seq-barra" aria-hidden="true">
              {Array.from({ length: SEQUENZE_PER_TURNO }, (_, k) => (
                <span key={k} className={`seq-barra__tacca${k < t.giuste ? ' is-piena' : ''}`} />
              ))}
            </span>
            <span className="seq-riepilogo__valore u-tabnum">
              {t.raggiunta > 0 ? `${t.raggiunta} cubetti` : 'nessuna'}
            </span>
          </li>
        ))}
      </ol>
      <div className="seq-azioni">
        <Collegamento to={ROTTE.classifica('sequenze')} className="seq-link">
          <IconTrophy size={18} />
          Classifica
        </Collegamento>
        <Collegamento to={ROTTE.libera('sequenze')} className="seq-link">
          <IconShuffle size={18} />
          Sequenze libere
        </Collegamento>
      </div>
      <p className="seq-piede-fine">
        Le prossime fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
    </div>
  )
}
