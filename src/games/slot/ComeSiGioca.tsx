import { useMemo } from 'react'
import { Sheet } from '@/components/Sheet'
import { NOMI_CATEGORIE, type CategoriaQuiz } from '@shared/quiz'
import {
  CILIEGIE,
  NOMI_SIMBOLI,
  PREMI,
  PUNTATA_MASSIMA_SLOT,
  PUNTATA_MINIMA_SLOT,
  VINCITA_DOMANDA,
  contaSlot,
  type CodiceSlot,
} from '@shared/slot'
import { Simbolo } from './simboli'
import '@/games/cruciverba/ComeSiGioca.css'

const TRIPLE: Array<[CodiceSlot, number]> = (['7', 'R', 'B', 'P', 'O', 'L'] as const).map((s) => [s, PREMI[s]])

export function ComeSiGiocaSlot({
  open,
  onClose,
  categorie,
}: {
  open: boolean
  onClose: () => void
  categorie: readonly CategoriaQuiz[]
}) {
  // Quanto restituisce ogni cento punti a chi risponde sempre giusto, e ogni quanti giri si vince: i conti esatti
  // sono 27.000 combinazioni, e si fanno quando le regole si aprono.
  const conto = useMemo(() => (open ? contaSlot(1) : null), [open])
  const resa = conto ? Math.round(conto.resa * 100) : null
  const unaOgni = conto ? Math.round(1 / conto.frequenza) : null
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto slot-regole">
        <p className="cru-aiuto__lede">
          Scegli la puntata, da {PUNTATA_MINIMA_SLOT} a {PUNTATA_MASSIMA_SLOT} punti, e tira la leva. La puntata la
          paghi subito; paga la linea di mezzo, e la vincita è la puntata per il premio.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Tre uguali sulla linea</h3>
          <ul className="slot-regole__premi">
            {TRIPLE.map(([s, x]) => (
              <li key={s} className="slot-regole__premio">
                <span
                  className="slot-regole__simboli"
                  aria-label={`Tre ${NOMI_SIMBOLI[s as keyof typeof NOMI_SIMBOLI]}`}
                >
                  {[0, 1, 2].map((i) => (
                    <Simbolo key={i} codice={s} categorie={categorie} />
                  ))}
                </span>
                <strong className="u-tabnum">×{x}</strong>
              </li>
            ))}
            {[3, 2, 1].map((n) => (
              <li key={`c${n}`} className="slot-regole__premio">
                <span className="slot-regole__simboli" aria-label={`${n} ciliegie da sinistra`}>
                  {Array.from({ length: n }, (_, i) => (
                    <Simbolo key={i} codice="C" categorie={categorie} />
                  ))}
                </span>
                <strong className="u-tabnum">×{CILIEGIE[n]}</strong>
              </li>
            ))}
          </ul>
          <p className="cru-aiuto__testo">Le ciliegie contano da sinistra, anche una sola.</p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La domanda</h3>
          <p className="cru-aiuto__testo">
            Tre simboli della stessa categoria, uno per rullo, anche non in fila: rispondi a una domanda, e giusta
            vinci {VINCITA_DOMANDA} volte la puntata. Oggi: {categorie.map((c) => NOMI_CATEGORIE[c]).join(', ')}.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Vince il banco</h3>
          <p className="cru-aiuto__testo">
            Si vince una volta ogni {unaOgni} giri circa, quasi sempre poco. A chi risponde sempre giusto la slot
            restituisce in media il {resa}% di quel che punta, come gli altri giochi della Fortuna.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
