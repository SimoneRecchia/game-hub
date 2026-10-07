/**
 * I pezzi delle schermate di Lupus, gli stessi per il telefono che passa di
 * mano e per la stanza online: il tondo e la carta di un personaggio, le
 * tessere dei giocatori, l'orologio, la cronaca, il diario.
 */

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconCheck } from '@/components/Icons'
import { suona } from '@/lib/suoni'
import type { SegretoLupus } from '@shared/lupus'
import { NOMI_FAZIONI, PERSONAGGI, type Fazione, type IdPersonaggio } from '@shared/lupus-personaggi'
import type { EventoVisto, GiocatoreAlTavolo, VistaTavolo } from '@shared/lupus-vista'
import { IconaLupus, type NomeIcona } from './Icone'
import { CAUSE, ICONE_FAZIONI, VINCITORI, nomeDi, nomiDi, testoDelSegreto, type ConNome } from './testi'

/* ─────────────────────────────  I volti  ───────────────────────────── */

/** Come si disegna l'avatar di un giocatore: online quello del suo profilo, sul telefono dal nome. */
export interface Volto {
  nickname: string
  colore?: string
}

const senzaAccenti = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '')

const Volti = createContext<(id: string, nome: string) => Volto>((_, nome) => ({ nickname: senzaAccenti(nome) }))

export const VoltiDeiGiocatori = Volti.Provider

export function VoltoDi({ id, nome, size = 36 }: { id: string; nome: string; size?: number }) {
  const v = useContext(Volti)(id, nome)
  return <Avatar nickname={v.nickname} color={v.colore} size={size} />
}

/* ─────────────────────────────  I personaggi  ───────────────────────────── */

export function BadgeRuolo({ ruolo, size = 40 }: { ruolo: IdPersonaggio; size?: number }) {
  const p = PERSONAGGI[ruolo]
  return (
    <span className="lupus-badge" style={{ width: size, height: size, '--ruolo': p.colore } as CSSProperties}>
      <IconaLupus nome={ruolo} titolo={p.nome} />
    </span>
  )
}

export function PillolaFazione({ fazione }: { fazione: Fazione }) {
  return (
    <span className={`lupus-fazione is-${fazione}`}>
      <IconaLupus nome={ICONE_FAZIONI[fazione]} size={14} />
      {NOMI_FAZIONI[fazione]}
    </span>
  )
}

/** La carta del personaggio, come la si gira al tavolo: il tondo grande, il nome, la fazione, la regola. */
export function CartaRuolo({
  ruolo,
  assunto,
  children,
}: {
  ruolo: IdPersonaggio
  /** Il ruolo che il Mitomane ha preso, se l'ha preso. */
  assunto?: IdPersonaggio
  children?: ReactNode
}) {
  const visto = assunto ?? ruolo
  const p = PERSONAGGI[visto]
  return (
    <div className="lupus-carta" style={{ '--ruolo': p.colore } as CSSProperties}>
      <BadgeRuolo ruolo={visto} size={104} />
      <div className="lupus-carta__nome">{p.nome}</div>
      <div className="lupus-carta__motto">{p.motto}</div>
      <PillolaFazione fazione={p.fazione} />
      {assunto && <p className="lupus-nota">Eri il Mitomane: ora sei {p.nome}.</p>}
      <p className="lupus-carta__regola">{p.descrizione}</p>
      {children}
    </div>
  )
}

/** Una riga di un elenco di personaggi: il tondo, il nome con le copie, il motto. */
export function RigaRuolo({ ruolo, quante, onClick }: { ruolo: IdPersonaggio; quante?: number; onClick?: () => void }) {
  const p = PERSONAGGI[ruolo]
  const corpo = (
    <>
      <BadgeRuolo ruolo={ruolo} size={40} />
      <span className="lupus-riga-ruolo__testo">
        <span className="lupus-riga-ruolo__nome">
          {quante && quante > 1 ? `${quante} ${p.plurale ?? p.nome}` : p.nome}
        </span>
        <span className="lupus-riga-ruolo__motto">{p.motto}</span>
      </span>
    </>
  )
  if (!onClick) return <div className="lupus-riga-ruolo">{corpo}</div>
  return (
    <button type="button" className="lupus-riga-ruolo is-tocca" onClick={onClick}>
      {corpo}
    </button>
  )
}

