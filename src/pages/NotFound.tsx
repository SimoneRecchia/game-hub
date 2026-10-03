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
    <Pagina titolo="Non trovata" indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}>
      <Vuoto
        icona={<Marchio lato={64} animato={false} />}
        titolo="Questa pagina non esiste"
        azione={
          <Button variant="tinted" onClick={() => vai(ROTTE.home, { direzione: 'indietro' })}>
            Torna ai giochi
          </Button>
        }
      />
    </Pagina>
  )
}
