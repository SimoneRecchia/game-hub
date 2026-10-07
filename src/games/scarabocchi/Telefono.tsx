import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconCheck, IconSparkle } from '@/components/Icons'
import { api } from '@/lib/api'
import { suona } from '@/lib/suoni'
import {
  TESTO_MASSIMO,
  type CompitoTelefono,
  type IscrittoStanzaScarabocchi,
  type OpTratto,
  type VistaStanzaScarabocchi,
  type VistaTelefono,
} from '@shared/scarabocchi'
import { AlbumTelefono } from './Album'
import { useInvioTratti } from './invio'
import { Lavagna, type ComandiLavagna, type Strumento } from './Lavagna'
import { Strumenti } from './Strumenti'
import { SPUNTI } from './spunti'
import { foglioIntero, useOrologio, useStanzaScarabocchi } from './useStanza'

type Stanza = ReturnType<typeof useStanzaScarabocchi>

const secondiDa = (fine: number, adesso: number) => Math.max(0, Math.ceil((fine - adesso) / 1000))

const TITOLI: Record<CompitoTelefono['tipo'], string> = {
  scrivi: 'Scrivi una situazione',
  disegna: 'Disegnala',
  descrivi: 'Che cosa vedi?',
}

/**
 * Il telefono senza fili: a ogni passo ognuno ha il suo foglio — scrivere la
 * prima frase, disegnare la frase di un altro, descrivere il disegno di un
 * altro — e quando hanno finito tutti, o il tempo e' passato, i fogli girano.
 * Alla fine l'album.
 */
export function PartitaTelefono({
  v,
  pv,
  s,
  volti,
}: {
  v: VistaStanzaScarabocchi
  pv: VistaTelefono
  s: Stanza
  volti: Map<string, IscrittoStanzaScarabocchi>
}) {
  const adesso = useOrologio(s.scarto, pv.fase === 'gioco')
  const restano = secondiDa(pv.fine, adesso)
  if (pv.fase === 'album' || v.stato === 'finita') return <AlbumTelefono v={v} pv={pv} s={s} volti={volti} />
  const c = pv.compito
  const quota = pv.fine > pv.inizio ? Math.min(1, (restano * 1000) / (pv.fine - pv.inizio)) : 0
  return (
    <div className="scr-telefono">
      <div className="scr-testa">
        <span className="scr-testa__giro u-tabnum">
          {pv.passo + 1} di {pv.passi}
        </span>
        <span className="scr-testa__centro">
          <span className="scr-testa__nota">{c && !c.consegnato ? TITOLI[c.tipo] : 'Aspettiamo gli altri'}</span>
        </span>
        <span
          className={`scr-orologio u-tabnum${restano <= 10 ? ' is-urgente' : ''}`}
          style={{ '--quota': quota } as CSSProperties}
          aria-label={`${restano} secondi`}
        >
          {restano}
        </span>
      </div>
      {!c ? (
        <p className="scr-nota">In questo passo non hai un foglio.</p>
      ) : c.consegnato ? (
        <Aspetta pv={pv} volti={volti} />
      ) : c.tipo === 'disegna' ? (
        <Disegna key={c.foglio} v={v} c={c} s={s} restano={restano} />
      ) : (
        <Scrivi key={c.foglio} v={v} c={c} s={s} restano={restano} />
      )}
    </div>
  )
}

