import { useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaGhigliottina } from '@/games/ghigliottina/ComeSiGioca'
import { PartitaGhigliottina } from '@/games/ghigliottina/Partita'
import { useGhigliottinaLibera } from '@/games/ghigliottina/useGhigliottinaLibera'
import { SceltaFinale } from '@/games/sfide/Scelta'
import type { ImpostazioniFinale } from '@shared/sfide-libere'

/**
 * La Ghigliottina libera: una a caso, quante se ne vuole, con il tempo della
 * finale che si sceglie. Tutto nel telefono, e non conta per la classifica.
 * Con un amico la stessa per tutti e due, nella sfida.
 */
export default function GhigliottinaLibera() {
  const g = useGhigliottinaLibera()
  const [regole, setRegole] = useState(false)
  /** Le opzioni dell'ultima partita: "Un'altra" riparte da quelle. */
  const [ultime, setUltime] = useState<ImpostazioniFinale | null>(null)
  const v = g.vista
  const festa = useFesta(v ? !v.finita : null, v?.indovinata === true, 4_300)
  const comincia = (o: ImpostazioniFinale) => {
    setUltime(o)
    void g.comincia({ tempoFinaleMs: o.secondi * 1_000 })
  }

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )

  if (!v) {
    return (
      <Pagina titolo="Ghigliottina" indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
        <SceltaFinale gioco="ghigliottina" titoloTempo="Tempo per la parola vincente" onComincia={comincia}>
          {g.errore && <p className="sfl-errore">{g.errore}</p>}
        </SceltaFinale>
        <ComeSiGiocaGhigliottina open={regole} onClose={() => setRegole(false)} />
      </Pagina>
    )
  }

  return (
    <Pagina key="partita" titolo="Ghigliottina" intera indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
      <PartitaGhigliottina
        key={g.numero}
        vista={v}
        comandi={g.comandi}
        fine={
          <>
            <div className="ghi-totale">
              <p className="ghi-totale__valore u-tabnum">{v.punti} punti</p>
              <p className="ghi-totale__dettaglio u-tabnum">
                {g.conti.indovinate} indovinate su {g.conti.partite} · non conta per la classifica
              </p>
            </div>
            <div className="ghi-azioni">
              <button type="button" className="ghi-link" onClick={() => ultime && comincia(ultime)}>
                <IconRefresh size={18} />
                Un’altra
              </button>
              <button type="button" className="ghi-link" onClick={g.ricomincia}>
                Cambia le opzioni
              </button>
            </div>
          </>
        }
      />
      <ComeSiGiocaGhigliottina open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}
