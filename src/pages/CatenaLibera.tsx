import { useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaCatena } from '@/games/catena/ComeSiGioca'
import { PartitaCatena } from '@/games/catena/Partita'
import { useCatenaLibera } from '@/games/catena/useCatenaLibera'

/**
 * La Catena libera: una a caso, quante se ne vuole. Non c'e' niente da
 * scegliere prima, quindi parte subito, come la Ghigliottina libera. Tutto nel
 * telefono, e non conta per la classifica.
 */
export default function CatenaLibera() {
  const g = useCatenaLibera()
  const [regole, setRegole] = useState(false)
  const v = g.vista
  const festa = useFesta(v ? !v.finita : null, v?.indovinata === true, 2_600)

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
      titolo="Catena"
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
          titolo="Le catene non sono arrivate"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={() => void g.comincia()}>
              Riprova
            </Button>
          }
        />
      ) : !v ? (
        <div className="cat-attesa" aria-hidden="true" />
      ) : (
        <PartitaCatena
          key={g.numero}
          vista={v}
          comandi={g.comandi}
          fine={
            <>
              <div className="cat-totale">
                <p className="cat-totale__valore u-tabnum">{v.punti} punti</p>
                <p className="cat-totale__dettaglio u-tabnum">
                  {g.conti.indovinate} indovinate su {g.conti.partite} · non conta per la classifica
                </p>
              </div>
              <div className="cat-link">
                <button type="button" className="cat-link__voce" onClick={() => void g.comincia()}>
                  <IconRefresh size={18} />
                  Un’altra
                </button>
              </div>
            </>
          }
        />
      )}
      <ComeSiGiocaCatena open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}
