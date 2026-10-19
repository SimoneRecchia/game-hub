import { useEffect, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Difficolta, useLivelloScelto } from '@/components/Difficolta'
import { Riga, Tacche } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaCruciverba } from '@/games/cruciverba/ComeSiGioca'
import { ApiFetchError, api } from '@/lib/api'
import { LIVELLI_CRUCIVERBA, NOMI_LIVELLI_CRUCIVERBA } from '@shared/cruciverba'
import type { CruciverbaLiberaRisposta, CruciverbaState } from '@shared/types'
import './Cruciverba.css'

/**
 * Il cruciverba libero: si sceglie la difficoltà e si apre uno schema di quel
 * livello, mai aperto prima. Lo schema in corso sta in cima, da riprendere.
 */
export default function CruciverbaLibero() {
  const { vai } = useNavigazione()
  const [livello, setLivello] = useLivelloScelto('cruciverba', LIVELLI_CRUCIVERBA)
  const [dati, setDati] = useState<CruciverbaLiberaRisposta | null>(null)
  const [regole, setRegole] = useState(false)
  const [apertura, setApertura] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    let annullato = false
    api<CruciverbaLiberaRisposta>('/cruciverba/libera')
      .then((d) => !annullato && setDati(d))
      .catch(() => {
        // Senza i numeri si sceglie lo stesso: lo schema si chiede a Comincia.
      })
    return () => {
      annullato = true
    }
  }, [])

  const comincia = async () => {
    setApertura(true)
    setErrore(null)
    try {
      const stato = await api<CruciverbaState>('/cruciverba/libera', { method: 'POST', body: { livello } })
      vai(ROTTE.cruciverbaLibero(stato.partitaId))
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire uno schema.')
      setApertura(false)
    }
  }

  const aperta = dati?.partita ?? null
  return (
    <Pagina
      titolo="Cruciverba"
      gioco="cruciverba"
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <Difficolta
        livelli={LIVELLI_CRUCIVERBA.map((id) => ({
          id,
          nome: NOMI_LIVELLI_CRUCIVERBA[id],
          valore: dati && dati.perLivello[id] === 0 ? 'Finiti' : undefined,
        }))}
        scelto={livello}
        onScegli={setLivello}
        onComincia={() => void comincia()}
        occupato={apertura}
        colore="var(--cruciverba-1)"
        di={3}
        sopra={
          aperta && (
            <Riga
              icona={
                <Tacche
                  piene={LIVELLI_CRUCIVERBA.indexOf(aperta.livello ?? 'difficile') + 1}
                  di={3}
                  colore="var(--cruciverba-1)"
                />
              }
              titolo="Riprendi lo schema"
              sotto={NOMI_LIVELLI_CRUCIVERBA[aperta.livello ?? 'difficile']}
              a={ROTTE.cruciverbaLibero(aperta.partitaId)}
            />
          )
        }
      >
        {errore && <p className="cru-guasto">{errore}</p>}
      </Difficolta>
      <ComeSiGiocaCruciverba open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}
