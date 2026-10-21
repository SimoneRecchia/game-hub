import { useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { PUNTATE, coloreDi, nomeDi, pagaDi, type PuntateRL } from '@shared/roulette'
import { FicheRL } from './Fiches'
import { SEMPLICI, postoDi, puntataDa } from './panno'
import './Panno.css'

/** Le fiches di un altro giocatore al tavolo: le sue puntate, nel colore del suo posto. */
export interface FicheAltrui {
  id: string
  colore: string
  puntate: PuntateRL
}

const NOMI_SEMPLICI: Record<string, string> = {
  manque: '1–18',
  pari: 'Pari',
  rosso: '',
  nero: '',
  dispari: 'Dispari',
  passe: '19–36',
}

/**
 * Il panno della roulette, in piedi: lo zero in cima, i numeri in tre colonne,
 * le dozzine e le chances semplici a sinistra, le colonne in fondo. Le puntate
 * esterne sono caselle da toccare; le interne si scelgono dal punto toccato
 * nell'area dei numeri (`puntataDa`): mentre il dito preme si accendono i
 * numeri che la puntata copre, e lasciando si posa la fiche. Con la tastiera
 * ogni numero e' un bottone, e Invio ci mette un pieno.
 *
 * A giro lanciato (`numero`) si accendono il numero e le caselle che vincono,
 * il dolly si posa sul numero, le altre fiches scivolano via piano e sopra quelle
 * vinte compare quel che tornano, puntata compresa.
 */
export function Panno({
  mie,
  altrui,
  numero,
  attivo,
  onPosa,
  onAnteprima,
}: {
  mie: PuntateRL
  altrui: readonly FicheAltrui[]
  /** Il numero uscito, quando si mostra l'esito; null mentre si punta. */
  numero: number | null
  /** Si possono posare fiches. */
  attivo: boolean
  /** Una fiche sulla puntata `chiave`, toccata nel punto `x`, `y` dello schermo. */
  onPosa: (chiave: string, x: number, y: number) => void
  /** La puntata sotto il dito, o null: chi usa il panno la dice dove c'e' posto. */
  onAnteprima?: (chiave: string | null) => void
}) {
  const numeri = useRef<HTMLDivElement>(null)
  const premuto = useRef<number | null>(null)
  const [anteprima, impostaAnteprima] = useState<string | null>(null)
  const setAnteprima = (chiave: string | null) => {
    impostaAnteprima(chiave)
    onAnteprima?.(chiave)
  }

  const coperti = useMemo(() => new Set(anteprima ? PUNTATE.get(anteprima) : []), [anteprima])
  const vincono = useMemo(
    () => new Set(numero === null ? [] : [...PUNTATE.entries()].filter(([, ns]) => ns.includes(numero)).map(([k]) => k)),
    [numero],
  )

  const sotto = (e: PointerEvent<HTMLDivElement>) => {
    const r = numeri.current?.getBoundingClientRect()
    if (!r) return null
    return puntataDa((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
  }
  const giu = (e: PointerEvent<HTMLDivElement>) => {
    if (!attivo || e.button > 0) return
    premuto.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    setAnteprima(sotto(e))
  }
  const muovi = (e: PointerEvent<HTMLDivElement>) => {
    if (!attivo) return
    if (premuto.current === e.pointerId || e.pointerType === 'mouse') setAnteprima(sotto(e))
  }
  const su = (e: PointerEvent<HTMLDivElement>) => {
    if (premuto.current !== e.pointerId) return
    premuto.current = null
    const chiave = sotto(e)
    if (e.pointerType !== 'mouse') setAnteprima(null)
    if (chiave && attivo) onPosa(chiave, e.clientX, e.clientY)
  }
  const via = () => {
    premuto.current = null
    setAnteprima(null)
  }

  const esterna = (chiave: string, contenuto: ReactNode, classe: string, stile: CSSProperties) => (
    <button
      key={chiave}
      type="button"
      className={[
        'rl-casella',
        classe,
        vincono.has(chiave) && 'is-vince',
        anteprima === chiave && 'is-anteprima',
      ]
        .filter(Boolean)
        .join(' ')}
      style={stile}
      disabled={!attivo}
      aria-label={`${nomeDi(chiave)}, paga ${pagaDi(chiave)} a 1`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && attivo && setAnteprima(chiave)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setAnteprima(null)}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onPosa(chiave, e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2)
      }}
    >
      {contenuto}
    </button>
  )

  return (
    <div className={`rl-panno${attivo ? ' is-attivo' : ''}${numero !== null ? ' is-esito' : ''}`}>
      {SEMPLICI.map((chiave, k) =>
        esterna(
          chiave,
          chiave === 'rosso' || chiave === 'nero' ? (
            <span className={`rl-rombo is-${chiave}`} aria-hidden="true" />
          ) : (
            <span className="rl-casella__scritta is-in-piedi">{NOMI_SEMPLICI[chiave]}</span>
          ),
          'rl-casella--semplice',
          { gridColumn: 1, gridRow: `${2 + k * 2} / span 2` },
        ),
      )}
      {[1, 2, 3].map((d) =>
        esterna(
          `dozzina${d}`,
          <span className="rl-casella__scritta is-in-piedi">{d}ª 12</span>,
          'rl-casella--dozzina',
          { gridColumn: 2, gridRow: `${2 + (d - 1) * 4} / span 4` },
        ),
      )}
      {[1, 2, 3].map((c) =>
        esterna(`colonna${c}`, <span className="rl-casella__scritta">2 a 1</span>, 'rl-casella--colonna', {
          gridColumn: 2 + c,
          gridRow: 14,
        }),
      )}

      <div
        className="rl-panno__numeri"
        ref={numeri}
        onPointerDown={giu}
        onPointerMove={muovi}
        onPointerUp={su}
        onPointerCancel={via}
        onPointerLeave={(e) => e.pointerType === 'mouse' && premuto.current === null && setAnteprima(null)}
      >
        {Array.from({ length: 37 }, (_, n) => (
          <button
            key={n}
            type="button"
            tabIndex={attivo ? 0 : -1}
            className={[
              'rl-numero',
              `is-${coloreDi(n)}`,
              n === 0 && 'is-zero',
              numero === n && 'is-uscito',
              coperti.has(n) && 'is-coperto',
            ]
              .filter(Boolean)
              .join(' ')}
            style={n === 0 ? undefined : { gridColumn: ((n - 1) % 3) + 1, gridRow: Math.ceil(n / 3) + 1 }}
            aria-label={`Pieno ${n}, ${coloreDi(n)}`}
            // Il tocco lo legge l'area dei numeri: qui arrivano solo Invio e lo spazio.
            onClick={(e) => {
              if (e.detail !== 0 || !attivo) return
              const r = e.currentTarget.getBoundingClientRect()
              onPosa(String(n), r.left + r.width / 2, r.top + r.height / 2)
            }}
          >
            <span className="rl-numero__cifra">{n}</span>
          </button>
        ))}
      </div>

      <div className="rl-panno__fiches" aria-hidden="true">
        {altrui.map((a, i) =>
          Object.entries(a.puntate).map(([chiave, quanto]) => {
            const p = postoDi(chiave)
            const esito = numero === null ? '' : vincono.has(chiave) ? ' is-vinta' : ' is-via'
            return (
              <FicheRL
                key={`${a.id}:${chiave}`}
                importo={quanto}
                colore={a.colore}
                className={`rl-fiche rl-fiche--altrui${esito}`}
                style={{ '--x': `${p.x}%`, '--y': `${p.y}%`, '--k': i + 1 } as CSSProperties}
              />
            )
          }),
        )}
        {Object.entries(mie).map(([chiave, quanto]) => {
          const p = postoDi(chiave)
          const vinta = numero !== null && vincono.has(chiave)
          const esito = numero === null ? '' : vinta ? ' is-vinta' : ' is-via'
          return (
            <span
              key={chiave}
              className={`rl-fiche rl-fiche--mia${esito}`}
              style={{ '--x': `${p.x}%`, '--y': `${p.y}%` } as CSSProperties}
            >
              <FicheRL importo={quanto} key={quanto} className="rl-fiche__disco" />
              {vinta && <span className="rl-fiche__paga u-tabnum">+{(quanto * (pagaDi(chiave) + 1)).toLocaleString('it-IT')}</span>}
            </span>
          )
        })}
        {anteprima && !mie[anteprima] && (
          <span
            className="rl-fiche rl-fiche--anteprima"
            style={{ '--x': `${postoDi(anteprima).x}%`, '--y': `${postoDi(anteprima).y}%` } as CSSProperties}
          />
        )}
        {numero !== null && (
          <span
            className="rl-dolly"
            key={numero}
            style={{ '--x': `${postoDi(String(numero)).x}%`, '--y': `${postoDi(String(numero)).y}%` } as CSSProperties}
          >
            <span className="rl-dolly__testa" />
            <span className="rl-dolly__base" />
          </span>
        )}
      </div>
    </div>
  )
}
