import { useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaGhigliottina } from '@/games/ghigliottina/ComeSiGioca'
import { PartitaGhigliottina } from '@/games/ghigliottina/Partita'
import { useGhigliottinaLibera } from '@/games/ghigliottina/useGhigliottinaLibera'

/**
 * La Ghigliottina libera: una a caso, quante se ne vuole. Non c'e' niente da
 * scegliere prima, quindi parte subito, come il Wordle libero. Tutto nel
 * telefono, e non conta per la classifica.
 */
export default function GhigliottinaLibera() {
  const g = useGhigliottinaLibera()
  const [regole, setRegole] = useState(false)
  const v = g.vista
  const festa = useFesta(v ? !v.finita : null, v?.indovinata === true, 4_300)

  // Una volta sola: in sviluppo React monta due volte, e due partite di fila si conterebbero.
  const partita = useRef(false)
  const { comincia } = g
  useEffect(() => {
    if (partita.current) return
    partita.current = true
    void comincia()
  }, [comincia])

  return (
    <Pagina
      titolo="Ghigliottina"
      intera
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {g.errore && !v ? (
        <Vuoto
          titolo="Le ghigliottine non sono arrivate"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={() => void g.comincia()}>
              Riprova
            </Button>
          }
        />
      ) : !v ? (
        <div className="ghi-attesa" aria-hidden="true" />
      ) : (
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
                <button type="button" className="ghi-link" onClick={() => void g.comincia()}>
                  <IconRefresh size={18} />
                  Un’altra
                </button>
              </div>
            </>
          }
        />
      )}
      <ComeSiGiocaGhigliottina open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}
