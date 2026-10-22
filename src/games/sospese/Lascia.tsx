import { useState } from 'react'
import { Button } from '@/components/Button'
import { IconFlag } from '@/components/Icons'
import { BottoneBarra } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import './Sospese.css'

/**
 * Il foglio che chiede se lasciare una partita: la usano la bandierina nella
 * barra di ogni libera e il biglietto delle Libere. Lasciarla non si disfa,
 * quindi lo si chiede sempre, con il nome di quel che si fa.
 */
export function FoglioLascia({
  open,
  onClose,
  onLascia,
  titolo = 'Lasciare la partita?',
  testo = 'La partita in corso se ne va.',
  conferma = 'Lascia la partita',
}: {
  open: boolean
  onClose: () => void
  onLascia: () => void
  titolo?: string
  testo?: string
  conferma?: string
}) {
  return (
    <Sheet open={open} onClose={onClose} title={titolo}>
      <div className="lascia-foglio">
        {testo && <p className="lascia-foglio__testo">{testo}</p>}
        <Button
          size="lg"
          fullWidth
          variant="destructive"
          onClick={() => {
            onClose()
            onLascia()
          }}
        >
          {conferma}
        </Button>
        <Button size="lg" fullWidth variant="plain" onClick={onClose}>
          Continua a giocare
        </Button>
      </div>
    </Sheet>
  )
}

/** La bandierina nella barra di una libera in corso, con il suo foglio. */
export function BottoneLascia(props: { onLascia: () => void; titolo?: string; testo?: string; conferma?: string }) {
  const [aperto, setAperto] = useState(false)
  return (
    <>
      <BottoneBarra etichetta="Lascia la partita" onClick={() => setAperto(true)}>
        <IconFlag size={19} />
      </BottoneBarra>
      <FoglioLascia open={aperto} onClose={() => setAperto(false)} {...props} />
    </>
  )
}

/**
 * Prima di cominciarne un'altra dello stesso gioco: quella in sospeso si
 * riprende o si lascia. Le libere non si buttano via senza dirlo.
 */
export function FoglioNuova({
  open,
  onClose,
  onRiprendi,
  onNuova,
  testo = 'Quella in corso se ne va.',
}: {
  open: boolean
  onClose: () => void
  onRiprendi: () => void
  onNuova: () => void
  testo?: string
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Una partita nuova?">
      <div className="lascia-foglio">
        <p className="lascia-foglio__testo">{testo}</p>
        <Button
          size="lg"
          fullWidth
          onClick={() => {
            onClose()
            onRiprendi()
          }}
        >
          Riprendi quella in corso
        </Button>
        <Button
          size="lg"
          fullWidth
          variant="tinted"
          onClick={() => {
            onClose()
            onNuova()
          }}
        >
          Comincia la nuova
        </Button>
      </div>
    </Sheet>
  )
}
