import { useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, Elenco, Riga, Sezione, Tacche, useFesta } from '@/components/Elementi'
import { IconComputer, IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Pillola, Scheda } from '@/components/Scheda'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ComeSiGiocaNomi } from '@/games/nomi/ComeSiGioca'
import { leggiContiNomi } from '@/games/nomi/conti'
import { FoglioDaScrivere, FoglioScritto, Lettera, type RigaScritta } from '@/games/nomi/Foglio'
import { LIVELLI_NOMI, NOMI_LIVELLI_NOMI, altrePossibili } from '@/games/nomi/libera'
import { Matita } from '@/games/nomi/Matita'
import { useNomiLibera, type NomiLibera } from '@/games/nomi/useNomiLibera'
import { SalaAmico } from '@/games/nomi/sfida/SalaAmico'
import { CATEGORIE_NOMI, TEMPO_NOMI_MS } from '@shared/nomi-cose'
import '@/games/nomi/NomiCose.css'

const COLORE = 'linear-gradient(135deg, var(--nomi-1), var(--nomi-2))'

type Contro = 'computer' | 'amico'
const CHIAVE_CONTRO = 'giochi.nomi.contro'

function leggiContro(): Contro {
  try {
    return localStorage.getItem(CHIAVE_CONTRO) === 'amico' ? 'amico' : 'computer'
  } catch {
    return 'computer'
  }
}

/**
 * Nomi, cose e città libera, contro il computer o contro un amico, come le
 * sale dei tavolieri: un interruttore in cima, ricordato. Contro il computer
 * si sceglie la difficoltà e si comincia, con una lettera a caso; il computer
 * scrive anche lui, e quando ha finito dice stop: da li' non si scrive piu',
 * come al tavolo. Con un amico si manda la sfida, e si gioca nella sua pagina.
 */
