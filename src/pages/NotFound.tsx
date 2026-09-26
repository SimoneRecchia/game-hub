import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Vuoto } from '@/components/Elementi'
import { Marchio } from '@/components/Marchio'
import { Pagina } from '@/components/Pagina'

/** Un indirizzo che non porta da nessuna parte: si torna ai giochi. */
export default function NotFound() {
  const { vai } = useNavigazione()
  return (
    <Pagina titolo="Non trovata" indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}>
      <Vuoto
        icona={<Marchio lato={64} animato={false} />}
        titolo="Questa pagina non esiste"
        testo="Forse il link è vecchio, o l’indirizzo ha un errore di battitura."
        azione={
          <Button variant="tinted" onClick={() => vai(ROTTE.home, { direzione: 'indietro' })}>
            Torna ai giochi
          </Button>
        }
      />
    </Pagina>
  )
}
