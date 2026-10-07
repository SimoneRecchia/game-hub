import { useMemo, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Difficolta, useLivelloScelto } from '@/components/Difficolta'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaAnagrammi } from '@/games/anagrammi/ComeSiGioca'
import { PartitaAnagrammi, Riepilogo, type ComandiAnagrammi } from '@/games/anagrammi/Partita'
import {
  LIVELLI_ANAGRAMMI,
  LUNGHEZZE_LIBERE,
  NOMI_LIVELLI_ANAGRAMMI,
  useAnagrammiLiberi,
} from '@/games/anagrammi/useAnagrammiLiberi'
import '@/games/anagrammi/Anagrammi.css'

/** Le lunghezze di un livello, come si leggono accanto al suo nome: "da 5 a 7 lettere". */
function lettereDi(lunghezze: readonly number[]): string {
  const min = Math.min(...lunghezze)
  const max = Math.max(...lunghezze)
  return min === max ? `${min} lettere` : `da ${min} a ${max} lettere`
}

/**
 * Gli Anagrammi liberi: cinque parole a caso, della lunghezza del livello
 * scelto. Tutto nel telefono, e non conta per la classifica.
 */
export default function AnagrammiLibera() {
  const g = useAnagrammiLiberi()
  const [regole, setRegole] = useState(false)
  const [livello, scegli] = useLivelloScelto('anagrammi', LIVELLI_ANAGRAMMI)
  const comandi: ComandiAnagrammi = useMemo(
    () => ({ apri: g.apri, prova: g.prova, aiuto: g.aiuto, passo: g.passo, scade: g.scade }),
    [g.apri, g.prova, g.aiuto, g.passo, g.scade],
  )
  const v = g.vista
  const tutte = v !== null && v.finita && v.parole.every((p) => p.esito === 'trovata')
  const festa = useFesta(v ? !v.finita : null, tutte)

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )

  if (!v) {
    return (
      <Pagina titolo="Anagrammi" indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
        <Difficolta
          livelli={LIVELLI_ANAGRAMMI.map((id) => ({
            id,
            nome: NOMI_LIVELLI_ANAGRAMMI[id],
            valore: lettereDi(LUNGHEZZE_LIBERE[id]),
          }))}
          scelto={livello}
          onScegli={scegli}
          onComincia={() => g.comincia(livello)}
          colore="var(--anagrammi-1)"
        >
          {g.errore && <p className="ana-piede">{g.errore}</p>}
        </Difficolta>
        <ComeSiGiocaAnagrammi open={regole} onClose={() => setRegole(false)} />
      </Pagina>
    )
  }

  return (
    <Pagina
      key="partita"
      titolo="Anagrammi"
      intera
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={info}
    >
      <PartitaAnagrammi
        vista={v}
        comandi={comandi}
        fine={
          <>
            <div className="ana-totale">
              <p className="ana-totale__valore u-tabnum">{g.punti} punti</p>
              <p className="ana-totale__dettaglio">
                {g.livello ? NOMI_LIVELLI_ANAGRAMMI[g.livello] : ''} · non conta per la classifica
              </p>
            </div>
            <Riepilogo parole={v.parole} />
            <div className="ana-azioni">
              <button type="button" className="ana-link" onClick={() => g.livello && g.comincia(g.livello)}>
                <IconRefresh size={18} />
                Ancora
              </button>
              <button type="button" className="ana-link" onClick={g.ricomincia}>
                Cambia difficoltà
              </button>
            </div>
          </>
        }
      />
      <ComeSiGiocaAnagrammi open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}
