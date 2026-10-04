import { useCallback, useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, Elenco, Riga, Sezione, Tacche, useFesta } from '@/components/Elementi'
import { IconComputer, IconInfo, IconRefresh, IconTimbro } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Pillola } from '@/components/Scheda'
import { SegmentedControl } from '@/components/SegmentedControl'
import { adesivoFine, adesivoStop, adesivoTempo, scuoti } from '@/games/nomi/adesivi'
import { ComeSiGiocaNomi } from '@/games/nomi/ComeSiGioca'
import { leggiContiNomi } from '@/games/nomi/conti'
import { Altro, CartaScritta, FoglioInGioco, PostIt, movimentoRidotto } from '@/games/nomi/Foglio'
import { LIVELLI_NOMI, NOMI_LIVELLI_NOMI, altrePossibili, type LivelloNomi } from '@/games/nomi/libera'
import { righeAlTavolo } from '@/games/nomi/racconto'
import { Partenza, RulloLettera, VoloLettera, type Tondo, type Volo } from '@/games/nomi/Rullo'
import { TIMBRO_MS, tempiCorrezione } from '@/games/nomi/scena'
import { useNomiLibera, type NomiLibera } from '@/games/nomi/useNomiLibera'
import { SalaAmico } from '@/games/nomi/sfida/SalaAmico'
import { CATEGORIE_NOMI, TEMPO_NOMI_MS } from '@shared/nomi-cose'
import '@/games/nomi/NomiCose.css'

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
 * si sceglie la difficoltà e si comincia: il rullo gira mentre arrivano le
 * parole della lettera, e si ferma su quella. Il computer scrive anche lui, e
 * quando ha finito dice stop: da li' non si scrive piu', come al tavolo. Poi
 * il foglio si corregge, e si sa com'e' andata. Con un amico si manda la
 * sfida, e si gioca nella sua pagina.
 */
