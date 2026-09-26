/**
 * I pezzi piccoli con cui sono fatte le schermate: sezioni, righe d'elenco,
 * anelli di avanzamento, numeri che contano, stati vuoti, coriandoli.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Collegamento } from '@/app/navigazione'
import { IconChevronRight } from './Icons'
import './Elementi.css'

/* ─────────────────────────────  Sezione  ───────────────────────────── */

export function Sezione({
  titolo,
  azione,
  nota,
  children,
  className = '',
}: {
  titolo?: string
  /** A destra del titolo: "Vedi tutto", di solito un link. */
  azione?: ReactNode
  nota?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`sezione ${className}`}>
      {(titolo || azione) && (
        <div className="sezione__testa">
          {titolo && <h2 className="sezione__titolo">{titolo}</h2>}
          {azione && <div className="sezione__azione">{azione}</div>}
        </div>
      )}
      {children}
      {nota && <p className="sezione__nota">{nota}</p>}
    </section>
  )
}

/* ─────────────────────────  Elenco a righe  ───────────────────────── */

/** Un elenco raggruppato in stile iOS: righe dentro una card, separate da un filo. */
export function Elenco({ children }: { children: ReactNode }) {
  return <div className="elenco">{children}</div>
}

interface PropsRiga {
  icona?: ReactNode
  titolo: ReactNode
  sotto?: ReactNode
  /** A destra: un valore, un interruttore, un'etichetta. */
  valore?: ReactNode
  a?: string
  onClick?: () => void
  distruttiva?: boolean
}

export function Riga({ icona, titolo, sotto, valore, a, onClick, distruttiva = false }: PropsRiga) {
  const corpo = (
    <>
      {icona && <span className="riga__icona">{icona}</span>}
      <span className="riga__testo">
        <span className="riga__titolo">{titolo}</span>
        {sotto && <span className="riga__sotto">{sotto}</span>}
      </span>
      {valore !== undefined && <span className="riga__valore">{valore}</span>}
      {(a || onClick) && <IconChevronRight size={18} className="riga__freccia" />}
    </>
  )
  const classe = `riga${a || onClick ? ' riga--tocca' : ''}${distruttiva ? ' riga--distruttiva' : ''}`
  if (a) {
    return (
      <Collegamento to={a} className={classe}>
        {corpo}
      </Collegamento>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={classe} onClick={onClick}>
        {corpo}
      </button>
    )
  }
  return <div className={classe}>{corpo}</div>
}

/* ─────────────────────────  Anello di avanzamento  ───────────────────────── */

/**
 * Un anello che si riempie, come quelli di Fitness: a colpo d'occhio a che
 * punto e' una partita, senza leggere un numero.
 */
export function Anello({
  valore,
  dimensione = 44,
  spessore = 5,
  colore = 'var(--brand)',
  children,
}: {
  /** Da 0 a 1. */
  valore: number
  dimensione?: number
  spessore?: number
  colore?: string
  children?: ReactNode
}) {
  const r = (dimensione - spessore) / 2
  const giro = 2 * Math.PI * r
  const pieno = Math.min(Math.max(valore, 0), 1)
  return (
    <span className="anello" style={{ width: dimensione, height: dimensione }}>
      <svg width={dimensione} height={dimensione} viewBox={`0 0 ${dimensione} ${dimensione}`} aria-hidden="true">
        <circle
          cx={dimensione / 2}
          cy={dimensione / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.16}
          strokeWidth={spessore}
        />
        <circle
          className="anello__pieno"
          cx={dimensione / 2}
          cy={dimensione / 2}
          r={r}
          fill="none"
          stroke={colore}
          strokeWidth={spessore}
          strokeLinecap="round"
          strokeDasharray={giro}
          strokeDashoffset={giro * (1 - pieno)}
          transform={`rotate(-90 ${dimensione / 2} ${dimensione / 2})`}
          style={{ opacity: pieno > 0 ? 1 : 0 }}
        />
      </svg>
      {children && <span className="anello__dentro">{children}</span>}
    </span>
  )
}

/* ─────────────────────────  Un numero che conta  ───────────────────────── */