/* ─────────────────────────────  I giocatori  ───────────────────────────── */

const morto = (g: GiocatoreAlTavolo) => !g.vivo && !g.nonMorto

/**
 * Un giocatore in un elenco: il volto, il nome, e a destra quel che conta in
 * quel momento — i voti, il ruolo se e' pubblico, il teschio se e' morto. Si
 * tocca per sceglierlo, e la spunta dice chi si e' scelto.
 */
export function TesseraGiocatore({
  giocatore,
  scelto = false,
  conto,
  caldo = false,
  sotto,
  mostraRuolo = true,
  onClick,
}: {
  giocatore: GiocatoreAlTavolo
  scelto?: boolean
  conto?: number
  /** Fra i piu' votati. */
  caldo?: boolean
  sotto?: ReactNode
  mostraRuolo?: boolean
  onClick?: () => void
}) {
  const classi = ['lupus-tessera', morto(giocatore) && 'is-morto', scelto && 'is-scelto', onClick && 'is-tocca']
    .filter(Boolean)
    .join(' ')
  const corpo = (
    <>
      <VoltoDi id={giocatore.id} nome={giocatore.nome} />
      <span className="lupus-tessera__testo">
        <span className="lupus-tessera__nome">{giocatore.nome}</span>
        {sotto && <span className="lupus-tessera__sotto">{sotto}</span>}
      </span>
      <span className="lupus-tessera__altro">
        {giocatore.nonMorto && <span className="lupus-segno">Mortovivo</span>}
        {morto(giocatore) && !giocatore.ruolo && <IconaLupus nome="teschio" size={18} titolo="Fantasma" />}
        {mostraRuolo && giocatore.ruolo && <BadgeRuolo ruolo={giocatore.ruolo} size={28} />}
        {conto !== undefined && <span className={`lupus-tessera__conto${caldo ? ' is-caldo' : ''}`}>{conto}</span>}
      </span>
      {onClick && <span className="lupus-tessera__spunta">{scelto && <IconCheck size={14} />}</span>}
    </>
  )
  if (!onClick) return <div className={classi}>{corpo}</div>
  return (
    <button type="button" className={classi} onClick={onClick} aria-pressed={scelto}>
      {corpo}
    </button>
  )
}

/** I giocatori fra cui sceglierne uno: solo quelli che si possono scegliere. */
export function SceltaGiocatore({
  giocatori,
  bersagli,
  valore,
  onScegli,
}: {
  giocatori: GiocatoreAlTavolo[]
  bersagli: readonly string[]
  valore: string | null
  onScegli: (id: string) => void
}) {
  const ammessi = new Set(bersagli)
  return (
    <div className="lupus-elenco" role="group">
      {giocatori
        .filter((g) => ammessi.has(g.id))
        .map((g) => (
          <TesseraGiocatore
            key={g.id}
            giocatore={g}
            scelto={valore === g.id}
            mostraRuolo={false}
            onClick={() => {
              suona('tocco', { volume: 0.6 })
              onScegli(g.id)
            }}
          />
        ))}
    </div>
  )
}

/** Un giocatore in piccolo, in una fila: il volto e il nome. */
export function Gettone({
  id,
  nome,
  morto: e = false,
  acceso = false,
}: ConNome & { morto?: boolean; acceso?: boolean }) {
  return (
    <span className={`lupus-gettone${e ? ' is-morto' : ''}${acceso ? ' is-acceso' : ''}`}>
      <VoltoDi id={id} nome={nome} size={22} />
      {nome}
    </span>
  )
}

