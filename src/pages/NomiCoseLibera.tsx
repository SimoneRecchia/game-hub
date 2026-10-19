import { useCallback, useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Cursore } from '@/components/Cursore'
import { Difficolta, useLivelloScelto } from '@/components/Difficolta'
import { Coriandoli, Sezione, Tacche, useFesta } from '@/components/Elementi'
import { IconComputer, IconInfo, IconRefresh, IconTimbro } from '@/components/Icons'
import { Opzioni, Scelte } from '@/components/Opzioni'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Pillola } from '@/components/Scheda'
import { SegmentedControl } from '@/components/SegmentedControl'
import { adesivoFine, adesivoStop, adesivoTempo } from '@/games/nomi/adesivi'
import { ComeSiGiocaNomi } from '@/games/nomi/ComeSiGioca'
import { leggiContiNomi } from '@/games/nomi/conti'
import { Altro, CartaScritta, FoglioInGioco, PostIt } from '@/games/nomi/Foglio'
import { LIVELLI_NOMI, NOMI_LIVELLI_NOMI, altrePossibili, type LivelloNomi } from '@/games/nomi/libera'
import { righeAlTavolo } from '@/games/nomi/racconto'
import { Partenza, RulloLettera, VoloLettera, type Tondo } from '@/games/nomi/Rullo'
import { TIMBRO_MS, movimentoRidotto, tempiCorrezione } from '@/games/nomi/scena'
import { useNomiLibera, type NomiLibera } from '@/games/nomi/useNomiLibera'
import { useDopo, useLetteraInVolo, useTimbro } from '@/games/nomi/useScena'
import { SalaAmico } from '@/games/nomi/sfida/SalaAmico'
import { CATEGORIE_NOMI, SECONDI_NOMI_LIBERI, secondiNomiValidi } from '@shared/nomi-cose'
import '@/games/nomi/NomiCose.css'

type Contro = 'computer' | 'amico'
const CHIAVE_CONTRO = 'giochi.nomi.contro'
/** Il tempo scelto l'ultima volta, in secondi: lo legge anche l'invito dal profilo di un amico. */
const CHIAVE_TEMPO_NOMI = 'giochi.nomi.tempo'

function leggiSecondi(): number {
  try {
    return secondiNomiValidi(JSON.parse(localStorage.getItem(CHIAVE_TEMPO_NOMI) ?? 'null'))
  } catch {
    return secondiNomiValidi(null)
  }
}

/** I minuti di una scelta, come si leggono: "1 minuto", "3 minuti". */
const minuti = (s: number) => `${s / 60} ${s === 60 ? 'minuto' : 'minuti'}`

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
 * parole della lettera, e si ferma su quella; da li' corre il tempo, per tutti
 * e due. Il computer scrive anche lui, e
 * quando ha finito dice stop: da li' non si scrive piu', come al tavolo. Poi
 * il foglio si corregge, e si sa com'e' andata. Con un amico si manda la
 * sfida, e si gioca nella sua pagina.
 */
