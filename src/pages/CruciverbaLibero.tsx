import { useEffect, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Vuoto } from '@/components/Elementi'
import { IconShuffle } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { ApiFetchError, api } from '@/lib/api'
import type { CruciverbaLiberaRisposta, CruciverbaState } from '@shared/types'
import './Cruciverba.css'

/**
 * L'ingresso del cruciverba libero: riapre lo schema in corso, o ne apre uno
 * nuovo, e porta al suo indirizzo. Non si ferma qui: e' un passaggio.
 */
export default function CruciverbaLibero() {
  const { vai } = useNavigazione()
  const [errore, setErrore] = useState<string | null>(null)
  const [tentativo, setTentativo] = useState(0)

  useEffect(() => {
    let annullato = false
    void (async () => {
      try {
        const { partita } = await api<CruciverbaLiberaRisposta>('/cruciverba/libera')
        const stato = partita ?? (await api<CruciverbaState>('/cruciverba/libera', { method: 'POST' }))
        if (!annullato) vai(ROTTE.cruciverbaLibero(stato.partitaId), { replace: true, direzione: 'nessuna' })
      } catch (e) {
        if (!annullato) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire uno schema.')
      }
    })()
    return () => {
      annullato = true
    }
  }, [vai, tentativo])

  return (
    <Pagina titolo="Schema libero" intera indietro={{ a: ROTTE.salotto, etichetta: 'Salotto' }}>
      {errore ? (
        <Vuoto
          icona={<IconShuffle size={28} />}
          titolo="Nessuno schema da aprire"
          testo={errore}
          azione={
            <Button variant="tinted" onClick={() => setTentativo((n) => n + 1)}>
              Riprova
            </Button>
          }
        />
      ) : (
        <div className="cru__attesa" aria-hidden="true" />
      )}
    </Pagina>
  )
}