/** Chi e' vivo e chi e' un fantasma, in una carta. */
export function StrisciaVivi({ giocatori }: { giocatori: GiocatoreAlTavolo[] }) {
  const inGioco = giocatori.filter((g) => !morto(g))
  const fantasmi = giocatori.filter(morto)
  return (
    <section className="lupus-striscia" aria-label="I giocatori">
      <p className="lupus-striscia__testa">
        <span>In vita · {inGioco.length}</span>
        {fantasmi.length > 0 && <span className="lupus-striscia__fantasmi">Fantasmi · {fantasmi.length}</span>}
      </p>
      <div className="lupus-gettoni">
        {inGioco.map((g) => (
          <Gettone key={g.id} id={g.id} nome={g.nome} />
        ))}
        {fantasmi.map((g) => (
          <Gettone key={g.id} id={g.id} nome={g.nome} morto />
        ))}
      </div>
    </section>
  )
}

/** I segnalini sul tavolo, che vedono tutti: il "Benvenuto!", il teschio di Amleto, il ritratto di Dorian. */
export function Segnalini({ vista }: { vista: VistaTavolo }) {
  const voci: { icona: NomeIcona; testo: string }[] = []
  if (vista.benvenuto) voci.push({ icona: 'fantasma', testo: `Benvenuto: ${nomeDi(vista.giocatori, vista.benvenuto)}` })
  if (vista.teschio) voci.push({ icona: 'amleto', testo: `Teschio: ${nomeDi(vista.giocatori, vista.teschio)}` })
  if (vista.ritratto) voci.push({ icona: 'dorian', testo: `Ritratto: ${nomeDi(vista.giocatori, vista.ritratto)}` })
  if (voci.length === 0) return null
  return (
    <div className="lupus-segnalini">
      {voci.map((v) => (
        <span key={v.icona} className="lupus-segnalino">
          <IconaLupus nome={v.icona} size={15} />
          {v.testo}
        </span>
      ))}
    </div>
  )
}

/* ─────────────────────────────  La testa di una fase  ───────────────────────────── */

export type TonoFase = 'notte' | 'giorno' | 'sangue' | 'semplice'

/** Il tondo con l'icona, il titolo grande e una riga sotto: cosa succede adesso. */
export function TestaFase({
  icona,
  tono = 'notte',
  titolo,
  sotto,
}: {
  icona: NomeIcona
  tono?: TonoFase
  titolo: ReactNode
  sotto?: ReactNode
}) {
  return (
    <header className="lupus-testa">
      <span className={`lupus-testa__icona is-${tono}`} aria-hidden="true">
        <IconaLupus nome={icona} size="56%" />
      </span>
      <h2 className="lupus-testa__titolo">{titolo}</h2>
      {sotto && <p className="lupus-testa__sotto">{sotto}</p>}
    </header>
  )
}

/* ─────────────────────────────  L'orologio  ───────────────────────────── */

function useAdesso(ogni: number, scarto: number): number {
  const [adesso, setAdesso] = useState(() => Date.now() + scarto)
  useEffect(() => {
    setAdesso(Date.now() + scarto)
    const t = window.setInterval(() => setAdesso(Date.now() + scarto), ogni)
    return () => window.clearInterval(t)
  }, [ogni, scarto])
  return adesso
}

