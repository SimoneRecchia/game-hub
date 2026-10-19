import { useMemo, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Cursore } from '@/components/Cursore'
import { Difficolta } from '@/components/Difficolta'
import { Coriandoli, Sezione, useFesta } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { Opzioni, Scelte } from '@/components/Opzioni'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaAnagrammi } from '@/games/anagrammi/ComeSiGioca'
import { PartitaAnagrammi, Riepilogo, type ComandiAnagrammi } from '@/games/anagrammi/Partita'
import {
  LIVELLI_ANAGRAMMI,
  LUNGHEZZE_LIBERE,
  NOMI_LIVELLI_ANAGRAMMI,
  useAnagrammiLiberi,
} from '@/games/anagrammi/useAnagrammiLiberi'
import { FoglioSfida, InterruttoreContro, useContro, useFoglioSfida, useOpzioniLibera } from '@/games/sfide/Scelta'
import { SECONDI_ANAGRAMMI } from '@shared/sfide-libere'
import '@/games/anagrammi/Anagrammi.css'

/** Le lunghezze di un livello, come si leggono accanto al suo nome: "da 5 a 7 lettere". */
function lettereDi(lunghezze: readonly number[]): string {
  const min = Math.min(...lunghezze)
  const max = Math.max(...lunghezze)
  return min === max ? `${min} lettere` : `da ${min} a ${max} lettere`
}

/**
 * Gli Anagrammi liberi: cinque parole a caso, della lunghezza del livello
 * scelto, con il tempo per parola che si sceglie. Tutto nel telefono, e non
 * conta per la classifica. Con un amico le stesse parole per tutti e due,
 * nella sfida.
 */
export default function AnagrammiLibera() {
  const g = useAnagrammiLiberi()
  const [regole, setRegole] = useState(false)
  const [contro, setContro] = useContro('anagrammi')
  const [opzioni, cambia] = useOpzioniLibera('anagrammi')
  const [sfida, setSfida] = useFoglioSfida()
  const livello = opzioni.livello
  const comincia = (l: typeof livello) => g.comincia(l, { tempoParolaMs: opzioni.secondi * 1_000 })
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
      <Pagina titolo="Anagrammi" gioco="anagrammi" indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
        <InterruttoreContro value={contro} onChange={setContro} />
        <Sezione titolo="Partita">
          <Opzioni>
            <Scelte titolo="Tempo per parola" valore={`${opzioni.secondi} secondi`}>
              <Cursore
                ariaLabel="Tempo per parola"
                valori={SECONDI_ANAGRAMMI}
                valore={opzioni.secondi}
                etichetta={(n) => `${n} s`}
                voce={(n) => `${n} secondi`}
                onChange={(n) => cambia({ secondi: n })}
              />
            </Scelte>
          </Opzioni>
        </Sezione>
        <Difficolta
          livelli={LIVELLI_ANAGRAMMI.map((id) => ({
            id,
            nome: NOMI_LIVELLI_ANAGRAMMI[id],
            valore: lettereDi(LUNGHEZZE_LIBERE[id]),
          }))}
          scelto={livello}
          onScegli={(l) => cambia({ livello: l })}
          onComincia={() => (contro === 'amico' ? setSfida(true) : comincia(livello))}
          colore="var(--anagrammi-1)"
          etichetta={contro === 'amico' ? 'Sfida un amico' : 'Comincia'}
        >
          {g.errore && <p className="ana-piede">{g.errore}</p>}
        </Difficolta>
        <FoglioSfida open={sfida} onClose={() => setSfida(false)} gioco="anagrammi" impostazioni={opzioni} />
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
              <button type="button" className="ana-link" onClick={() => g.livello && comincia(g.livello)}>
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
