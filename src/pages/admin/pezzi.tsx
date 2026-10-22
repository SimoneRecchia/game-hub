/**
 * I pezzi con cui sono fatte le sezioni del pannello: la carta, la cifra, lo
 * stato, la conferma, l'elenco a pagine, il blocco di codice. Sopra quelli
 * dell'app (Elementi, Sheet, Button), con il passo di un cruscotto: piu' fitti,
 * perché qui si guarda tanto in una volta.
 */
import { Children, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import type { GiocoClassificato } from '@shared/types'
import { Collegamento } from '@/app/navigazione'
import { GIOCHI_FORTUNA } from '@/app/menu'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Etichetta, Vuoto } from '@/components/Elementi'
import { IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconCopy } from '@/components/Icons'
import { Sheet } from '@/components/Sheet'
import { GIOCHI, GIOCHI_DA_TAVOLO } from '@/games/catalog'
import { useCopia } from './dati'
import { numero } from './formato'
import { IconaAvviso, IconaGiu } from './icone'

/* ─────────────────────────────  I giochi  ───────────────────────────── */

const NOMI_FORTUNA: Record<string, { nome: string; copertina: (typeof GIOCHI_FORTUNA)[number]['id'] }> = {
  'crazy-time': { nome: GIOCHI_FORTUNA[0].nome, copertina: 'ruota' },
  ruota: { nome: GIOCHI_FORTUNA[0].nome, copertina: 'ruota' },
  slot: { nome: GIOCHI_FORTUNA[1].nome, copertina: 'slot' },
  blackjack: { nome: GIOCHI_FORTUNA[2].nome, copertina: 'blackjack' },
  roulette: { nome: GIOCHI_FORTUNA[3].nome, copertina: 'roulette' },
  superenalotto: { nome: GIOCHI_FORTUNA[4].nome, copertina: 'superenalotto' },
}

/** Il nome di un gioco, classificato o della Fortuna: "Nomi, cose e città", "Crazy Time". */
export function nomeDi(gioco: string): string {
  return NOMI_FORTUNA[gioco]?.nome ?? classificato(gioco)?.nome ?? GIOCHI_DA_TAVOLO.find((g) => g.id === gioco)?.nome ?? gioco
}

const classificato = (id: string) => GIOCHI.find((g) => g.id === (id as GiocoClassificato))

