import type { StatoNave } from './racconto'
import './Navi.css'

/**
 * Le cinque navi di una flotta, ognuna con le sue caselle: quanto e' lunga si
 * vede prima ancora di leggerne il nome, come sul foglio del gioco su carta.
 *
 * Per l'avversario le caselle restano vuote finché la nave non affonda —
 * quale nave si e' colpita non si sa, lo dice solo l'affondamento. Per le
 * proprie navi ogni casella dice come sta: intera, colpita, a fondo.
 */
export function Navi({
  navi,
  etichetta,
  colonna = false,
  mini = false,
}: {
  navi: readonly StatoNave[]
  etichetta: string
  /** Una sotto l'altra, accanto al mare piccolo; altrimenti in fila sotto il mare. */
  colonna?: boolean
  /** Solo le caselle, senza nomi: la riga del mare ripiegato. */
  mini?: boolean
}) {
  return (
    <ul className={`navi${colonna ? ' navi--colonna' : ''}${mini ? ' navi--mini' : ''}`} aria-label={etichetta}>
      {navi.map((n) => (
        <li key={n.tipo.id} className={`navi__nave${n.affondata ? ' is-affondata' : ''}`}>
          <span className="navi__scafo" aria-hidden="true">
            {n.pezzi.map((p, i) => (
              <span key={i} className={`navi__pezzo is-${p}`} />
            ))}
          </span>
          {!mini && <span className="navi__nome">{n.tipo.nome}</span>}
          <span className="u-visually-hidden">
            {mini ? n.tipo.nome : ''}, {n.tipo.lunghezza} caselle
            {n.affondata ? ', affondata' : n.pezzi.includes('colpito') ? ', colpita' : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
