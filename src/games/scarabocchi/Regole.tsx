import { Sheet } from '@/components/Sheet'
import { GIOCATORI_MASSIMI_SCARABOCCHI } from '@shared/scarabocchi'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole di Scarabocchi, il minimo per giocare: le due modalita'. */
export function ComeSiGiocaScarabocchi({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Si disegna e si indovina, con gli amici, ognuno dal suo telefono: fino a {GIOCATORI_MASSIMI_SCARABOCCHI} in
          una stanza. Chi la apre sceglie come si gioca.
        </p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Indovina il disegno</h3>
          <ul className="cru-aiuto__elenco">
            <li>A turno uno sceglie una parola fra tre e la disegna; gli altri scrivono che cosa vedono.</li>
            <li>Chi indovina prima prende di più; chi disegna prende la media di quel che hanno preso gli altri.</li>
            <li>Col passare del tempo qualche lettera della parola si vede.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Telefono senza fili</h3>
          <ul className="cru-aiuto__elenco">
            <li>Ognuno scrive una situazione da disegnare.</li>
            <li>
              Poi i fogli girano: chi riceve una frase la disegna, chi riceve un disegno scrive che cosa ci vede, e così
              via. Nessuno lavora due volte sullo stesso foglio.
            </li>
            <li>Alla fine l’album mostra come è cambiata ogni storia. Non ci sono punti.</li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
