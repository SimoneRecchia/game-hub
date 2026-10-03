import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Pillola, Scheda } from '@/components/Scheda'
import { ComeSiGiocaNomi } from '@/games/nomi/ComeSiGioca'
import { FoglioDaScrivere, FoglioScritto, Lettera, type RigaScritta } from '@/games/nomi/Foglio'
import { Matita } from '@/games/nomi/Matita'
import { useSfidaNomi, type SfidaNomi } from '@/games/nomi/sfida/useSfidaNomi'
import { useRestante } from '@/games/tavolo/TempoMossa'
import { suona } from '@/lib/suoni'
import type { GiocatoreBreve, VistaSfidaNomi } from '@shared/types'
import '@/games/nomi/NomiCose.css'

const COLORE = 'linear-gradient(135deg, var(--nomi-1), var(--nomi-2))'

/**
 * Una sfida a Nomi, cose e città con un amico: la stessa lettera e le stesse
 * categorie per tutti e due, dal via. Chi finisce per primo dice stop, e
 * l'altro smette di scrivere; i punti si contano come al tavolo.
 */
export default function NomiCoseSfida() {
  const { id = '' } = useParams()
  // La rivincita e' un'altra sfida: si riparte da capo, con lo stato nuovo.
  return <Sfida key={id} id={id} />
}