export default function NomiCoseLibera() {
  const g = useNomiLibera()
  const [regole, setRegole] = useState(false)
  const [contro, setContro] = useState<Contro>(leggiContro)
  const [livello, setLivello] = useState<LivelloNomi>('normale')
  const [secondi, setSecondi] = useState(leggiSecondi)
  const scegliSecondi = (s: number) => {
    setSecondi(s)
    try {
      localStorage.setItem(CHIAVE_TEMPO_NOMI, JSON.stringify(s))
    } catch {
      /* e' una comodita' */
    }
  }
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
    g.nuova(l, secondi)
  }
  const { adesivo, accoda } = useCodaAdesivi()
  const timbro = useTimbro(accoda)
  const dopo = useDopo()

  // La lettera: il rullo gira finche' la lettera, ferma, non vola sul foglio; e da li' corre il tempo.
  const volo = useLetteraInVolo(g.fase === 'pronta' ? (g.partita?.lettera ?? null) : null)
  const { atterra } = volo
  const { parti } = g
  const arrivata = useCallback(
    (da: Tondo) => {
      atterra(da)
      parti()
    },
    [atterra, parti],
  )

  // Una partita nuova, o la scelta: niente di quella di prima arriva piu'.
  const [vinta, setVinta] = useState(false)
  const { ricomincia } = volo
  useEffect(() => {
    if (g.fase !== 'carica' && g.fase !== 'scelta') return
    ricomincia()
    setVinta(false)
    dopo.annulla()
  }, [dopo, g.fase, ricomincia])

  // La fine: il timbro dello stop, la correzione del foglio, e poi com'e' andata.
  const raccontata = useRef<unknown>(null)
  useEffect(() => {
    const r = g.risultato
    if (g.fase !== 'fine' || !r || !g.partita || raccontata.current === r) return
    raccontata.current = r
    timbro.timbra(g.stop === 'tempo' ? adesivoTempo() : adesivoStop(g.stop === 'io' ? null : 'Il computer'))
    dopo.programma(tempiCorrezione(g.partita.categorie.length, TIMBRO_MS, movimentoRidotto()).fine, () => {
      accoda(adesivoFine(r.esito, r.totali[0], r.totali[1], 'il computer'))
      setVinta(r.esito === 'vinta')
    })
  }, [accoda, dopo, g.fase, g.partita, g.risultato, g.stop, timbro])
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
        gioco="nomi"
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
        <Sezione titolo="Partita">
          <Opzioni>
            <Scelte titolo="Tempo" valore={minuti(secondi)}>
              <Cursore
                ariaLabel="Tempo"
                valori={SECONDI_NOMI_LIBERI}
                valore={secondi}
                etichetta={(s) => `${s / 60} min`}
                voce={minuti}
                onChange={scegliSecondi}
              />
            </Scelte>
          </Opzioni>
        </Sezione>
        {contro === 'computer' ? (
          <SceltaLivello guasto={g.guasto} onGioca={gioca} />
        ) : (
          <SalaAmico secondi={secondi} />
        )}
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
      {g.fase === 'carica' || g.fase === 'pronta' || !p ? (
        <Partenza
          sopra={
            <>
              <Tacche piene={LIVELLI_NOMI.indexOf(livello) + 1} colore="var(--nomi-1)" />
              <span>Contro il computer · {NOMI_LIVELLI_NOMI[livello]}</span>
            </>
          }
          sotto="La lettera è…"
        >
          <RulloLettera lettera={g.fase === 'pronta' ? p!.lettera : null} gira onArrivato={arrivata} />
        </Partenza>
      ) : g.fase === 'gioco' ? (
        <FoglioInGioco
          lettera={p.lettera}
          categorie={p.categorie}
          risposte={g.risposte}
          onScrivi={g.scrivi}
          scadenza={g.scadenza}
          totaleMs={g.tempoMs}
          onScaduto={g.tempoFinito}
          entrata={volo.arrivata}
          nascondiLettera={volo.volo !== null}
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
      <VoloLettera volo={volo.volo} onFine={volo.finito} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Prima di cominciare: tre livelli, e la partita parte da Comincia. */
function SceltaLivello({ guasto, onGioca }: { guasto: string | null; onGioca: (livello: LivelloNomi) => void }) {
  const [conti] = useState(leggiContiNomi)
  const [livello, scegli] = useLivelloScelto('nomi', LIVELLI_NOMI)
  return (
    <Difficolta
      livelli={LIVELLI_NOMI.map((id) => ({ id, nome: NOMI_LIVELLI_NOMI[id] }))}
      scelto={livello}
      onScegli={scegli}
      onComincia={() => onGioca(livello)}
      colore="var(--nomi-1)"
    >
      {conti.partite > 0 && (
        <p className="nomi-conti u-tabnum">
          {conti.vinte} {conti.vinte === 1 ? 'vinta' : 'vinte'} su {conti.partite}
        </p>
      )}
      {guasto && <p className="nomi-guasto">{guasto}</p>}
    </Difficolta>
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
        <Button size="lg" onClick={() => g.nuova(p.livello, p.tempoMs / 1_000)}>
          <IconRefresh size={18} /> Un’altra
        </Button>
        <Button size="lg" variant="tinted" onClick={g.scegli}>
          Cambia difficoltà
        </Button>
      </div>
    </div>
  )
}
