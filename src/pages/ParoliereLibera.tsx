import { useEffect, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Difficolta, useLivelloScelto } from '@/components/Difficolta'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaParoliere } from '@/games/paroliere/ComeSiGioca'
import { PartitaParoliere } from '@/games/paroliere/Partita'
import { LATI_LIBERI, useParoliereLibero, type LatoLibero } from '@/games/paroliere/useParoliereLibero'
import { preparaComputer } from '@/games/scarabeo/computer'
import { formatNumber } from '@/lib/format'
import '@/games/paroliere/Paroliere.css'

const NOMI: Record<LatoLibero, string> = { 4: 'Quattro per quattro', 5: 'Cinque per cinque' }

/**
 * Il Paroliere libero: una griglia a caso, di sedici o di venticinque dadi.
 * Tutto nel telefono, e non conta per la classifica.
 */
export default function ParoliereLibera() {
  const g = useParoliereLibero()
  const [regole, setRegole] = useState(false)
  const [lato, scegli] = useLivelloScelto('paroliere', LATI_LIBERI)
  const v = g.vista

  // Il dizionario si scarica mentre si sceglie: la prima griglia non lo aspetta.
  useEffect(() => {
    void preparaComputer().catch(() => {})
  }, [])

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )

  if (!v) {
    return (
      <Pagina titolo="Paroliere" indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
        <Difficolta
          livelli={LATI_LIBERI.map((id) => ({
            id,
            nome: NOMI[id],
            valore: g.conti.migliore[id] > 0 ? `record ${formatNumber(g.conti.migliore[id])}` : undefined,
          }))}
          scelto={lato}
          onScegli={scegli}
          onComincia={() => g.comincia(lato)}
          colore="var(--paroliere-1)"
        />
        <ComeSiGiocaParoliere open={regole} onClose={() => setRegole(false)} />
      </Pagina>
    )
  }

  const record = g.lato ? g.conti.migliore[g.lato] : 0
  return (
    <Pagina key="partita" titolo="Paroliere" intera indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
      <PartitaParoliere
        key={g.numero}
        vista={v}
        comandi={g.comandi}
        subito
        fine={
          <>
            <div className="par-totale">
              <p className="par-totale__valore u-tabnum">{v.punteggio} punti</p>
              <p className="par-totale__dettaglio u-tabnum">
                {v.punteggio > 0 && v.punteggio >= record ? 'Il tuo record' : `Record ${record}`} · non conta per la
                classifica
              </p>
            </div>
            <div className="par-azioni">
              <button type="button" className="par-link" onClick={() => g.lato && g.comincia(String(g.lato) as LatoLibero)}>
                <IconRefresh size={18} />
                Un’altra
              </button>
              <button type="button" className="par-link" onClick={g.ricomincia}>
                Cambia griglia
              </button>
            </div>
          </>
        }
      />
      {g.errore && <p className="par-errore">{g.errore}</p>}
      <ComeSiGiocaParoliere open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}