export default function NomiCoseLibera() {
  const g = useNomiLibera()
  const [regole, setRegole] = useState(false)
  const [contro, setContro] = useState<Contro>(leggiContro)
  const [livello, setLivello] = useState<LivelloNomi>('normale')
  const scegliContro = (c: Contro) => {
    setContro(c)
    try {
      localStorage.setItem(CHIAVE_CONTRO, c)
    } catch {
      /* senza localStorage la scelta non si ricorda */
    }
  }
  const gioca = (l: LivelloNomi) => {
    setLivello(l)
    g.nuova(l)
  }
  const { adesivo, accoda } = useCodaAdesivi()

  // La lettera: il rullo gira finche' la lettera, ferma, non vola sul foglio.
  const [rivelata, setRivelata] = useState(false)
  const [volo, setVolo] = useState<Volo | null>(null)
  const [vinta, setVinta] = useState(false)
  useEffect(() => {
    if (g.fase !== 'carica') return
    setRivelata(false)
    setVinta(false)
  }, [g.fase])
  const lettera = g.fase === 'gioco' ? (g.partita?.lettera ?? null) : null
  const arrivata = useCallback(
    (da: Tondo) => {
      if (lettera) setVolo({ lettera, da })
      setRivelata(true)
    },
    [lettera],
  )

  // La fine: il timbro dello stop, la correzione del foglio, e poi com'e' andata.
  const raccontata = useRef<unknown>(null)
  const dopo = useRef<number | null>(null)
  useEffect(() => {
    const r = g.risultato
    if (g.fase !== 'fine' || !r || !g.partita || raccontata.current === r) return
    raccontata.current = r
    accoda(g.stop === 'tempo' ? adesivoTempo() : adesivoStop(g.stop === 'io' ? 'io' : 'Il computer'))
    scuoti(document.querySelector('.pagina__corpo'))
    const quando = tempiCorrezione(g.partita.categorie.length, TIMBRO_MS, movimentoRidotto()).fine
    if (dopo.current) window.clearTimeout(dopo.current)
    dopo.current = window.setTimeout(() => {
      accoda(adesivoFine(r.esito, r.totali[0], r.totali[1], 'il computer'))
      setVinta(r.esito === 'vinta')
    }, quando)
  }, [accoda, g.fase, g.partita, g.risultato, g.stop])
  useEffect(
    () => () => {
      if (dopo.current) window.clearTimeout(dopo.current)
    },
    [],
  )
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
        {contro === 'computer' ? <SceltaLivello guasto={g.guasto} onGioca={gioca} /> : <SalaAmico />}
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
      {g.fase === 'carica' || (g.fase === 'gioco' && !rivelata) || !p ? (
        <Partenza
          sopra={
            <>
              <Tacche piene={LIVELLI_NOMI.indexOf(livello) + 1} colore="var(--nomi-1)" />
              <span>Contro il computer · {NOMI_LIVELLI_NOMI[livello]}</span>
            </>
          }
          sotto="La lettera è…"
        >
          <RulloLettera lettera={lettera} gira onArrivato={arrivata} />
        </Partenza>
      ) : g.fase === 'gioco' ? (
        <FoglioInGioco
          lettera={p.lettera}
          categorie={p.categorie}
          risposte={g.risposte}
          onScrivi={g.scrivi}
          scadenza={g.scadenza}
          totaleMs={TEMPO_NOMI_MS}
          onScaduto={g.tempoFinito}
          entrata
          nascondiLettera={volo !== null}
          altro={
            <Altro
              chi={<IconComputer size={16} />}
              nome="Il computer"
              scritte={g.scritteComputer}
              totale={p.categorie.length}
            />
          }
          azione={
            <Button size="lg" fullWidth onClick={g.dicoStop}>
              <IconTimbro size={20} /> Stop!
            </Button>
          }
        />
      ) : (
        <Fine g={g} />
      )}
      <ComeSiGiocaNomi open={regole} onClose={() => setRegole(false)} />
      <VoloLettera volo={volo} onFine={() => setVolo(null)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Prima di cominciare: tre livelli, e toccarne uno comincia. */
function SceltaLivello({ guasto, onGioca }: { guasto: string | null; onGioca: (livello: LivelloNomi) => void }) {
  const [conti] = useState(leggiContiNomi)
  return (
    <Sezione titolo="Difficoltà">
      <Elenco>
        {LIVELLI_NOMI.map((livello, i) => (
          <Riga
            key={livello}
            icona={<Tacche piene={i + 1} colore="var(--nomi-1)" />}
            titolo={NOMI_LIVELLI_NOMI[livello]}
            onClick={() => onGioca(livello)}
          />
        ))}
      </Elenco>
      {conti.partite > 0 && (
        <p className="nomi-conti u-tabnum">
          {conti.vinte} {conti.vinte === 1 ? 'vinta' : 'vinte'} su {conti.partite}
        </p>
      )}
      {guasto && <p className="nomi-guasto">{guasto}</p>}
    </Sezione>
  )
}

/**
 * Com'e' finita: il foglio che si corregge, con le risposte del computer
 * sotto le mie e i punti di ognuna, e su un post-it qualche parola che nessuno
 * dei due ha scritto.
 */
function Fine({ g }: { g: NomiLibera }) {
  const p = g.partita!
  const r = g.risultato!
  const righe = righeAlTavolo(
    p.categorie,
    { testi: p.categorie.map((c) => g.risposte[c]), valide: r.mie.map(Boolean), punti: r.punti[0] },
    { nome: 'Computer', testi: r.computer, valide: r.sue.map(Boolean), punti: r.punti[1] },
  )
  const altre = g.file
    ? p.categorie
        .map((c, i) => ({ c, parole: altrePossibili(g.file!, c, [r.mie[i], r.sue[i]]) }))
        .filter((a) => a.parole.length > 0)
    : []
  const esito = r.esito === 'vinta' ? 'Hai vinto' : r.esito === 'persa' ? 'Hai perso' : 'Pari'
  return (
    <div className="nomi-pagina">
      <CartaScritta
        titolo={`Con la ${p.lettera.toUpperCase()}`}
        lettera={p.lettera}
        destra={
          <Pillola tono={r.esito === 'vinta' ? 'buona' : r.esito === 'persa' ? 'cattiva' : 'neutra'}>
            {esito} {r.totali[0]} a {r.totali[1]}
          </Pillola>
        }
        righe={righe}
        totale={{ etichetta: 'Totale', nota: `Computer ${r.totali[1]}`, valore: r.totali[0] }}
        conPunti
        correzione={{ attesa: TIMBRO_MS }}
      />
      {altre.length > 0 && (
        <PostIt
          titolo="Si poteva scrivere"
          voci={altre.map(({ c, parole }) => ({ chiave: c, nome: CATEGORIE_NOMI[c].nome, parole: parole.join(', ') }))}
        />
      )}
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