function minutiESecondi(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Il tempo della discussione o delle arringhe: un anello che si svuota verso
 * la fine (`fine`, l'ora del server corretta da `scarto`). Senza una fine
 * dice da quanto e' cominciata. Gli ultimi cinque secondi si sentono.
 */
export function Orologio({ inizio, fine, scarto = 0 }: { inizio: number; fine: number | null; scarto?: number }) {
  const adesso = useAdesso(250, scarto)
  const ultimo = useRef<number | null>(null)
  const resta = fine === null ? null : fine - adesso
  const secondi = resta === null ? null : Math.ceil(resta / 1000)

  useEffect(() => {
    if (secondi === null || secondi === ultimo.current) return
    const prima = ultimo.current
    ultimo.current = secondi
    if (prima === null) return
    if (secondi <= 0 && prima > 0) suona('scaduto')
    else if (secondi > 0 && secondi <= 5) suona('tic')
  }, [secondi])

  if (fine === null) {
    return (
      <div className="lupus-orologio">
        <span className="lupus-orologio__tempo u-tabnum">{minutiESecondi(adesso - inizio)}</span>
        <span className="lupus-orologio__nota">da quando è cominciata</span>
      </div>
    )
  }
  const totale = Math.max(1, fine - inizio)
  const parte = Math.min(1, Math.max(0, (resta ?? 0) / totale))
  const r = 26
  const giro = 2 * Math.PI * r
  const finito = (resta ?? 0) <= 0
  return (
    <div className={`lupus-orologio${finito ? ' is-finito' : (secondi ?? 99) <= 10 ? ' is-urgente' : ''}`}>
      <svg className="lupus-orologio__anello" viewBox="0 0 60 60" aria-hidden="true">
        <circle className="lupus-orologio__fondo" cx="30" cy="30" r={r} />
        <circle
          className="lupus-orologio__pieno"
          cx="30"
          cy="30"
          r={r}
          strokeDasharray={giro}
          strokeDashoffset={giro * (1 - parte)}
        />
      </svg>
      <span className="lupus-orologio__tempo u-tabnum" role="timer">
        {finito ? 'Tempo!' : minutiESecondi(resta ?? 0)}
      </span>
    </div>
  )
}

/* ─────────────────────────────  La cronaca  ───────────────────────────── */

function fatto(e: EventoVisto, giocatori: GiocatoreAlTavolo[]): { icona: NomeIcona; testo: string } | null {
  const n = (id: string) => nomeDi(giocatori, id)
  switch (e.t) {
    case 'notte':
    case 'giorno':
      return null
    case 'morte': {
      // Il linciaggio lo racconta gia' "linciato".
      if (e.causa === 'linciaggio') return null
      const ruolo = giocatori.find((g) => g.id === e.giocatore)?.ruolo
      const chi = ruolo ? `${n(e.giocatore)} (${PERSONAGGI[ruolo].nome})` : n(e.giocatore)
      return { icona: 'teschio', testo: e.causa ? `Muore ${chi}, ${CAUSE[e.causa]}.` : `Muore ${chi}.` }
    }
    case 'nessuna_vittima':
      return { icona: 'luna', testo: 'Nessuna vittima.' }
    case 'risorto':
      return { icona: 'baron', testo: `${n(e.giocatore)} torna in vita.` }
    case 'hyde':
      return { icona: 'jekyll', testo: 'Il dottor Jekyll diventa mister Hyde.' }
    case 'indiziati':
      return {
        icona: 'gente',
        testo: `Indiziati: ${nomiDi(giocatori, e.giocatori)}${e.gufato ? ` (${n(e.gufato)} gufato)` : ''}.`,
      }
    case 'linciato':
      return { icona: 'teschio', testo: `Il villaggio lincia ${n(e.giocatore)}.` }
    case 'nessun_linciato':
      return { icona: 'sole', testo: 'Nessun linciaggio.' }
    case 'rivelato':
      return { icona: e.ruolo, testo: `${n(e.giocatore)} si rivela: ${PERSONAGGI[e.ruolo].nome}.` }
    case 'sopravvissuto':
      return { icona: 'dorian', testo: `Il ritratto salva ${n(e.giocatore)}.` }
    case 'fine':
      return { icona: 'corona', testo: `${VINCITORI[e.vincitore].titolo}.` }
  }
}

/** Quel che il moderatore ha detto a tutti, notte per notte e giorno per giorno. */
export function Cronaca({ cronaca, giocatori }: { cronaca: EventoVisto[]; giocatori: GiocatoreAlTavolo[] }) {
  const voci: ReactNode[] = []
  cronaca.forEach((e, i) => {
    if (e.t === 'notte' || e.t === 'giorno') {
      voci.push(
        <li key={i} className="lupus-cronaca__quando">
          {e.t === 'notte' ? `Notte ${e.n}` : `Giorno ${e.n}`}
        </li>,
      )
      return
    }
    const f = fatto(e, giocatori)
    if (!f) return
    voci.push(
      <li key={i} className="lupus-cronaca__fatto">
        <IconaLupus nome={f.icona} size={16} />
        <span>{f.testo}</span>
      </li>,
    )
  })
  if (voci.length === 0) return <p className="lupus-vuoto">Ancora niente.</p>
  return <ol className="lupus-cronaca">{voci}</ol>
}

/* ─────────────────────────────  I segreti  ───────────────────────────── */

/** Quel che un giocatore ha saputo di notte, in una riga. */
export function RigaSegreto({ segreto, giocatori }: { segreto: SegretoLupus; giocatori: ConNome[] }) {
  const { testo, tono } = testoDelSegreto(segreto, giocatori)
  return (
    <p className={`lupus-segreto${tono === 'male' ? ' is-male' : ''}`}>
      <span className="lupus-segreto__quando">Notte {segreto.notte}</span>
      {testo}
    </p>
  )
}

/** Il diario: tutto quel che si e' saputo di notte, dal primo. */
export function Diario({ segreti, giocatori }: { segreti: SegretoLupus[]; giocatori: ConNome[] }) {
  if (segreti.length === 0) return <p className="lupus-vuoto">Di notte non hai ancora saputo niente.</p>
  return (
    <div className="lupus-diario">
      {segreti.map((s, i) => (
        <RigaSegreto key={i} segreto={s} giocatori={giocatori} />
      ))}
    </div>
  )
}

/* ─────────────────────────────  I comandi  ───────────────────────────── */

/** Un interruttore, come nelle Impostazioni. */
export function Interruttore({
  acceso,
  onCambia,
  etichetta,
  disabilitato = false,
}: {
  acceso: boolean
  onCambia: (acceso: boolean) => void
  etichetta: string
  disabilitato?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      aria-label={etichetta}
      disabled={disabilitato}
      className="lupus-interruttore"
      onClick={() => onCambia(!acceso)}
    />
  )
}

/** Meno e piu', con il numero in mezzo: le copie di un personaggio nel mazzo. */
export function Passi({
  valore,
  massimo,
  passo = 1,
  onCambia,
  etichetta,
}: {
  valore: number
  massimo: number
  passo?: number
  onCambia: (valore: number) => void
  etichetta: string
}) {
  return (
    <span className="lupus-passi" role="group" aria-label={etichetta}>
      <button
        type="button"
        className="lupus-passi__tasto"
        aria-label={`Una carta in meno: ${etichetta}`}
        disabled={valore - passo < 0}
        onClick={() => onCambia(Math.max(0, valore - passo))}
      >
        −
      </button>
      <span className="lupus-passi__numero u-tabnum" aria-live="polite">
        {valore}
      </span>
      <button
        type="button"
        className="lupus-passi__tasto"
        aria-label={`Una carta in più: ${etichetta}`}
        disabled={valore + passo > massimo}
        onClick={() => onCambia(Math.min(massimo, valore + passo))}
      >
        +
      </button>
    </span>
  )
}

/** Il bottone di chi conduce, o la riga che dice che lo fara' lui. */
export function DiChiConduce({
  onClick,
  children,
  attesa,
  variante = 'filled',
}: {
  onClick?: () => void
  children: ReactNode
  attesa?: string
  variante?: 'filled' | 'destructive'
}) {
  if (!onClick) return attesa ? <p className="lupus-attesa">{attesa}</p> : null
  return (
    <Button variant={variante} size="lg" fullWidth onClick={onClick}>
      {children}
    </Button>
  )
}