/**
 * Un numero che arriva contando, invece di comparire.
 *
 * Conta solo la prima volta e quando cambia; con il movimento ridotto compare
 * e basta. La durata cresce poco col valore: un 12 e un 312 arrivano quasi
 * insieme.
 */
export function Numero({ valore, durata = 700 }: { valore: number; durata?: number }) {
  const [mostrato, setMostrato] = useState(valore)
  const precedente = useRef(0)

  useEffect(() => {
    const da = precedente.current
    precedente.current = valore
    if (da === valore || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMostrato(valore)
      return
    }
    const inizio = performance.now()
    let fotogramma = 0
    const passo = (adesso: number) => {
      const t = Math.min(1, (adesso - inizio) / durata)
      // Rallenta arrivando: la stessa curva di un oggetto che si posa.
      const curva = 1 - Math.pow(1 - t, 3)
      setMostrato(Math.round(da + (valore - da) * curva))
      if (t < 1) fotogramma = requestAnimationFrame(passo)
    }
    fotogramma = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(fotogramma)
  }, [valore, durata])

  return <span className="u-tabnum">{mostrato.toLocaleString('it-IT')}</span>
}

/* ─────────────────────────  Stato vuoto, o errore  ───────────────────────── */

export function Vuoto({
  icona,
  titolo,
  testo,
  azione,
}: {
  icona?: ReactNode
  titolo: string
  testo?: ReactNode
  azione?: ReactNode
}) {
  return (
    <div className="vuoto">
      {icona && <span className="vuoto__icona">{icona}</span>}
      <p className="vuoto__titolo">{titolo}</p>
      {testo && <p className="vuoto__testo">{testo}</p>}
      {azione}
    </div>
  )
}

/* ─────────────────────────  Etichetta  ───────────────────────── */

export function Etichetta({
  tono = 'neutro',
  children,
}: {
  tono?: 'neutro' | 'brand' | 'verde' | 'arancio' | 'rosso'
  children: ReactNode
}) {
  return <span className={`etichetta etichetta--${tono}`}>{children}</span>
}

/* ─────────────────────────  Coriandoli  ───────────────────────── */

const COLORI_CORIANDOLI = ['#7b6cff', '#34c759', '#f7b23b', '#4d8df7', '#ff5e7e', '#23a6c9']

/**
 * Una manciata di coriandoli, per le vittorie.
 *
 * Pochi e brevi: una festa di un secondo, non un salvaschermo. Sono elementi
 * CSS e non un canvas, quindi non costano niente quando non ci sono, e con il
 * movimento ridotto non compaiono affatto.
 */
export function Coriandoli({ quanti = 36 }: { quanti?: number }) {
  const [pezzi] = useState(() =>
    Array.from({ length: quanti }, (_, i) => ({
      x: (Math.random() - 0.5) * 2,
      giro: Math.random() * 720 - 360,
      ritardo: Math.random() * 140,
      colore: COLORI_CORIANDOLI[i % COLORI_CORIANDOLI.length],
      largo: Math.random() > 0.5,
    })),
  )
  return (
    <div className="coriandoli" aria-hidden="true">
      {pezzi.map((p, i) => (
        <span
          key={i}
          className={`coriandoli__pezzo${p.largo ? ' is-largo' : ''}`}
          style={
            {
              '--x': p.x,
              '--giro': `${p.giro}deg`,
              '--ritardo': `${p.ritardo}ms`,
              background: p.colore,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

/* ─────────────────────────  Tacche di livello  ───────────────────────── */

/**
 * Tre tacche, come il segnale del telefono: quante sono piene dice quanto e'
 * forte il computer. Si legge senza leggere, ed e' la stessa in tutti i giochi.
 */
export function Tacche({ piene, colore = 'var(--brand)' }: { piene: number; colore?: string }) {
  return (
    <span className="tacche" aria-hidden="true" style={{ '--tacche-colore': colore } as CSSProperties}>
      {[1, 2, 3].map((t) => (
        <span key={t} className={`tacche__tacca${t <= piene ? ' is-piena' : ''}`} />
      ))}
    </span>
  )
}
