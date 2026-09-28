import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Vuoto, useFesta } from '@/components/Elementi'
import { IconFlag, IconInfo, IconList, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { ComeSiGiocaIndovina } from '@/games/indovina/ComeSiGioca'
import { Faccia, Tabellone } from '@/games/indovina/Tabellone'
import { adesivoFine } from '@/games/indovina/adesivi'
import { useIndovina, type PartitaIndovina } from '@/games/indovina/useIndovina'
import { DOMANDA_MASSIMA, NOMI_RISPOSTE, RISPOSTE } from '@shared/indovina'
import type { MossaVista, VistaIndovina } from '@shared/types'
import './Indovina.css'

/**
 * Una partita di Indovina chi. In cima il proprio personaggio — quello a cui
 * si risponde — e quante facce restano all'altro; in mezzo il tabellone, dove
 * si abbassano le facce; sotto quel che c'e' da fare adesso: rispondere,
 * chiedere, o aspettare. L'ultima risposta alla propria domanda resta in vista
 * finché non se ne fa un'altra: e' quella che dice cosa abbassare.
 */
export default function IndovinaPartita() {
  const { id = '' } = useParams()
  const g = useIndovina(id)
  const v = g.vista
  const [regole, setRegole] = useState(false)
  const [storia, setStoria] = useState(false)
  const [resa, setResa] = useState(false)
  const [segreto, setSegreto] = useState(false)
  const [scegli, setScegli] = useState(false)
  const [scelta, setScelta] = useState<number | null>(null)

  // La fine: l'adesivo, una volta, e i coriandoli solo per una vittoria vista in corso.
  const { adesivo, accoda } = useCodaAdesivi()
  const inCorso = v ? v.stato === 'in_corso' : null
  const festa = useFesta(inCorso, v?.stato === 'finita' && v.vincitore === 'io')
  const eraInCorso = useRef<boolean | null>(null)
  const vRef = useRef(v)
  vRef.current = v
  useEffect(() => {
    if (inCorso === null) return
    if (inCorso) {
      eraInCorso.current = true
      return
    }
    const vista = vRef.current
    if (eraInCorso.current && vista) {
      const a = adesivoFine(vista)
      if (a) accoda(a)
    }
    eraInCorso.current = false
  }, [accoda, inCorso])

  useEffect(() => {
    if (!v?.tuoTurno) setScegli(false)
  }, [v?.tuoTurno])

  if (g.errore && !v) {
    return (
      <Pagina titolo="Indovina chi" intera indietro={{ a: ROTTE.indovina, etichetta: 'Indovina chi' }}>
        <Vuoto titolo="Partita non trovata" testo={g.errore} />
      </Pagina>
    )
  }

  const nome = v?.avversario?.displayName ?? 'l’altro'
  const tocca = (k: number) => {
    if (!v) return
    if (scegli) setScelta(k)
    else g.abbassa(k)
  }

  return (
    <Pagina
      titolo={v?.avversario ? `Con ${v.avversario.displayName}` : 'Indovina chi'}
      intera
      indietro={{ a: ROTTE.indovina, etichetta: 'Indovina chi' }}
      azioni={
        <>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
          {v && v.mosse.length > 0 && (
            <BottoneBarra etichetta="Le domande" onClick={() => setStoria(true)}>
              <IconList size={20} />
            </BottoneBarra>
          )}
          {v?.stato === 'in_corso' && (
            <BottoneBarra etichetta="Lascia la partita" onClick={() => setResa(true)}>
              <IconFlag size={19} />
            </BottoneBarra>
          )}
        </>
      }
    >
      {!v ? (
        <div className="ic-attesa" aria-hidden="true" />
      ) : v.stato === 'invito' || v.stato === 'rifiutata' || v.stato === 'annullata' ? (
        <InvitoInAttesa v={v} />
      ) : (
        <div className="ic">
          <div className="ic__testa">
            {v.mioSegreto !== null && (
              <button type="button" className="ic-segreto" onClick={() => setSegreto(true)}>
                <Faccia
                  url={g.immagini.url(v.mioSegreto)}
                  sfondo={g.immagini.sfondo(v.mioSegreto)}
                  nome={v.personaggi.voci[v.mioSegreto].nome}
                />
                <span className="ic-segreto__testo">
                  <span className="ic-segreto__etichetta">Il tuo personaggio</span>
                  <span className="ic-segreto__nome">{v.personaggi.voci[v.mioSegreto].nome}</span>
                </span>
              </button>
            )}
            <span className="ic__conto" aria-label={`A ${nome} ne restano ${v.sueInPiedi}`}>
              <Avatar nickname={v.avversario?.nickname ?? '?'} color={v.avversario?.avatarColor} size={32} />
              <span className="ic__conto-testo">
                <strong className="u-tabnum">{v.sueInPiedi}</strong>
                <span>in piedi</span>
              </span>
            </span>
          </div>

          <Foto g={g} nome={nome} />

          <Tabellone
            personaggi={v.personaggi}
            url={g.immagini.url}
            sfondo={g.immagini.sfondo}
            abbassate={g.abbassate}
            scegli={scegli}
            scelta={scelta}
            rivelato={v.suoSegreto}
            vinto={v.vincitore === 'io'}
            attesaFoto={g.foto.stato === 'cerco' || g.foto.stato === 'ricevo'}
            onTocca={tocca}
          />

          <div className="ic__piede">
            {v.stato === 'finita' ? (
              <Fine g={g} v={v} />
            ) : scegli ? (
              <div className="ic-scegli">
                <p className="ic-scegli__testo">Chi è? Tocca il suo personaggio.</p>
                <Button variant="plain" onClick={() => setScegli(false)}>
                  Annulla
                </Button>
              </div>
            ) : (
              <Turno g={g} v={v} nome={nome} onIndovina={() => setScegli(true)} />
            )}
          </div>
        </div>
      )}

      <ComeSiGiocaIndovina open={regole} onClose={() => setRegole(false)} />

      <Sheet open={storia} onClose={() => setStoria(false)} title="Le domande">
        {v && <Storia mosse={v.mosse} nome={nome} v={v} />}
      </Sheet>

      <Sheet open={segreto} onClose={() => setSegreto(false)} title="Il tuo personaggio">
        {v && v.mioSegreto !== null && (
          <div className="ic-foglio-segreto">
            <Faccia
                  url={g.immagini.url(v.mioSegreto)}
                  sfondo={g.immagini.sfondo(v.mioSegreto)}
                  nome={v.personaggi.voci[v.mioSegreto].nome}
                />
            <p className="ic-foglio-segreto__nome">{v.personaggi.voci[v.mioSegreto].nome}</p>
            <p className="ic-foglio-segreto__nota">Rispondi alle domande pensando a questo personaggio.</p>
          </div>
        )}
      </Sheet>

      <Sheet open={scelta !== null} onClose={() => setScelta(null)} title="Provi a indovinare?">
        {v && scelta !== null && (
          <div className="ic-conferma">
            <div className="ic-conferma__carta">
              <Faccia url={g.immagini.url(scelta)} sfondo={g.immagini.sfondo(scelta)} nome={v.personaggi.voci[scelta].nome} />
            </div>
            <p className="ic-conferma__testo">
              È <strong>{v.personaggi.voci[scelta].nome}</strong>? Se sbagli, perdi.
            </p>
            <Button
              size="lg"
              fullWidth
              loading={g.inviando}
              onClick={() => {
                const k = scelta
                setScelta(null)
                setScegli(false)
                g.indovina(k)
              }}
            >
              Sì, è {v.personaggi.voci[scelta].nome}
            </Button>
            <Button size="lg" fullWidth variant="plain" onClick={() => setScelta(null)}>
              Ci penso ancora
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={resa} onClose={() => setResa(false)} title="Lasciare la partita?">
        <div className="ic-conferma">
          <p className="ic-conferma__testo">Vince {nome}.</p>
          <Button
            size="lg"
            fullWidth
            variant="destructive"
            onClick={() => {
              setResa(false)
              g.arrenditi()
            }}
          >
            Lascia
          </Button>
          <Button size="lg" fullWidth variant="plain" onClick={() => setResa(false)}>
            Continua a giocare
          </Button>
        </div>
      </Sheet>

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Le foto del set, se arrivano dall'altro telefono: quante, o perché no. */
function Foto({ g, nome }: { g: PartitaIndovina; nome: string }) {
  const { stato, ricevute, riprova } = g.foto
  if (stato === 'niente' || stato === 'fatto') return null
  const totali = g.immagini.mancanti.length + ricevute
  return (
    <div className={`ic-foto${stato === 'fallito' ? ' is-fallito' : ''}`} role="status">
      {stato === 'fallito' ? (
        <>
          <span>Le foto di {nome} non arrivano.</span>
          <Button variant="tinted" onClick={riprova}>
            <IconRefresh size={16} /> Riprova
          </Button>
        </>
      ) : (
        <>
          <span>{stato === 'cerco' ? `Mi collego al telefono di ${nome}…` : `Arrivano le foto: ${ricevute} di ${totali}`}</span>
          <span className="ic-foto__barra" aria-hidden="true">
            <span style={{ transform: `scaleX(${totali > 0 ? ricevute / totali : 0})` }} />
          </span>
        </>
      )}
    </div>
  )
}

/** L'ultima domanda mia con la sua risposta, se c'e': dice cosa abbassare. */
function ultimaRispostaAMe(mosse: MossaVista[]): { testo: string; risposta: string } | null {
  for (let i = mosse.length - 1; i > 0; i -= 1) {
    const r = mosse[i]
    const d = mosse[i - 1]
    if (r.t === 'r' && !r.mia && d.t === 'd' && d.mia) return { testo: d.testo, risposta: NOMI_RISPOSTE[r.r] }
  }
  return null
}

function Turno({ g, v, nome, onIndovina }: { g: PartitaIndovina; v: VistaIndovina; nome: string; onIndovina: () => void }) {
  const [testo, setTesto] = useState('')
  const ultima = useMemo(() => ultimaRispostaAMe(v.mosse), [v.mosse])

  const chiedi = async (e: FormEvent) => {
    e.preventDefault()
    const pulito = testo.trim()
    if (!pulito || g.inviando) return
    if (await g.chiedi(pulito)) setTesto('')
  }

  const risposta = ultima && (
    <p className="ic-ultima">
      <span className="ic-ultima__domanda">«{ultima.testo}»</span>
      <span className={`ic-ultima__risposta is-${ultima.risposta === 'Sì' ? 'si' : ultima.risposta === 'No' ? 'no' : 'forse'}`}>
        {ultima.risposta}
      </span>
    </p>
  )

  // L'altro mi ha fatto una domanda: si risponde, e poi tocca a me.
  if (v.domanda && !v.domanda.mia) {
    return (
      <div className="ic-domanda">
        <p className="ic-domanda__chi">{nome} chiede</p>
        <p className="ic-domanda__testo">«{v.domanda.testo}»</p>
        <div className="ic-domanda__risposte">
          {RISPOSTE.map((r) => (
            <Button
              key={r}
              variant={r === 'forse' ? 'plain' : 'tinted'}
              className={`ic-risposta ic-risposta--${r}`}
              onClick={() => g.rispondi(r)}
              disabled={g.inviando}
            >
              {NOMI_RISPOSTE[r]}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  if (v.domanda?.mia) {
    return (
      <div className="ic-aspetto">
        <p className="ic-domanda__testo">«{v.domanda.testo}»</p>
        <p className="ic-aspetto__testo">
          <span className="ic-puntini" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Aspetto la risposta di {nome}
        </p>
        <Reclamo g={g} v={v} nome={nome} />
      </div>
    )
  }

  if (!v.tuoTurno) {
    return (
      <div className="ic-aspetto">
        {risposta}
        <p className="ic-aspetto__testo">
          <span className="ic-puntini" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Tocca a {nome}
          {!v.avversario?.online && <span className="ic-aspetto__nota">· non è online</span>}
        </p>
        <Reclamo g={g} v={v} nome={nome} />
      </div>
    )
  }

  return (
    <div className="ic-chiedi">
      {risposta}
      <form className="ic-chiedi__riga" onSubmit={chiedi}>
        <input
          className="ic-chiedi__campo"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="Fai una domanda: sì o no"
          maxLength={DOMANDA_MASSIMA}
          enterKeyHint="send"
          aria-label="La tua domanda"
        />
        <Button type="submit" disabled={!testo.trim() || g.inviando}>
          Chiedi
        </Button>
      </form>
      <button type="button" className="ic-chiedi__indovina" onClick={onIndovina} disabled={g.inviando}>
        Oppure <strong>indovina</strong>
      </button>
    </div>
  )
}

/** L'altro ha la mossa da tre minuti: si puo' chiudere la partita a proprio favore. */
function Reclamo({ g, v, nome }: { g: PartitaIndovina; v: VistaIndovina; nome: string }) {
  if (!v.puoiReclamare) return null
  return (
    <div className="ic-reclamo">
      <span>{nome} non risponde da un po’.</span>
      <Button variant="tinted" onClick={g.reclama} disabled={g.inviando}>
        Chiudi e vinci
      </Button>
    </div>
  )
}

function Storia({ mosse, nome, v }: { mosse: MossaVista[]; nome: string; v: VistaIndovina }) {
  const righe: { chi: string; testo: string; risposta?: string; mia: boolean }[] = []
  for (let i = 0; i < mosse.length; i += 1) {
    const m = mosse[i]
    if (m.t === 'd') {
      const r = mosse[i + 1]
      righe.push({
        chi: m.mia ? 'Tu' : nome,
        testo: m.testo,
        risposta: r?.t === 'r' ? NOMI_RISPOSTE[r.r] : undefined,
        mia: m.mia,
      })
    } else if (m.t === 'i') {
      righe.push({
        chi: m.mia ? 'Tu' : nome,
        testo: `È ${v.personaggi.voci[m.k]?.nome ?? '?'}?`,
        risposta: m.ok ? 'Indovinato' : 'Sbagliato',
        mia: m.mia,
      })
    }
  }
  if (righe.length === 0) return <p className="ic-storia__vuota">Ancora nessuna domanda.</p>
  return (
    <ol className="ic-storia">
      {righe.map((r, i) => (
        <li key={i} className={`ic-storia__riga${r.mia ? ' is-mia' : ''}`}>
          <span className="ic-storia__chi">{r.chi}</span>
          <span className="ic-storia__testo">{r.testo}</span>
          {r.risposta && <span className="ic-storia__risposta">{r.risposta}</span>}
        </li>
      ))}
    </ol>
  )
}

function Fine({ g, v }: { g: PartitaIndovina; v: VistaIndovina }) {
  const { vai } = useNavigazione()
  const [chiedendo, setChiedendo] = useState(false)
  const r = v.rivincita
  const nome = v.avversario?.displayName ?? 'L’altro'
  const voce = (k: number | null) => (k !== null ? (v.personaggi.voci[k]?.nome ?? null) : null)
  const suo = voce(v.suoSegreto)
  const tentativo = [...v.mosse].reverse().find((m) => m.t === 'i')
  const provato = tentativo?.t === 'i' ? voce(tentativo.k) : null
  const domande = v.mosse.filter((m) => m.t === 'd' && m.mia).length
  const titolo =
    v.vincitore === 'io'
      ? v.motivo === 'indovinato'
        ? 'Hai indovinato!'
        : 'Hai vinto'
      : v.motivo === 'indovinato'
        ? `Ha indovinato ${nome}`
        : v.motivo === 'sbagliato'
          ? 'Hai sbagliato'
          : `Ha vinto ${nome}`
  // Com'e' andata, in una riga: chi ha provato con chi, e qual era il suo.
  const come =
    v.motivo === 'indovinato' && v.vincitore === 'io'
      ? `Era ${suo}, in ${domande} ${domande === 1 ? 'domanda' : 'domande'}`
      : v.motivo === 'sbagliato' && v.vincitore === 'io'
        ? `${nome} ha provato con ${provato} · il suo era ${suo}`
        : v.motivo === 'sbagliato'
          ? `Era ${suo}, non ${provato}`
          : `Il suo era ${suo}`

  // La rivincita accettata: si va alla partita nuova, tutti e due.
  useEffect(() => {
    if (r?.stato === 'accettato' && r.partitaId) vai(ROTTE.partitaIndovina(r.partitaId), { replace: true })
  }, [r?.stato, r?.partitaId, vai])

  const ancora = async () => {
    setChiedendo(true)
    const esito = await g.rivincita()
    setChiedendo(false)
    if (esito?.partitaId) vai(ROTTE.partitaIndovina(esito.partitaId), { replace: true })
  }

  const attesaMia = r?.da === 'io' && r.stato === 'attesa'
  const sua = r?.da === 'avversario' && r.stato === 'attesa'
  const partite = v.serie.partite + 1
  return (
    <div className="ic-fine">
      <p className="ic-fine__titolo">{titolo}</p>
      <p className="ic-fine__dettaglio">
        {suo ? come : ''}
        {partite > 1 && (
          <>
            {' · '}
            <span className="u-tabnum">
              {v.serie.io + (v.vincitore === 'io' ? 1 : 0)} a {v.serie.avversario + (v.vincitore === 'avversario' ? 1 : 0)}
            </span>
          </>
        )}
      </p>
      {sua && <p className="ic-fine__nota">{nome} vuole la rivincita.</p>}
      {attesaMia && <p className="ic-fine__nota">Aspetto {nome}…</p>}
      {r?.da === 'avversario' && r.stato === 'rifiutato' && <p className="ic-fine__nota">{nome} non vuole la rivincita.</p>}
      <div className="ic-fine__azioni">
        <Button onClick={() => void ancora()} loading={chiedendo} disabled={attesaMia || !v.avversario?.online}>
          <IconRefresh size={17} /> {sua ? 'Accetta la rivincita' : 'Gioca ancora'}
        </Button>
        <Button variant="tinted" onClick={() => vai(ROTTE.indovina)}>
          Esci
        </Button>
      </div>
      {!v.avversario?.online && !sua && <p className="ic-fine__nota">{nome} non è più online.</p>}
    </div>
  )
}

/** La partita e' ancora un invito: chi l'ha mandato aspetta; se e' stato rifiutato o ritirato, lo dice. */
function InvitoInAttesa({ v }: { v: VistaIndovina }) {
  const { vai } = useNavigazione()
  const nome = v.avversario?.displayName
  const chiuso = v.stato !== 'invito'
  return (
    <Vuoto
      titolo={chiuso ? 'Invito chiuso' : nome ? `Aspetto ${nome}` : 'Aspetto chi apre il link'}
      testo={chiuso ? (v.stato === 'rifiutata' ? `${nome ?? 'L’amico'} non può giocare adesso.` : undefined) : undefined}
      azione={
        <Button variant="tinted" onClick={() => vai(ROTTE.indovina)}>
          Torna alla sala
        </Button>
      }
    />
  )
}