export default function NomiCoseLibera() {
  const g = useNomiLibera()
  const [regole, setRegole] = useState(false)
  const [contro, setContro] = useState<Contro>(leggiContro)
  const scegliContro = (c: Contro) => {
    setContro(c)
    try {
      localStorage.setItem(CHIAVE_CONTRO, c)
    } catch {
      /* senza localStorage la scelta non si ricorda */
    }
  }

  // Gli adesivi della fine: lo stop del computer, poi com'e' andata.
  const { adesivo, accoda } = useCodaAdesivi()
  const [vinta, setVinta] = useState(false)
  const raccontata = useRef<unknown>(null)
  useEffect(() => {
    const r = g.risultato
    if (g.fase !== 'fine' || !r || raccontata.current === r) return
    raccontata.current = r
    if (g.stop === 'computer') {
      accoda({
        tono: 'bordato',
        titolo: 'Stop!',
        sotto: 'Il computer ha finito',
        colore: 'var(--nomi-2)',
        durata: 1_500,
        suono: 'scaduto',
      })
    }
    const sotto = `${r.totali[0]} a ${r.totali[1]}`
    const durata = 2_200
    accoda(
      r.esito === 'vinta'
        ? { tono: 'vivace', titolo: 'Hai vinto!', sotto, colore: COLORE, durata, suono: 'vittoria' }
        : r.esito === 'persa'
          ? {
              tono: 'bordato',
              titolo: 'Ha vinto il computer',
              sotto,
              colore: 'var(--nomi-2)',
              durata,
              suono: 'sconfitta',
            }
          : { tono: 'vivace', titolo: 'Pari', sotto, colore: COLORE, durata, suono: 'pareggio' },
    )
    setVinta(r.esito === 'vinta')
  }, [accoda, g.fase, g.risultato, g.stop])
  const festa = useFesta(g.fase === 'gioco' ? true : g.fase === 'fine' ? false : null, vinta)

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )

  if (g.fase === 'scelta') {
    return (
      <Pagina
        key="scelta"
        titolo="Nomi, cose e città"
        indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
        azioni={info}
      >
        <div className="nomi-scelte">
          <SegmentedControl
            ariaLabel="Contro chi"
            value={contro}
            onChange={scegliContro}
            options={[
              { value: 'computer', label: 'Computer' },
              { value: 'amico', label: 'Amico' },
            ]}
          />
        </div>
        {contro === 'computer' ? <SceltaLivello g={g} /> : <SalaAmico />}
        <ComeSiGiocaNomi open={regole} onClose={() => setRegole(false)} />
      </Pagina>
    )
  }

  const p = g.partita
  return (
    <Pagina
      key="partita"
      titolo="Nomi, cose e città"
      intera
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={info}
    >
      {g.fase === 'carica' || !p ? (
        <div className="nomi-attesa" aria-hidden="true" />
      ) : g.fase === 'gioco' ? (
        <div className="nomi-pagina is-in-gioco">
          <header className="nomi-testa">
            <Lettera lettera={p.lettera} />
            <div className="nomi-testa__tempo">
              <p className="nomi-testa__con">Con la {p.lettera.toUpperCase()}</p>
              {g.scadenza !== null && (
                <Matita scadenza={g.scadenza} totaleMs={TEMPO_NOMI_MS} onScaduto={g.tempoFinito} />
              )}
            </div>
          </header>
          <p className="nomi-computer" aria-live="polite">
            <IconComputer size={16} />
            <span>Il computer scrive</span>
            <span className="nomi-computer__puntini" aria-label={`${g.scritteComputer} su ${p.categorie.length}`}>
              {p.categorie.map((c, i) => (
                <span key={c} className={i < g.scritteComputer ? 'is-scritta' : ''} />
              ))}
            </span>
          </p>
          <FoglioDaScrivere lettera={p.lettera} categorie={p.categorie} risposte={g.risposte} onScrivi={g.scrivi} />
          <Button size="lg" fullWidth onClick={g.dicoStop}>
            Stop!
          </Button>
        </div>
      ) : (
        <Fine g={g} />
      )}
      <ComeSiGiocaNomi open={regole} onClose={() => setRegole(false)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Prima di cominciare: tre livelli, e toccarne uno comincia. */
function SceltaLivello({ g }: { g: NomiLibera }) {
  const [conti] = useState(leggiContiNomi)
  return (
    <Sezione titolo="Contro il computer">
      <Elenco>
        {LIVELLI_NOMI.map((livello, i) => (
          <Riga
            key={livello}
            icona={<Tacche piene={i + 1} colore="var(--nomi-1)" />}
            titolo={NOMI_LIVELLI_NOMI[livello]}
            onClick={() => g.nuova(livello)}
          />
        ))}
      </Elenco>
      {conti.partite > 0 && (
        <p className="nomi-conti u-tabnum">
          {conti.vinte} {conti.vinte === 1 ? 'vinta' : 'vinte'} su {conti.partite}
        </p>
      )}
      {g.guasto && <p className="nomi-guasto">{g.guasto}</p>}
    </Sezione>
  )
}

/** Com'e' finita: le risposte di tutti e due, i punti di ognuna, e qualche parola che nessuno ha scritto. */
function Fine({ g }: { g: NomiLibera }) {
  const p = g.partita!
  const r = g.risultato!
  const righe: RigaScritta[] = p.categorie.map((c, i) => {
    const testo = g.risposte[c]?.trim() ?? ''
    const sua = r.computer[i]
    return {
      categoria: c,
      testo,
      segno: !testo ? 'vuota' : r.mie[i] ? 'giusta' : 'sbagliata',
      nota: `Computer: ${sua ?? '—'}${sua ? ` · ${r.punti[1][i]}` : ''}`,
      punti: r.punti[0][i] > 0 ? `+${r.punti[0][i]}` : undefined,
    }
  })
  const altre = g.file
    ? p.categorie
        .map((c, i) => ({ c, parole: altrePossibili(g.file!, c, [r.mie[i], r.sue[i]]) }))
        .filter((a) => a.parole.length > 0)
    : []
  const esito = r.esito === 'vinta' ? 'Hai vinto' : r.esito === 'persa' ? 'Hai perso' : 'Pari'
  return (
    <div className="nomi-pagina">
      <Scheda
        className="nomi-scheda"
        titolo={`Con la ${p.lettera.toUpperCase()}`}
        icona={<Lettera lettera={p.lettera} piccola />}
        destra={
          <Pillola tono={r.esito === 'vinta' ? 'buona' : r.esito === 'persa' ? 'cattiva' : 'neutra'}>
            {esito} {r.totali[0]} a {r.totali[1]}
          </Pillola>
        }
      >
        <FoglioScritto righe={righe} />
        {altre.length > 0 && (
          <div className="nomi-ieri__piu">
            <p className="nomi-ieri__titolo">Si poteva scrivere</p>
            <ul className="nomi-ieri__elenco">
              {altre.map(({ c, parole }) => (
                <li key={c}>
                  <span className="nomi-ieri__categoria">{CATEGORIE_NOMI[c].nome}</span>
                  <span className="nomi-ieri__risposte">
                    {parole.map((w) => (
                      <span key={w} className="nomi-ieri__risposta">
                        {w}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Scheda>
      <div className="nomi-libera__azioni">
        <Button size="lg" onClick={() => g.nuova(p.livello)}>
          <IconRefresh size={18} /> Un’altra
        </Button>
        <Button size="lg" variant="tinted" onClick={g.scegli}>
          Cambia difficoltà
        </Button>
      </div>
    </div>
  )
}
