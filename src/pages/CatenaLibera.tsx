import { useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaCatena } from '@/games/catena/ComeSiGioca'
import { PartitaCatena } from '@/games/catena/Partita'
import { useCatenaLibera } from '@/games/catena/useCatenaLibera'
import { SceltaFinale } from '@/games/sfide/Scelta'
import type { ImpostazioniFinale } from '@shared/sfide-libere'

/**
 * La Catena libera: una a caso, quante se ne vuole, con il tempo di ogni
 * parola e quello della finale che si scelgono. Tutto nel telefono, e non conta per la classifica. Con un
 * amico la stessa per tutti e due, nella sfida.
 */
export default function CatenaLibera() {
  const g = useCatenaLibera()
  const [regole, setRegole] = useState(false)
  /** Le opzioni dell'ultima partita: "Un'altra" riparte da quelle. */
  const [ultime, setUltime] = useState<ImpostazioniFinale | null>(null)
  const v = g.vista
  const festa = useFesta(v ? !v.finita : null, v?.indovinata === true, 2_600)
  const comincia = (o: ImpostazioniFinale) => {
    setUltime(o)
    void g.comincia({ tempoFinaleMs: o.secondi * 1_000, tempoParolaMs: o.passo * 1_000 })
  }

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )

  if (!v) {
    return (
      <Pagina titolo="Catena" indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
        <SceltaFinale
          gioco="catena"
          titoloPasso="Tempo per parola"
          titoloTempo="Tempo per la parola finale"
          onComincia={comincia}
        >
          {g.errore && <p className="sfl-errore">{g.errore}</p>}
        </SceltaFinale>
        <ComeSiGiocaCatena open={regole} onClose={() => setRegole(false)} />
      </Pagina>
    )
  }

  return (
    <Pagina key="partita" titolo="Catena" intera indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
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
              <button type="button" className="cat-link__voce" onClick={() => ultime && comincia(ultime)}>
                <IconRefresh size={18} />
                Un’altra
              </button>
              <button type="button" className="cat-link__voce" onClick={g.ricomincia}>
                Cambia le opzioni
              </button>
            </div>
          </>
        }
      />
      <ComeSiGiocaCatena open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}
