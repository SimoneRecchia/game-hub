import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaSequenze } from '@/games/sequenze/ComeSiGioca'
import { Pallini, Tavola } from '@/games/sequenze/Tavola'
import { useProva } from '@/games/sequenze/useProva'
import { useSfidaSequenze, type SfidaSequenze } from '@/games/sequenze/useSfidaSequenze'
import { useRestante } from '@/games/tavolo/TempoMossa'
import { usePlayer } from '@/lib/auth'
import { suona } from '@/lib/suoni'
import { Tacche } from '@/components/Elementi'
import { NOMI_LIVELLI_SEQUENZE } from '@/games/sequenze/useSequenzeLibere'
import { LIVELLI_ORDINATI, LIVELLI_SEQUENZE, lunghezzaRaggiunta, type LivelloSequenze } from '@shared/sequenze'
import type { VistaSfidaSequenze } from '@shared/types'
import '@/games/sequenze/Sequenze.css'

/** Fin dove si e' arrivati, detto in cubetti: la sequenza piu' lunga ripetuta, che dipende da dove si parte. */
const cubetti = (giuste: number, l: LivelloSequenze) =>
  giuste === 0 ? 'nessuna sequenza' : `${lunghezzaRaggiunta(giuste, LIVELLI_SEQUENZE[l].prima)} cubetti`
const conto = (giuste: number, l: LivelloSequenze) =>
  giuste === 0 ? '–' : String(lunghezzaRaggiunta(giuste, LIVELLI_SEQUENZE[l].prima))

/**
 * Una sfida a Sequenze con un amico: le stesse sequenze per tutti e due, dal
 * via, ognuno sul suo telefono. In cima si vede fin dove e' arrivato l'altro;
 * chi sbaglia aspetta, e vince chi arriva piu' lontano.
 */
export default function SequenzeSfida() {
  const { id = '' } = useParams()
  // La rivincita e' un'altra sfida: si riparte da capo, con lo stato nuovo.
  return <Sfida key={id} id={id} />
}

