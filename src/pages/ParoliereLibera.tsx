import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ROTTE } from '@/app/rotte'
import { Cursore } from '@/components/Cursore'
import { Difficolta } from '@/components/Difficolta'
import { Riga, Sezione } from '@/components/Elementi'
import { IconInfo, IconPlay, IconRefresh } from '@/components/Icons'
import { Opzioni, Scelte } from '@/components/Opzioni'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaParoliere } from '@/games/paroliere/ComeSiGioca'
import { PartitaParoliere } from '@/games/paroliere/Partita'
import { LATI_LIBERI, useParoliereLibero, type LatoLibero } from '@/games/paroliere/useParoliereLibero'
import { preparaComputer } from '@/games/scarabeo/computer'
import { BottoneLascia, FoglioNuova } from '@/games/sospese/Lascia'
import { useSospesa } from '@/games/sospese/registro'
import { FoglioSfida, InterruttoreContro, useContro, useFoglioSfida, useOpzioniLibera } from '@/games/sfide/Scelta'
import { formatNumber } from '@/lib/format'
import { MINUTI_PAROLIERE, type LatoLibero as Lato } from '@shared/sfide-libere'
import '@/games/paroliere/Paroliere.css'

const NOMI: Record<LatoLibero, string> = { 4: 'Quattro per quattro', 5: 'Cinque per cinque' }

const minuti = (n: number) => (n === 1 ? 'Un minuto' : `${n} minuti`)

/**
 * Il Paroliere libero: una griglia a caso, di sedici o di venticinque dadi,
 * con il tempo che si sceglie. Tutto nel telefono, e non conta per la
 * classifica. Con un amico la stessa griglia per tutti e due, nella sfida.
 * Una partita lasciata a meta' resta in sospeso: si riprende da qui, o dalle
 * Libere, che la aprono con `?riprendi`.
 */
export default function ParoliereLibera() {
  const [query] = useSearchParams()
  const g = useParoliereLibero({ salva: true, riprendi: query.has('riprendi') })
  const sospesa = useSospesa('paroliere')
  const [nuova, setNuova] = useState(false)
  const [regole, setRegole] = useState(false)
  const [contro, setContro] = useContro('paroliere')
  const [opzioni, cambia] = useOpzioniLibera('paroliere')
  const [sfida, setSfida] = useFoglioSfida()
  const lato = String(opzioni.lato) as LatoLibero
  const comincia = (l: LatoLibero) => g.comincia(l, { tempoMs: opzioni.minuti * 60_000 })
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
      <Pagina titolo="Paroliere" gioco="paroliere" indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
        <InterruttoreContro value={contro} onChange={setContro} />
        <Sezione titolo="Partita">
          <Opzioni>
            <Scelte titolo="Tempo" valore={minuti(opzioni.minuti)}>
              <Cursore
                ariaLabel="Tempo"
                valori={MINUTI_PAROLIERE}
                valore={opzioni.minuti}
                etichetta={(n) => `${n} min`}
                voce={(n) => minuti(n).toLowerCase()}
                onChange={(n) => cambia({ minuti: n })}
              />
            </Scelte>
          </Opzioni>
        </Sezione>
        <Difficolta
          livelli={LATI_LIBERI.map((id) => ({
            id,
            nome: NOMI[id],
            valore: g.conti.migliore[id] > 0 ? `record ${formatNumber(g.conti.migliore[id])}` : undefined,
          }))}
          scelto={lato}
          onScegli={(l) => cambia({ lato: Number(l) as Lato })}
          onComincia={() => (contro === 'amico' ? setSfida(true) : sospesa ? setNuova(true) : comincia(lato))}
          colore="var(--paroliere-1)"
          etichetta={contro === 'amico' ? 'Sfida un amico' : 'Comincia'}
          sopra={
            sospesa &&
            contro !== 'amico' && (
              <Riga
                icona={<IconPlay size={18} />}
                titolo="Riprendi la partita"
                sotto={sospesa.dettaglio}
                onClick={g.riprendi}
              />
            )
          }
        />
        <FoglioSfida open={sfida} onClose={() => setSfida(false)} gioco="paroliere" impostazioni={opzioni} />
        <FoglioNuova
          open={nuova}
          onClose={() => setNuova(false)}
          onRiprendi={g.riprendi}
          onNuova={() => comincia(lato)}
        />
        <ComeSiGiocaParoliere open={regole} onClose={() => setRegole(false)} />
      </Pagina>
    )
  }

  const record = g.lato ? g.conti.migliore[g.lato] : 0
  return (
    <Pagina
      key="partita"
      titolo="Paroliere"
      sotto="Libera"
      intera
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={
        <>
          {info}
          {v.fase !== 'finita' && <BottoneLascia onLascia={g.lascia} />}
        </>
      }
    >
      <PartitaParoliere
        key={g.numero}
        vista={v}
        comandi={g.comandi}
        subito
        punti={String(v.punteggio)}
        fine={
          <>
            {(record > 0 || v.punteggio > 0) && (
              <p className="par-piede-fine u-tabnum">
                {v.punteggio > 0 && v.punteggio >= record ? 'Il tuo record!' : `Il tuo record: ${record}`}
              </p>
            )}
            <div className="par-fila-tasti">
              <button type="button" className="par-tasto par-tasto--carta" onClick={g.ricomincia}>
                Esci
              </button>
              <button
                type="button"
                className="par-tasto par-tasto--verde"
                onClick={() => g.lato && comincia(String(g.lato) as LatoLibero)}
              >
                <IconRefresh size={18} />
                Gioca ancora
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