/** Chi ha consegnato e chi no, mentre si aspetta. */
function Aspetta({ pv, volti }: { pv: VistaTelefono; volti: Map<string, IscrittoStanzaScarabocchi> }) {
  const fatti = pv.giocatori.filter((g) => g.fatto).length
  return (
    <div className="scr-aspetta">
      <span className="scr-aspetta__segno" aria-hidden="true">
        <IconCheck size={30} />
      </span>
      <p className="scr-aspetta__titolo">Fatto!</p>
      <p className="scr-nota u-tabnum">
        {fatti} su {pv.giocatori.length} hanno finito
      </p>
      <ul className="scr-aspetta__volti">
        {pv.giocatori.map((g) => {
          const volto = volti.get(g.id)
          return (
            <li key={g.id} className={g.fatto ? 'is-fatto' : ''} title={g.nome}>
              <Avatar nickname={volto?.nickname ?? g.nome} color={volto?.avatarColor} size={40} />
              {g.fatto && (
                <span className="scr-giocatore__segno is-giusto" aria-label="Ha finito">
                  <IconCheck size={12} />
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** La bozza si salva mentre si scrive: a tempo finito vale quella. */
function useBozza(v: VistaStanzaScarabocchi, c: CompitoTelefono, testo: string, restano: number) {
  const salvata = useRef(c.bozza ?? '')
  const salva = useCallback(
    (t: string) => {
      if (t === salvata.current) return
      salvata.current = t
      void api(`/scarabocchi/stanze/${v.codice}/foglio`, {
        method: 'POST',
        body: { numero: v.numero, catena: c.catena, passo: c.passo, testo: t },
      }).catch(() => {
        salvata.current = ''
      })
    },
    [v.codice, v.numero, c.catena, c.passo],
  )
  useEffect(() => {
    const t = window.setTimeout(() => salva(testo), 900)
    return () => window.clearTimeout(t)
  }, [testo, salva])
  // Allo scadere si salva subito quel che c'e', senza aspettare la pausa.
  useEffect(() => {
    if (restano <= 1) salva(testo)
  }, [restano, testo, salva])
}

/** Scrivere: la prima frase, o che cosa si vede nel disegno di un altro. */
function Scrivi({ v, c, s, restano }: { v: VistaStanzaScarabocchi; c: CompitoTelefono; s: Stanza; restano: number }) {
  const [testo, setTesto] = useState(c.bozza ?? '')
  useBozza(v, c, testo, restano)
  const consegna = () => {
    const t = testo.trim()
    if (!t) return
    suona('posa')
    void s.foglio({ numero: v.numero, catena: c.catena, passo: c.passo, testo: t, consegna: true })
  }
  const ispira = () => setTesto(SPUNTI[Math.floor(Math.random() * SPUNTI.length)])
  return (
    <div className="scr-compito">
      {c.spunto?.tipo === 'disegno' && <DisegnoDaVedere codice={v.codice} foglio={c.spunto.foglio} />}
      <label className="u-visually-hidden" htmlFor="scr-testo">
        {c.tipo === 'scrivi' ? 'La tua situazione' : 'Che cosa vedi nel disegno'}
      </label>
      <textarea
        id="scr-testo"
        className="scr-campo scr-campo--lungo"
        value={testo}
        maxLength={TESTO_MASSIMO}
        rows={c.tipo === 'scrivi' ? 3 : 2}
        placeholder={c.tipo === 'scrivi' ? 'Un gatto che fa surf su un’onda gigante' : 'Mi sembra…'}
        onChange={(e) => setTesto(e.target.value.replace(/\n/g, ' '))}
        disabled={restano === 0}
      />
      <div className="scr-compito__azioni">
        {c.tipo === 'scrivi' && (
          <Button variant="tinted" onClick={ispira} disabled={restano === 0}>
            <IconSparkle size={18} /> Ispirami
          </Button>
        )}
        <Button
          onClick={consegna}
          disabled={testo.trim() === '' || restano === 0 || s.occupato !== null}
          loading={s.occupato === 'consegna'}
        >
          Fatto
        </Button>
      </div>
    </div>
  )
}

/** Il disegno di un altro, da descrivere: lo si chiede intero, una volta. */
function DisegnoDaVedere({ codice, foglio }: { codice: string; foglio: string }) {
  const [ops, setOps] = useState<OpTratto[] | null>(null)
  useEffect(() => {
    let vivo = true
    foglioIntero(codice, foglio)
      .then((f) => vivo && setOps(f.ops))
      .catch(() => vivo && setOps([]))
    return () => {
      vivo = false
    }
  }, [codice, foglio])
  return (
    <div className="scr-tela-spazio">
      <div className="scr-tela">
        {ops ? (
          ops.length > 0 ? (
            <Lavagna ops={ops} etichetta="Il disegno da descrivere" />
          ) : (
            <div className="scr-lavagna scr-lavagna--vuota">
              <p>Il disegno è rimasto vuoto: inventa.</p>
            </div>
          )
        ) : (
          <div className="scr-lavagna scr-lavagna--attesa" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

/** Disegnare la frase di un altro: la frase in cima, la lavagna, gli attrezzi e "Fatto". */
function Disegna({ v, c, s, restano }: { v: VistaStanzaScarabocchi; c: CompitoTelefono; s: Stanza; restano: number }) {
  const lavagna = useRef<ComandiLavagna>(null)
  const [strumento, setStrumento] = useState<Strumento>({ colore: 0, spessore: 1 })
  const [iniziale, setIniziale] = useState<{ ops: OpTratto[]; pezzi: number } | null>(null)
  const [consegnando, setConsegnando] = useState(false)

  useEffect(() => {
    let vivo = true
    foglioIntero(v.codice, c.foglio)
      .then((f) => vivo && setIniziale(f))
      .catch(() => vivo && setIniziale({ ops: [], pezzi: 0 }))
    return () => {
      vivo = false
    }
  }, [v.codice, c.foglio])

  const invio = useInvioTratti(v.codice, v.numero, iniziale ? c.foglio : null, iniziale?.pezzi ?? 0)
  const ferma = restano === 0 || consegnando

  // Allo scadere parte quel che e' rimasto in coda: il server lo prende ancora per qualche secondo.
  const { svuota } = invio
  useEffect(() => {
    if (restano === 0) void svuota()
  }, [restano, svuota])

  const consegna = async () => {
    setConsegnando(true)
    await invio.svuota()
    suona('posa')
    const ok = await s.foglio({ numero: v.numero, catena: c.catena, passo: c.passo, consegna: true })
    if (!ok) setConsegnando(false)
  }

  const frase = c.spunto?.tipo === 'testo' ? c.spunto.testo : null
  return (
    <div className="scr-compito">
      <p className={`scr-frase${frase ? '' : ' scr-frase--vuota'}`}>
        {frase ? `«${frase}»` : 'Il foglio è rimasto vuoto: disegna quel che vuoi.'}
      </p>
      <div className="scr-tela-spazio">
        <div className="scr-tela">
          {iniziale ? (
            <Lavagna
              ref={lavagna}
              ops={iniziale.ops}
              onOp={invio.aggiungi}
              strumento={strumento}
              ferma={ferma}
              etichetta={frase ? `Disegna ${frase}` : 'Disegna'}
            />
          ) : (
            <div className="scr-lavagna scr-lavagna--attesa" aria-hidden="true" />
          )}
        </div>
      </div>
      <Strumenti
        strumento={strumento}
        onCambia={setStrumento}
        onAnnulla={() => lavagna.current?.annulla()}
        onPulisci={() => lavagna.current?.pulisci()}
        disabilitati={ferma || !iniziale}
      />
      <div className="scr-compito__azioni">
        <Button onClick={() => void consegna()} disabled={ferma || !iniziale} loading={consegnando}>
          Fatto
        </Button>
      </div>
    </div>
  )
}
