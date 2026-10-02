import { useEffect, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Vuoto } from '@/components/Elementi'
import { Pagina } from '@/components/Pagina'
import { ApiFetchError, api } from '@/lib/api'
import type { VistaBattaglia } from '@shared/types'
import './Battaglia.css'

/**
 * L'ingresso della battaglia classificata: apre quella di oggi — o ritrova
 * quella già aperta, e' una sola al giorno — e porta al suo indirizzo. Come
 * l'ingresso del cruciverba libero, e' un passaggio: non ci si ferma qui.
 */
export default function BattagliaClassificata() {
  const { vai } = useNavigazione()
  const [errore, setErrore] = useState<string | null>(null)
  const [tentativo, setTentativo] = useState(0)

  useEffect(() => {
    let annullato = false
    api<VistaBattaglia>('/battaglia/classificata', { method: 'POST' })
      .then((v) => {
        if (!annullato) vai(ROTTE.partitaBattaglia(v.id), { replace: true, direzione: 'nessuna' })
      })
      .catch((e) => {
        if (!annullato) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire la battaglia di oggi.')
      })
    return () => {
      annullato = true
    }
  }, [vai, tentativo])

  return (
    <Pagina titolo="Battaglia di oggi" intera indietro={{ a: ROTTE.home, etichetta: 'Arena' }}>
      {errore ? (
        <Vuoto
          titolo="La battaglia non si è aperta"
          testo={errore}
          azione={
            <Button variant="tinted" onClick={() => setTentativo((n) => n + 1)}>
              Riprova
            </Button>
          }
        />
      ) : (
        <div className="bat__attesa" aria-hidden="true" />
      )}
    </Pagina>
  )
}
