import { daFen } from '@shared/scacchi'
import type { Parte } from '@shared/tavolo'
import { immaginePezzo } from './pezzi'

type Tipo = 'q' | 'r' | 'b' | 'n' | 'p'

const INIZIO: Record<Tipo, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 }
const VALORE: Record<Tipo, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 }
const TIPI: readonly Tipo[] = ['q', 'r', 'b', 'n', 'p']

/**
 * Nella riga di un giocatore, i pezzi che ha preso, dal piu' pesante, e quanto
 * e' avanti di materiale ("+3"), come sulle scacchiere delle app. Null finché
 * non ha preso niente: la riga dice allora il colore.
 */
export function presiDi(posizione: string, parte: Parte) {
  const p = daFen(posizione)
  if (!p) return null
  const conta = { w: { q: 0, r: 0, b: 0, n: 0, p: 0 }, b: { q: 0, r: 0, b: 0, n: 0, p: 0 } }
  for (const x of p.caselle) if (x && x.tipo !== 'k') conta[x.colore][x.tipo as Tipo] += 1
  const mio = parte === 0 ? 'w' : 'b'
  const suo = parte === 0 ? 'b' : 'w'
  // Un pedone promosso conta come il pezzo che e' diventato: i presi non vanno mai sotto zero.
  const presi = TIPI.map((t) => ({ tipo: t, n: Math.max(0, INIZIO[t] - conta[suo][t]) })).filter((x) => x.n > 0)
  const materiale = (c: 'w' | 'b') => TIPI.reduce((s, t) => s + VALORE[t] * conta[c][t], 0)
  const vantaggio = materiale(mio) - materiale(suo)
  if (presi.length === 0 && vantaggio <= 0) return null
  return (
    <span className="scc-presi">
      <span className="u-visually-hidden">Ha preso {presi.reduce((s, x) => s + x.n, 0)} pezzi</span>
      {presi.map((x) => (
        <span key={x.tipo} className="scc-presi__pezzo" aria-hidden="true">
          <img src={immaginePezzo(suo, x.tipo)} alt="" draggable={false} />
          {x.n > 1 && <span className="u-tabnum">{x.n}</span>}
        </span>
      ))}
      {vantaggio > 0 && <span className="scc-presi__vantaggio u-tabnum">+{vantaggio}</span>}
    </span>
  )
}
