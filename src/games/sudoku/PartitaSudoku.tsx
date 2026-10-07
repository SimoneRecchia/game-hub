import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { FoglioAiuti, VoceAiuto } from '@/components/Aiuti'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconClock } from '@/components/Icons'
import { formatCronometro, inPunti } from '@/lib/format'
import { suona } from '@/lib/suoni'
import { NOMI_LIVELLI, VUOTA } from '@shared/sudoku'
import { adesivoControllo, adesivoRisolto } from './adesivi'
import { Griglia } from './Griglia'
import { Tastierino } from './Tastierino'
import type { SudokuInCorso } from './tipi'
import './Sudoku.css'

/**
 * La partita, uguale per la classificata e per la libera: in cima il tempo, il
 * livello e quanto manca; poi la griglia, che prende lo spazio che resta; sotto
 * gli strumenti e le cifre. A partita finita il tastierino lascia il posto a
 * `fine`, che dice com'e' andata.
 */
export function PartitaSudoku({ p, fine, dettaglioRisolto }: { p: SudokuInCorso; fine: ReactNode; dettaglioRisolto: string }) {
  const e = p.editor
  const [aiuti, setAiuti] = useState(false)
  const dati = p.dati ?? VUOTA.repeat(81)
  const vuote = useMemo(() => [...dati].filter((d) => d === VUOTA).length, [dati])
  const scritte = useMemo(() => [...e.cifre].filter((d, k) => d !== VUOTA && dati[k] === VUOTA).length, [e.cifre, dati])

  const scrivi = (d: number) => {
    suona('tocco', { volume: 0.7 })
    e.scrivi(d)
  }

  // La tastiera vera: cifre, frecce, cancella, N per le note, annulla. Con un foglio aperto no.
  const { sposta, cancella, annulla, cambiaModo } = e
  const scriviRef = useRef(scrivi)
  scriviRef.current = scrivi
  useEffect(() => {
    if (!p.dati || p.finita || aiuti) return
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault()
        annulla()
        return
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      const frecce: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }
      if (/^[1-9]$/.test(ev.key)) scriviRef.current(Number(ev.key))
      else if (ev.key === 'Backspace' || ev.key === 'Delete' || ev.key === '0') cancella()
      else if (ev.key.toLowerCase() === 'n') cambiaModo()
      else if (frecce[ev.key]) sposta(...frecce[ev.key])
      else return
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.dati, p.finita, aiuti, sposta, cancella, annulla, cambiaModo])

  // Una riga, una colonna o un riquadro completati suonano come un punto fatto.
  useEffect(() => {
    if (e.completate.size > 0) suona('punto', { volume: 0.8 })
  }, [e.completate])

  // I controlli e lo schema risolto, al centro dello schermo. La festa solo se lo si e' visto in corso.
  const festa = useFesta(p.dati ? !p.finita : null, p.finita)
  const { adesivo, accoda } = useCodaAdesivi()
  const controllo = p.ultimoControllo
  useEffect(() => {
    if (controllo) accoda(adesivoControllo(controllo))
  }, [accoda, controllo])
  const dettaglioRef = useRef(dettaglioRisolto)
  dettaglioRef.current = dettaglioRisolto
  useEffect(() => {
    if (festa) accoda(adesivoRisolto(dettaglioRef.current))
  }, [accoda, festa])

  const aiuto = (fai: () => void) => {
    setAiuti(false)
    fai()
  }
  // Gli aiuti su una casella valgono per quelle da scrivere: non per le date, non per le svelate.
  const k = e.selezione
  const daScrivere = k !== null && dati[k] === VUOTA && !p.svelate.has(k)
  const conCifra = daScrivere && k !== null && e.cifre[k] !== VUOTA

  return (
    <div className="sud">
      <div className="sud__campo">
        {p.dati && (
          <Griglia
            dati={p.dati}
            cifre={e.cifre}
            note={e.note}
            scelta={p.finita ? null : e.selezione}
            svelate={p.svelate}
            segnalate={p.segnalate}
            doppioni={e.doppioni}
            completate={e.completate}
            soluzione={p.finita ? p.soluzione : null}
            onTocca={e.seleziona}
          />
        )}
      </div>

      {/* Sul telefono stato sopra la griglia e tastierino sotto; di lato, tutti e due accanto. */}
      <div className="sud__lato">
        <div className="sud__stato">
          <span className="sud__tempo u-tabnum" aria-label="Tempo di gioco">
            <IconClock size={14} />
            {formatCronometro(p.tempoMs)}
          </span>
          {p.messaggio ? (
            <span key={p.messaggio} className="sud__avviso" aria-live="polite">
              {p.messaggio}
            </span>
          ) : (
            <>
              {p.livello && <span className="sud__livello">{NOMI_LIVELLI[p.livello]}</span>}
              {p.punti !== null && (
                <span className="sud__punti u-tabnum">
                  {p.punti} <span className="sud__punti-label">punti</span>
                </span>
              )}
              <span className="sud__avanzamento u-tabnum" aria-label={`${scritte} caselle scritte su ${vuote}`}>
                <span className="sud__avanzamento-barra" aria-hidden="true">
                  <span style={{ transform: `scaleX(${vuote > 0 ? scritte / vuote : 0})` }} />
                </span>
                {scritte}/{vuote}
              </span>
            </>
          )}
        </div>

        {p.finita ? (
          fine
        ) : (
          <Tastierino
            conteggi={e.conteggi}
            modoNote={e.modoNote}
            puoAnnullare={e.puoAnnullare}
            onCifra={scrivi}
            onCancella={e.cancella}
            onAnnulla={e.annulla}
            onNote={e.cambiaModo}
            onAiuti={() => setAiuti(true)}
          />
        )}
      </div>

      <FoglioAiuti
        open={aiuti}
        onClose={() => setAiuti(false)}
        nota={
          p.punti !== null && (
            <>
              Adesso il sudoku vale <strong>{p.punti} punti</strong>.
            </>
          )
        }
      >
        <VoceAiuto
          nome="Controlla la casella"
          costo={
            p.aiuti ? `${inPunti(p.aiuti.controllo)}, ${p.aiuti.controllo + p.aiuti.errore} se è sbagliata` : undefined
          }
          onClick={() => aiuto(() => p.controlla('casella'))}
          disabled={!conCifra || p.inviando}
        />
        <VoceAiuto
          nome="Controlla tutto lo schema"
          costo={
            p.aiuti ? `${inPunti(p.aiuti.controlloSchema)}, più ${p.aiuti.errore} per cifra sbagliata` : undefined
          }
          onClick={() => aiuto(() => p.controlla('tutto'))}
          disabled={p.inviando}
        />
        <VoceAiuto
          nome="Svela la casella"
          costo={p.aiuti ? inPunti(p.aiuti.svelata) : undefined}
          onClick={() => aiuto(p.svela)}
          disabled={!daScrivere || p.inviando}
        />
      </FoglioAiuti>
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </div>
  )
}