function Sfida({ id }: { id: string }) {
  const g = useSfidaNomi(id)
  const v = g.vista
  const [regole, setRegole] = useState(false)

  // Gli adesivi: lo stop dell'altro, poi com'e' andata.
  const { adesivo, accoda } = useCodaAdesivi()
  const vistaInCorso = useRef(false)
  const vistoStop = useRef(false)
  const vistaFine = useRef(false)
  const [vinta, setVinta] = useState(false)
  useEffect(() => {
    if (!v) return
    if (v.stato === 'in_corso') vistaInCorso.current = true
    if (v.stop?.di === 'avversario' && v.stato === 'in_corso' && !vistoStop.current) {
      vistoStop.current = true
      accoda({
        tono: 'bordato',
        titolo: 'Stop!',
        sotto: `${v.avversario?.displayName ?? 'L’altro'} ha finito`,
        colore: 'var(--nomi-2)',
        durata: 1_500,
      })
    }
    // Solo la fine vista arrivare: una sfida riaperta gia' finita non rifa' la festa.
    if (v.stato !== 'finita' || vistaFine.current || !vistaInCorso.current) return
    vistaFine.current = true
    const sotto = `${v.mie.totale ?? 0} a ${v.sue?.totale ?? 0}`
    const durata = 2_200
    const lui = v.avversario?.displayName ?? 'l’altro'
    accoda(
      v.vincitore === 'io'
        ? { tono: 'vivace', titolo: 'Hai vinto!', sotto, colore: COLORE, durata, suono: 'vittoria' }
        : v.vincitore === 'avversario'
          ? { tono: 'bordato', titolo: `Ha vinto ${lui}`, sotto, colore: 'var(--nomi-2)', durata, suono: 'sconfitta' }
          : { tono: 'vivace', titolo: 'Pari', sotto, colore: COLORE, durata, suono: 'pareggio' },
    )
    setVinta(v.vincitore === 'io')
  }, [accoda, v])
  const festa = useFesta(v ? v.stato === 'in_corso' : null, vinta)

  return (
    <Pagina
      titolo="Nomi, cose e città"
      intera
      indietro={{ a: ROTTE.libera('nomi'), etichetta: 'Libere' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {!v ? (
        g.errore ? (
          <Vuoto titolo="La sfida non si è aperta" testo={g.errore} />
        ) : (
          <div className="nomi-attesa" aria-hidden="true" />
        )
      ) : v.stato === 'rifiutata' || v.stato === 'annullata' ? (
        <Vuoto titolo="La sfida non c’è più" testo="L’invito è stato ritirato o rifiutato." />
      ) : v.stato === 'invito' ? (
        <Vuoto
          icona={
            v.avversario ? (
              <Avatar nickname={v.avversario.nickname} color={v.avversario.avatarColor} size={56} />
            ) : undefined
          }
          titolo="Aspetto che accetti"
          testo="La sfida comincia quando arriva."
        />
      ) : v.stato === 'in_corso' && g.via !== null ? (
        <Via via={g.via} avversario={v.avversario} />
      ) : v.stato === 'in_corso' && v.lettera && v.categorie ? (
        <InGioco g={g} v={v} />
      ) : v.stato === 'finita' ? (
        <Fine g={g} v={v} />
      ) : (
        <div className="nomi-attesa" aria-hidden="true" />
      )}
      <ComeSiGiocaNomi open={regole} onClose={() => setRegole(false)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Il tre-due-uno: la lettera si vede insieme, al via. */
function Via({ via, avversario }: { via: number; avversario: GiocatoreBreve | null }) {
  const restante = useRestante(via) ?? 0
  const secondi = Math.ceil(restante / 1_000)
  const ultimo = useRef(secondi)
  useEffect(() => {
    if (secondi === ultimo.current) return
    ultimo.current = secondi
    suona(secondi > 0 ? 'tic' : 'via')
  }, [secondi])
  return (
    <div className="nomi-via">
      {avversario && <Avatar nickname={avversario.nickname} color={avversario.avatarColor} size={56} />}
      <p className="nomi-via__chi">Contro {avversario?.displayName ?? 'il tuo amico'}</p>
      <span key={secondi} className="nomi-via__numero u-tabnum" aria-live="polite">
        {secondi > 0 ? secondi : 'Via!'}
      </span>
    </div>
  )
}

/** Si scrive: la lettera, il tempo, l'altro che scrive, e lo stop. */
function InGioco({ g, v }: { g: SfidaNomi; v: VistaSfidaNomi }) {
  const fermo = !g.scrivibile
  return (
    <div className="nomi-pagina is-in-gioco">
      <header className="nomi-testa">
        <Lettera lettera={v.lettera} />
        <div className="nomi-testa__tempo">
          <p className="nomi-testa__con">Con la {v.lettera!.toUpperCase()}</p>
          {g.scadenza !== null && !fermo && (
            <Matita scadenza={g.scadenza} totaleMs={v.tempoTotaleMs} onScaduto={g.tempoFinito} />
          )}
          {fermo && v.stop && (
            <p className="nomi-testa__stop">
              {v.stop.di === 'io' ? 'Hai detto stop' : v.stop.di === 'avversario' ? 'Stop!' : 'Tempo finito'}
            </p>
          )}
        </div>
      </header>
      {v.avversario && (
        <Avversario
          avversario={v.avversario}
          scritte={v.scritteAvversario}
          totale={v.categorie!.length}
          fermo={fermo}
        />
      )}
      {fermo ? (
        <>
          <FoglioScritto
            righe={v.categorie!.map((c) => ({ categoria: c, testo: g.risposte[c]?.trim() ?? '', segno: null }))}
          />
          <p className="nomi-conti">Si contano i punti…</p>
        </>
      ) : (
        <>
          <FoglioDaScrivere lettera={v.lettera!} categorie={v.categorie!} risposte={g.risposte} onScrivi={g.scrivi} />
          <Button size="lg" fullWidth onClick={g.stop} disabled={g.occupato}>
            Stop!
          </Button>
        </>
      )}
    </div>
  )
}

/** L'altro che scrive: un puntino per categoria, pieno quando ha scritto. */
function Avversario({
  avversario,
  scritte,
  totale,
  fermo,
}: {
  avversario: GiocatoreBreve
  scritte: number
  totale: number
  fermo: boolean
}) {
  return (
    <p className="nomi-computer" aria-live="polite">
      <Avatar nickname={avversario.nickname} color={avversario.avatarColor} size={20} />
      <span>
        {avversario.displayName} {fermo ? 'ha scritto' : 'scrive'}
      </span>
      <span className="nomi-computer__puntini" aria-label={`${scritte} su ${totale}`}>
        {Array.from({ length: totale }, (_, i) => (
          <span key={i} className={i < scritte ? 'is-scritta' : ''} />
        ))}
      </span>
    </p>
  )
}

/** Com'e' finita: i due fogli, i punti di ogni risposta, la serie, e la rivincita. */
function Fine({ g, v }: { g: SfidaNomi; v: VistaSfidaNomi }) {
  const categorie = v.categorie ?? []
  const nome = v.avversario?.displayName ?? 'L’altro'
  const righe: RigaScritta[] = categorie.map((c, i) => {
    const testo = v.mie.risposte[c]?.trim() ?? ''
    const sua = v.sue?.risposte[c]?.trim()
    const punti = v.mie.punti?.[i] ?? 0
    const suoi = v.sue?.punti?.[i] ?? 0
    return {
      categoria: c,
      testo,
      segno: !testo ? 'vuota' : v.mie.forme?.[i] ? 'giusta' : 'sbagliata',
      nota: `${nome}: ${sua || '—'}${sua ? ` · ${suoi}` : ''}`,
      punti: punti > 0 ? `+${punti}` : undefined,
    }
  })
  const esito = v.vincitore === 'io' ? 'Hai vinto' : v.vincitore === 'avversario' ? 'Hai perso' : 'Pari'
  const chiesta = v.rivincita
  return (
    <div className="nomi-pagina">
      <Scheda
        className="nomi-scheda"
        titolo={`Con la ${v.lettera?.toUpperCase() ?? ''}`}
        icona={<Lettera lettera={v.lettera} piccola />}
        destra={
          <Pillola tono={v.vincitore === 'io' ? 'buona' : v.vincitore === 'avversario' ? 'cattiva' : 'neutra'}>
            {esito} {v.mie.totale ?? 0} a {v.sue?.totale ?? 0}
          </Pillola>
        }
      >
        <FoglioScritto righe={righe} />
        {v.serie.partite > 1 && (
          <p className="nomi-ieri__conto u-tabnum">
            La serie: tu {v.serie.mie}, {nome} {v.serie.sue}, su {v.serie.partite}
          </p>
        )}
      </Scheda>
      <div className="nomi-libera__azioni">
        {chiesta?.stato === 'invito' && chiesta.mia ? (
          <p className="nomi-conti">Aspetto la risposta di {nome}…</p>
        ) : (
          <Button size="lg" onClick={g.rivincita} disabled={g.occupato || !v.online}>
            <IconRefresh size={18} /> {chiesta?.stato === 'invito' ? `${nome} vuole la rivincita` : 'Gioca ancora'}
          </Button>
        )}
      </div>
      {!v.online && !chiesta && <p className="nomi-conti">{nome} non è più online.</p>}
      {g.errore && <p className="nomi-guasto">{g.errore}</p>}
    </div>
  )
}