/** La copertina piccola di un gioco, se l'app ne ha una; altrimenti un tondo con l'iniziale. */
export function IconaGioco({ gioco, lato = 24 }: { gioco: string; lato?: number }) {
  const copertina =
    NOMI_FORTUNA[gioco]?.copertina ??
    (classificato(gioco) || GIOCHI_DA_TAVOLO.some((g) => g.id === gioco) ? gioco : null)
  if (!copertina) {
    return (
      <span className="adm-iniziale" style={{ width: lato, height: lato }} aria-hidden="true">
        {gioco.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    <span className="adm-icona-gioco" style={{ '--lato': `${lato}px` } as CSSProperties}>
      <Copertina gioco={copertina as Parameters<typeof Copertina>[0]['gioco']} formato="icona" />
    </span>
  )
}

/** Il gioco con la sua icona, in riga. */
export function Gioco({ gioco, lato = 24 }: { gioco: string; lato?: number }) {
  return (
    <span className="adm-gioco">
      <IconaGioco gioco={gioco} lato={lato} />
      <span>{nomeDi(gioco)}</span>
    </span>
  )
}

/* ─────────────────────────────  La carta  ───────────────────────────── */

/**
 * Una carta del cruscotto: il titolo, una riga sotto, le azioni a destra, e
 * il contenuto. E' un contenitore (`adm-carta`), cosi' quel che c'e' dentro si
 * misura sulla carta e non sullo schermo.
 */
export function Carta({
  titolo,
  sotto,
  azioni,
  icona,
  className = '',
  stile,
  children,
}: {
  titolo?: ReactNode
  sotto?: ReactNode
  azioni?: ReactNode
  icona?: ReactNode
  className?: string
  stile?: CSSProperties
  children: ReactNode
}) {
  return (
    <section className={`adm-carta ${className}`} style={stile}>
      {(titolo || azioni) && (
        <header className="adm-carta__testa">
          {icona && <span className="adm-carta__icona">{icona}</span>}
          <div className="adm-carta__titoli">
            {titolo && <h2 className="adm-carta__titolo">{titolo}</h2>}
            {sotto && <p className="adm-carta__sotto">{sotto}</p>}
          </div>
          {azioni && <div className="adm-carta__azioni">{azioni}</div>}
        </header>
      )}
      <div className="adm-carta__corpo">{children}</div>
    </section>
  )
}

/* ─────────────────────────────  La cifra  ───────────────────────────── */

export type Tono = 'neutro' | 'buono' | 'avviso' | 'cattivo'

/**
 * Una cifra del cruscotto: il nome, il numero grande, una riga sotto (un
 * confronto, un dettaglio), e se serve la linea dei trenta giorni. Con `a`
 * porta alla sezione che la spiega.
 */
export function Cifra({
  etichetta,
  valore,
  sotto,
  andamento,
  tono = 'neutro',
  a,
  vivo = false,
}: {
  etichetta: string
  valore: ReactNode
  sotto?: ReactNode
  andamento?: ReactNode
  tono?: Tono
  a?: string
  /** Il pallino che respira: "online adesso". */
  vivo?: boolean
}) {
  const corpo = (
    <>
      <span className="adm-cifra__etichetta">
        {vivo && <span className="adm-vivo" aria-hidden="true" />}
        {etichetta}
      </span>
      <span className="adm-cifra__valore">{valore}</span>
      {sotto && <span className="adm-cifra__sotto">{sotto}</span>}
      {andamento && <span className="adm-cifra__andamento">{andamento}</span>}
      {a && <IconChevronRight size={16} className="adm-cifra__freccia" />}
    </>
  )
  const classe = `adm-cifra is-${tono}${a ? ' is-tocca' : ''}`
  return a ? (
    <Collegamento to={a} direzione="scheda" replace className={classe}>
      {corpo}
    </Collegamento>
  ) : (
    <div className={classe}>{corpo}</div>
  )
}

/**
 * Le cifre in fila. Quante per riga lo decide quante sono, sulla larghezza del
 * contenuto: sei vanno a due, tre o sei per riga, quattro a due o quattro, mai
 * una riga piena e una mezza vuota.
 */
export function Cifre({ children }: { children: ReactNode }) {
  const quante = Children.toArray(children).filter(Boolean).length
  return (
    <div className="adm-cifre" data-quante={quante}>
      {children}
    </div>
  )
}

/* ─────────────────────────────  Lo stato  ───────────────────────────── */

const TONI: Record<Tono, 'neutro' | 'verde' | 'arancio' | 'rosso'> = {
  neutro: 'neutro',
  buono: 'verde',
  avviso: 'arancio',
  cattivo: 'rosso',
}

/** Uno stato con la sua icona e la sua parola: il colore da solo non lo direbbe a tutti. */
export function Stato({ tono, children }: { tono: Tono; children: ReactNode }) {
  const icona =
    tono === 'buono' ? (
      <IconCheck size={12} strokeWidth={2.6} />
    ) : tono === 'avviso' ? (
      <IconaAvviso size={12} strokeWidth={2.2} />
    ) : tono === 'cattivo' ? (
      <IconClose size={12} strokeWidth={2.6} />
    ) : null
  return (
    <Etichetta tono={TONI[tono]}>
      {icona}
      {children}
    </Etichetta>
  )
}

/* ─────────────────────────────  La conferma  ───────────────────────────── */

/**
 * La conferma di un'azione che non si disfa: dice che cosa succede, e il
 * bottone dice di nuovo che cosa si fa ("Elimina", non "OK"). Con `scrivi`
 * chiede di scrivere una parola — il nickname dell'account da eliminare —
 * prima di lasciar premere.
 */
export function Conferma({
  aperta,
  titolo,
  testo,
  azione,
  distruttiva = true,
  scrivi,
  occupato = false,
  onConferma,
  onChiudi,
  children,
}: {
  aperta: boolean
  titolo: string
  testo?: ReactNode
  azione: string
  distruttiva?: boolean
  scrivi?: string
  occupato?: boolean
  onConferma: () => void
  onChiudi: () => void
  children?: ReactNode
}) {
  const [scritto, setScritto] = useState('')
  const id = useId()
  useEffect(() => {
    if (aperta) setScritto('')
  }, [aperta])
  const pronta = !scrivi || scritto.trim() === scrivi
  return (
    <Sheet open={aperta} onClose={onChiudi} title={titolo}>
      {testo && <p className="adm-conferma__testo">{testo}</p>}
      {children}
      {scrivi && (
        <div className="adm-conferma__scrivi">
          <label htmlFor={id}>
            Scrivi <strong data-selezionabile>{scrivi}</strong> per confermare
          </label>
          <input
            id={id}
            className="adm-campo"
            value={scritto}
            onChange={(e) => setScritto(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </div>
      )}
      <Button
        variant={distruttiva ? 'destructive' : 'filled'}
        size="lg"
        fullWidth
        disabled={!pronta}
        loading={occupato}
        onClick={onConferma}
      >
        {azione}
      </Button>
      <Button variant="plain" size="lg" fullWidth onClick={onChiudi}>
        Annulla
      </Button>
    </Sheet>
  )
}

/* ─────────────────────────────  Le pagine  ───────────────────────────── */

/** "1–50 di 128", con le frecce. */
export function Paginatore({
  pagina,
  perPagina,
  totale,
  onPagina,
  disabilitato = false,
}: {
  pagina: number
  perPagina: number
  totale: number
  onPagina: (pagina: number) => void
  disabilitato?: boolean
}) {
  const pagine = Math.max(1, Math.ceil(totale / perPagina))
  if (totale <= perPagina && pagina === 1) return null
  const da = totale === 0 ? 0 : (pagina - 1) * perPagina + 1
  const a = Math.min(totale, pagina * perPagina)
  return (
    <nav className="adm-pagine" aria-label="Pagine">
      <button
        type="button"
        className="adm-pagine__freccia"
        disabled={disabilitato || pagina <= 1}
        onClick={() => onPagina(pagina - 1)}
        aria-label="Pagina precedente"
      >
        <IconChevronLeft size={18} />
      </button>
      <span className="adm-pagine__dove u-tabnum">
        {numero(da)}–{numero(a)} di {numero(totale)}
      </span>
      <button
        type="button"
        className="adm-pagine__freccia"
        disabled={disabilitato || pagina >= pagine}
        onClick={() => onPagina(pagina + 1)}
        aria-label="Pagina successiva"
      >
        <IconChevronRight size={18} />
      </button>
    </nav>
  )
}

/* ─────────────────────────────  Il carico e l'errore  ───────────────────────────── */

/** Il posto dei dati che arrivano: blocchi grigi della forma di quel che verra'. */
export function Attesa({ righe = 3, alta = 120 }: { righe?: number; alta?: number }) {
  return (
    <div className="adm-attesa" aria-busy="true" aria-label="Carico">
      {Array.from({ length: righe }, (_, i) => (
        <div key={i} className="scheletro" style={{ height: alta }} />
      ))}
    </div>
  )
}

/** Un errore di caricamento, con il bottone per riprovare. */
export function Errore({ testo, onRiprova }: { testo: string; onRiprova: () => void }) {
  return (
    <Carta>
      <Vuoto
        icona={<IconaAvviso size={28} />}
        titolo="Non riesco a caricare i dati"
        testo={testo}
        azione={
          <Button variant="tinted" onClick={onRiprova}>
            Riprova
          </Button>
        }
      />
    </Carta>
  )
}

/* ─────────────────────────────  La scelta  ───────────────────────────── */

/**
 * Una scelta da un elenco, con il menu del sistema: sul telefono e' la ruota di
 * iOS, sul computer la tendina. Per i filtri e l'ordine dei giocatori, dove le
 * voci sono troppe per un controllo segmentato.
 */
export function Scelta<T extends string>({
  etichetta,
  valore,
  voci,
  onCambia,
}: {
  etichetta: string
  valore: T
  voci: Array<{ valore: T; nome: string }>
  onCambia: (valore: T) => void
}) {
  const id = useId()
  return (
    <span className="adm-scelta">
      <label htmlFor={id} className="u-visually-hidden">
        {etichetta}
      </label>
      <select id={id} value={valore} onChange={(e) => onCambia(e.target.value as T)}>
        {voci.map((v) => (
          <option key={v.valore} value={v.valore}>
            {v.nome}
          </option>
        ))}
      </select>
      <IconaGiu size={14} className="adm-scelta__giu" />
    </span>
  )
}

/* ─────────────────────────────  Il codice  ───────────────────────────── */

/** Un blocco di codice o di JSON, che si seleziona e si copia. */
export function Codice({ testo, alto, etichetta = 'Copia' }: { testo: string; alto?: number; etichetta?: string }) {
  const copia = useCopia()
  return (
    <div className="adm-codice">
      <pre data-selezionabile style={alto ? { maxHeight: alto } : undefined}>
        {testo}
      </pre>
      <button type="button" className="adm-codice__copia" onClick={() => void copia(testo)} aria-label={etichetta}>
        <IconCopy size={16} />
      </button>
    </div>
  )
}

/** Il pallino di chi e' online, che respira. */
export function Online({ online }: { online: boolean }) {
  return <span className={`adm-punto${online ? ' is-online' : ''}`} aria-hidden="true" />
}

/** Una riga di un elenco di nomi e valori (dentro un `<dl className="adm-voci">`). */
export function Voce({ nome, valore }: { nome: ReactNode; valore: ReactNode }) {
  return (
    <div className="adm-voci__riga">
      <dt>{nome}</dt>
      <dd>{valore}</dd>
    </div>
  )
}