function Sfida({ id }: { id: string }) {
  const g = useSfidaSequenze(id)
  const v = g.vista
  const [regole, setRegole] = useState(false)
  const { adesivo, accoda } = useCodaAdesivi()
  const difficolta = LIVELLI_SEQUENZE[v?.livello ?? 'normale']
  const prova = useProva({
    sequenza: g.aperta?.sequenza ?? null,
    chiave: g.aperta?.chiave ?? 0,
    ritmo: difficolta.ritmo,
    indietro: difficolta.indietro,
    onFine: g.rispondi,
  })
  const nome = v?.avversario?.displayName ?? 'L’altro'

  // La fine, una volta: l'adesivo, e la festa per chi vince.
  const raccontata = useRef(false)
  useEffect(() => {
    if (!v || v.stato !== 'finita' || raccontata.current) return
    raccontata.current = true
    accoda(
      v.vincitore === 'io'
        ? {
            tono: 'vivace',
            titolo: 'Hai vinto!',
            sotto: `${cubetti(v.mie.giuste, v.livello)} contro ${cubetti(v.sue.giuste, v.livello)}`,
            colore: 'linear-gradient(160deg, var(--sequenze-1), var(--sequenze-2))',
            durata: 1_800,
            suono: 'vittoria',
          }
        : {
            tono: 'bordato',
            titolo: v.vincitore === 'pari' ? 'Pari' : `Vince ${nome}`,
            sotto: `${cubetti(v.mie.giuste, v.livello)} contro ${cubetti(v.sue.giuste, v.livello)}`,
            colore: 'var(--sequenze-2)',
            durata: 1_800,
            suono: v.vincitore === 'pari' ? 'pareggio' : 'sconfitta',
          },
    )
  }, [accoda, nome, v])
  const festa = useFesta(v ? v.stato === 'in_corso' : null, v?.vincitore === 'io')

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )

  return (
    <Pagina
      titolo="Sequenze"
      intera
      indietro={{ a: ROTTE.libera('sequenze'), etichetta: 'Sequenze' }}
      azioni={info}
    >
      {!v ? (
        g.errore ? (
          <Vuoto titolo="La sfida non si apre" testo={g.errore} />
        ) : (
          <div className="seq" aria-hidden="true" />
        )
      ) : v.stato === 'finita' ? (
        <Fine g={g} v={v} />
      ) : v.stato !== 'in_corso' ? (
        <Vuoto titolo="La sfida non c’è più" testo="L’invito è stato ritirato o rifiutato." />
      ) : (
        <div className="seq">
          <div className="seq-testa">
            <Duello v={v} />
          </div>
          <div className="seq-campo">
            {g.via !== null ? (
              <ConteAllaRovescia via={g.via} />
            ) : (
              <Tavola
                fase={prova.fase}
                acceso={prova.acceso}
                sequenza={g.aperta?.sequenza ?? null}
                errore={prova.errore}
                onTocca={prova.tocca}
              />
            )}
          </div>
          <div className="seq-piede" aria-live="polite">
            {g.via !== null ? (
              <p className="seq-sotto">Guarda la tavola</p>
            ) : v.mie.finito && !g.aperta ? (
              <>
                <p className="seq-stato">Hai finito</p>
                <p className="seq-sotto">Aspetto {nome}…</p>
              </>
            ) : g.aperta ? (
              <>
                <p className={`seq-stato is-${prova.fase}`}>
                  {prova.fase === 'guarda'
                    ? 'Guarda'
                    : prova.fase === 'tocca'
                      ? difficolta.indietro
                        ? 'Al contrario'
                        : 'Tocca a te'
                      : prova.fase === 'giusta'
                        ? 'Giusta!'
                        : prova.fase === 'sbagliata'
                          ? 'Sbagliata'
                          : ''}
                </p>
                <Pallini
                  quanti={g.aperta.sequenza.length}
                  toccati={prova.tocchi.length}
                  errore={prova.errore !== null}
                />
                <p className="seq-sotto u-tabnum">{g.aperta.sequenza.length} cubetti</p>
              </>
            ) : (
              <p className="seq-sotto">Arriva la sequenza…</p>
            )}
          </div>
        </div>
      )}
      <ComeSiGiocaSequenze open={regole} onClose={() => setRegole(false)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** In cima: io e l'altro, con fin dove siamo arrivati. */
function Duello({ v }: { v: VistaSfidaSequenze }) {
  const player = usePlayer()
  return (
    <div className="seq-duello">
      <span className={`seq-duellante${v.mie.finito ? ' is-finito' : ''}`}>
        <Avatar nickname={player.nickname} color={player.avatarColor} size={36} />
        <span className="seq-duellante__testo">
          <span className="seq-duellante__nome">Tu</span>
          <span className="seq-duellante__conto u-tabnum">{conto(v.mie.giuste, v.livello)}</span>
        </span>
      </span>
      <span className="seq-duello__contro">
        <Tacche piene={LIVELLI_ORDINATI.indexOf(v.livello) + 1} colore="var(--sequenze-1)" />
        <span>{NOMI_LIVELLI_SEQUENZE[v.livello]}</span>
      </span>
      <span className={`seq-duellante is-lui${v.sue.finito ? ' is-finito' : ''}`}>
        <Avatar nickname={v.avversario?.nickname ?? '?'} color={v.avversario?.avatarColor} size={36} />
        <span className="seq-duellante__testo">
          <span className="seq-duellante__nome">
            {v.avversario?.displayName}
            {v.sue.finito ? ' · ha finito' : ''}
          </span>
          <span className="seq-duellante__conto u-tabnum">{conto(v.sue.giuste, v.livello)}</span>
        </span>
      </span>
    </div>
  )
}

/** Il tre-due-uno: un secondo alla volta, con il suo tic, e il via. */
function ConteAllaRovescia({ via }: { via: number }) {
  const restante = useRestante(via) ?? 0
  const secondi = Math.max(1, Math.ceil(restante / 1000))
  const prima = useRef<number | null>(null)
  useEffect(() => {
    if (prima.current !== null && secondi !== prima.current) suona('tic')
    prima.current = secondi
  }, [secondi])
  useEffect(() => () => suona('via'), [])
  return (
    <span className="seq-via u-tabnum" aria-live="assertive">
      {secondi}
    </span>
  )
}

/** Com'e' finita: fin dove siamo arrivati, la serie, e la rivincita. */
function Fine({ g, v }: { g: SfidaSequenze; v: VistaSfidaSequenze }) {
  const player = usePlayer()
  const nome = v.avversario?.displayName ?? 'L’altro'
  const esito = v.vincitore === 'io' ? 'Hai vinto' : v.vincitore === 'avversario' ? `Ha vinto ${nome}` : 'Pari'
  const chiesta = v.rivincita
  const righe = [
    {
      chi: 'Tu',
      nickname: player.nickname,
      colore: player.avatarColor,
      giuste: v.mie.giuste,
      vince: v.vincitore === 'io',
    },
    {
      chi: nome,
      nickname: v.avversario?.nickname ?? '?',
      colore: v.avversario?.avatarColor,
      giuste: v.sue.giuste,
      vince: v.vincitore === 'avversario',
    },
  ]
  return (
    <div className="seq-fine">
      <div className="seq-totale">
        <p className="seq-totale__valore">{esito}</p>
        {v.serie.partite > 1 && (
          <p className="seq-totale__dettaglio u-tabnum">
            La serie: tu {v.serie.mie}, {nome} {v.serie.sue}, su {v.serie.partite}
          </p>
        )}
      </div>
      <ol className="seq-riepilogo">
        {righe.map((r) => (
          <li key={r.chi} className={`seq-riepilogo__riga${r.vince ? ' is-vince' : ''}`}>
            <Avatar nickname={r.nickname} color={r.colore} size={32} />
            <span className="seq-riepilogo__nome">{r.chi}</span>
            <span className="seq-riepilogo__valore u-tabnum">{cubetti(r.giuste, v.livello)}</span>
          </li>
        ))}
      </ol>
      <div className="seq-azioni">
        {chiesta?.stato === 'invito' && chiesta.mia ? (
          <p className="seq-sotto">Aspetto la risposta di {nome}…</p>
        ) : (
          <Button size="lg" onClick={g.rivincita} disabled={g.occupato || !v.online}>
            <IconRefresh size={18} /> {chiesta?.stato === 'invito' ? `${nome} vuole la rivincita` : 'Gioca ancora'}
          </Button>
        )}
      </div>
      {!v.online && !chiesta && <p className="seq-piede-fine">{nome} non è più online.</p>}
      {g.errore && <p className="seq-piede-fine">{g.errore}</p>}
    </div>
  )
}
