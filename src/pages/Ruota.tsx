import { Suspense, lazy, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi, type DatiAdesivo } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Numero } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { ComeSiGiocaRuota } from '@/games/ruota/ComeSiGioca'
import {
  COLORI_MATERIE_RUOTA,
  DisegnoMoltiplicatori,
  DisegnoRuota,
  ICONE_MATERIE_RUOTA,
  coloreDelMoltiplicatore,
} from '@/games/ruota/disegni'
import { Intermezzo, PIOGGIA_MS, PioggiaDiMonete, type DatiIntermezzo } from '@/games/ruota/Intermezzo'
import { LineaPuntata } from '@/games/ruota/LineaPuntata'
import { Moneta } from '@/games/ruota/Moneta'
import { RuotaFisica, type Meta, type Mozzo } from '@/games/ruota/RuotaFisica'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import {
  INTERVALLO_GIRI_MS,
  MOLTIPLICATORI,
  NOME_CRAZY_TIME,
  NOMI_MATERIE_RUOTA,
  PUNTATA_MINIMA,
  SPICCHI,
  conSegno,
  scriviMoltiplicatore,
  type MateriaRuota,
} from '@shared/ruota'
import type { GiroRuota, RuotaStato } from '@shared/types'
import './Ruota.css'

const DomandaRuota = lazy(() => import('@/games/ruota/DomandaRuota'))

type NomeScena = 'ruota' | 'moltiplicatori' | 'moneta' | 'domanda'
type Luci = 'attesa' | 'vinto' | 'perso'

/** Quanto resta un adesivo, quanto festeggiano le luci prima del passaggio, quanto si guarda il moltiplicatore. */
const ADESIVO_MS = 2_300
const FESTA_LUCI_MS = 950
const RIVELA_MS = 2_000
/** La moneta caduta resta in vista, prima di tornare alla ruota: il lato uscito si deve vedere. */
const MONETA_IN_VISTA_MS = 2_700
/** Quanto resta l'invito a lanciare piu' forte. */
const DEBOLE_MS = 2_200

/** La scena di un giro: la ruota, o il minigioco a cui e' arrivato. */
function scenaDi(giro: GiroRuota | null): NomeScena {
  const sfida = giro?.sfida
  if (!giro || giro.stato === 'fatto' || !sfida) return 'ruota'
  if (sfida.tipo === 'moneta') return 'moneta'
  return sfida.moltiplicatore === null ? 'moltiplicatori' : 'domanda'
}

/** Il moltiplicatore e la vincita del minigioco di un giro, quando ci sono. */
function palioDi(giro: GiroRuota | null): { moltiplicatore: number; vincita: number } | null {
  const s = giro?.sfida
  if (!s || s.moltiplicatore === null || s.vincita === null) return null
  return { moltiplicatore: s.moltiplicatore, vincita: s.vincita }
}

/** Le attese della pagina, tutte spente quando la pagina se ne va. */
function useDopo() {
  const attese = useRef(new Set<number>())
  useEffect(() => {
    const tutte = attese.current
    return () => tutte.forEach((t) => window.clearTimeout(t))
  }, [])
  return useCallback((ms: number, fai: () => void) => {
    const t = window.setTimeout(() => {
      attese.current.delete(t)
      fai()
    }, ms)
    attese.current.add(t)
  }, [])
}

/**
 * Crazy Time: si punta, si trascina la ruota e la si lascia andare. Il banco si
 * tiene la puntata; una domanda porta alla ruota dei moltiplicatori e poi alla
 * domanda; la moneta alla moneta da lanciare. Ogni passaggio ha la sua
 * transizione, e finito il minigioco si torna alla ruota com'era, con l'esito
 * sul mozzo.
 *
 * Il server decide tutto e risponde con lo stato intero; qui si fa vedere,
 * nell'ordine giusto: prima la ruota che gira, poi l'esito. Lo stato di una
 * pagina riaperta dice in che scena si era.
 */
export default function RuotaPagina() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const dopo = useDopo()
  const [stato, setStato] = useState<RuotaStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [scena, setScena] = useState<NomeScena>('ruota')
  const [intermezzo, setIntermezzo] = useState<(DatiIntermezzo & { verso: NomeScena }) | null>(null)
  /** La puntata scelta: finché non la si tocca e' quella del giro di prima. */
  const [puntata, setPuntata] = useState<number | null>(null)
  const [inviando, setInviando] = useState(false)
  // La ruota: dove fermarsi, se gira, le luci, e l'esito sul mozzo.
  const [fermaSu, setFermaSu] = useState<Meta | null>(null)
  const [inGioco, setInGioco] = useState<number | null>(null)
  const [annulla, setAnnulla] = useState(0)
  const [luci, setLuci] = useState<Luci>('attesa')
  const [esito, setEsito] = useState(false)
  /** Fra due giri passano tre secondi: senza animazioni la ruota si ferma subito, e il server direbbe di no. */
  const [riposata, setRiposata] = useState(true)
  const [debole, setDebole] = useState(false)
  // La ruota dei moltiplicatori.
  const [fermaSuM, setFermaSuM] = useState<Meta | null>(null)
  const [girandoM, setGirandoM] = useState(false)
  const [annullaM, setAnnullaM] = useState(0)
  const [luciM, setLuciM] = useState<Luci>('attesa')
  const [rivelato, setRivelato] = useState(false)
  // La moneta: mentre e' in aria il tabellone resta com'era, e il lato si dice quando cade.
  const [annullaMoneta, setAnnullaMoneta] = useState(0)
  const [conto, setConto] = useState<{ saldo: number; netto: number; giri: number } | null>(null)
  const [monetaCaduta, setMonetaCaduta] = useState(false)
  const [regole, setRegole] = useState(false)
  const [pioggia, setPioggia] = useState(0)
  const { adesivo, accoda } = useCodaAdesivi()
  // Lo stato di adesso, per chi lo legge a ruota ferma o a moneta caduta: arrivano dopo il disegno.
  const ultimo = useRef(stato)
  useEffect(() => {
    ultimo.current = stato
  })

  const leggi = useCallback(() => api<RuotaStato>('/ruota'), [])

  useEffect(() => {
    let vivo = true
    leggi()
      .then((s) => {
        if (!vivo) return
        const g = s.giro
        setStato(s)
        setScena(scenaDi(g))
        if (g) {
          setFermaSu({ indice: g.spicchio, chiave: `p${g.n}` })
          setEsito(g.stato === 'fatto')
          if (g.sfida?.tipo === 'domanda' && g.sfida.spicchioMoltiplicatore !== null) {
            setFermaSuM({ indice: g.sfida.spicchioMoltiplicatore, chiave: `m${g.n}` })
            setRivelato(true)
          }
        }
      })
      .catch((e) => vivo && setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la ruota.'))
    return () => {
      vivo = false
    }
  }, [leggi])

  useEffect(() => {
    if (riposata) return
    const t = window.setTimeout(() => setRiposata(true), INTERVALLO_GIRI_MS)
    return () => window.clearTimeout(t)
  }, [riposata])

  useEffect(() => {
    if (!debole) return
    const t = window.setTimeout(() => setDebole(false), DEBOLE_MS)
    return () => window.clearTimeout(t)
  }, [debole])

  /** Una richiesta che risponde con lo stato: se va male lo dice, e rilegge com'e' davvero. */
  const inVolo = useRef(false)
  const chiedi = useCallback(
    async (percorso: string, corpo?: unknown): Promise<RuotaStato | null> => {
      // Un doppio tocco manderebbe la seconda prima che il bottone si spenga: il server la rifiuterebbe.
      if (inVolo.current) return null
      inVolo.current = true
      setInviando(true)
      try {
        const nuovo = await api<RuotaStato>(percorso, { method: 'POST', body: corpo ?? {} })
        dimentica('/oggi')
        return nuovo
      } catch (e) {
        toast.show(e instanceof ApiFetchError ? e.message : 'Non è andata: riprova.', 'error')
        leggi().then(setStato, () => {})
        return null
      } finally {
        inVolo.current = false
        setInviando(false)
      }
    },
    [toast, leggi],
  )

  /** L'esito di un minigioco: la vincita con le monete, o il banco. */
  const annuncia = (g: GiroRuota) => {
    const palio = palioDi(g)
    if (g.delta > 0 && palio) {
      accoda(adesivoVincita(palio.vincita, g.puntata, palio.moltiplicatore))
      setPioggia((p) => p + 1)
      dopo(PIOGGIA_MS, () => setPioggia(0))
    } else {
      accoda(adesivoBanco(g.puntata))
    }
  }

  const giro = stato?.giro ?? null
  const sfida = giro?.sfida ?? null
  const saldo = stato?.saldo ?? 0
  const puoGirare = saldo >= PUNTATA_MINIMA
  // Si punta quanto si vuole, dalla minima a tutto il saldo; finché non la si cambia, la puntata e' quella di prima.
  const scelta = Math.min(saldo, Math.max(PUNTATA_MINIMA, puntata ?? giro?.puntata ?? PUNTATA_MINIMA))
  const girando = inGioco !== null

  /* ───────────────────────────────  La ruota  ─────────────────────────────── */

  const lanciaRuota = async () => {
    setEsito(false)
    setDebole(false)
    setLuci('attesa')
    setInGioco(scelta)
    setRiposata(false)
    const nuovo = await chiedi('/ruota/gira', { puntata: scelta })
    if (!nuovo?.giro) {
      setAnnulla((a) => a + 1)
      setInGioco(null)
      return
    }
    setStato(nuovo)
    setFermaSu({ indice: nuovo.giro.spicchio, chiave: `p${nuovo.giro.n}` })
  }

  const fermataRuota = () => {
    setInGioco(null)
    const g = ultimo.current?.giro
    if (!g) return
    const s = SPICCHI[g.spicchio]
    if (s.tipo === 'banco') {
      setEsito(true)
      setLuci('perso')
      accoda(adesivoBanco(g.puntata))
      dopo(1_700, () => setLuci('attesa'))
      return
    }
    setLuci('vinto')
    suona('bonus')
    dopo(FESTA_LUCI_MS, () => {
      setLuci('attesa')
      setIntermezzo(
        s.tipo === 'moneta'
          ? {
              chiave: Date.now(),
              titolo: 'Moneta',
              sotto: 'Blu vinci, rosso vince il banco',
              colore: 'var(--ct-moneta)',
              icona: <MonetaPiccola />,
              verso: 'moneta',
            }
          : {
              chiave: Date.now(),
              titolo: NOMI_MATERIE_RUOTA[s.materia],
              sotto: 'Gira i moltiplicatori',
              colore: COLORI_MATERIE_RUOTA[s.materia],
              icona: <IconaMateria materia={s.materia} />,
              verso: 'moltiplicatori',
            },
      )
    })
  }

  /* ───────────────────────────  I moltiplicatori  ──────────────────────────── */

  const lanciaMoltiplicatori = async () => {
    setGirandoM(true)
    setLuciM('attesa')
    setRivelato(false)
    const nuovo = await chiedi('/ruota/moltiplicatore')
    const s = nuovo?.giro?.sfida
    if (!nuovo?.giro || s?.tipo !== 'domanda' || s.spicchioMoltiplicatore === null) {
      setAnnullaM((a) => a + 1)
      setGirandoM(false)
      return
    }
    setStato(nuovo)
    setFermaSuM({ indice: s.spicchioMoltiplicatore, chiave: `m${nuovo.giro.n}` })
  }

  const apriDomanda = async () => {
    setScena('domanda')
    const nuovo = await chiedi('/ruota/domanda')
    if (nuovo) setStato(nuovo)
  }

  const fermataMoltiplicatori = () => {
    setGirandoM(false)
    setLuciM('vinto')
    setRivelato(true)
    suona('moltiplicatore')
    dopo(RIVELA_MS, () => {
      setLuciM('attesa')
      void apriDomanda()
    })
  }

  /* ───────────────────────────────  La domanda  ─────────────────────────────── */

  const rispondi = async (risposta: string | null) => {
    const nuovo = await chiedi('/ruota/risposta', { scelta: risposta })
    if (!nuovo?.giro) return
    setStato(nuovo)
    annuncia(nuovo.giro)
  }

  const allaRuota = () => {
    setScena('ruota')
    setEsito(true)
    setRivelato(false)
  }

  /* ───────────────────────────────  La moneta  ─────────────────────────────── */

  const lanciaMoneta = async () => {
    if (stato) setConto({ saldo: stato.saldo, netto: stato.netto, giri: stato.giri })
    setMonetaCaduta(false)
    const nuovo = await chiedi('/ruota/moneta')
    if (!nuovo?.giro) {
      setConto(null)
      setAnnullaMoneta((a) => a + 1)
      return
    }
    setStato(nuovo)
  }

  const caduta = () => {
    setConto(null)
    setMonetaCaduta(true)
    const g = ultimo.current?.giro
    if (!g) return
    annuncia(g)
    dopo(MONETA_IN_VISTA_MS, allaRuota)
  }

  /* ───────────────────────────────  La pagina  ─────────────────────────────── */

  const palio = palioDi(giro)
  const mozzo: Mozzo =
    inGioco !== null
      ? { testo: String(inGioco), sotto: 'puntata' }
      : esito && giro?.stato === 'fatto'
        ? { testo: conSegno(giro.delta), sotto: 'punti', tono: giro.delta > 0 ? 'piu' : 'meno' }
        : puoGirare
          ? { testo: String(scelta), sotto: 'puntata' }
          : { testo: String(saldo), sotto: 'saldo' }
  const mozzoM: Mozzo = rivelato && palio ? { testo: scriviMoltiplicatore(palio.moltiplicatore) } : { testo: '×?' }
  const prontaRuota = scena === 'ruota' && !intermezzo && puoGirare && !girando && riposata && !inviando
  const prontaM = scena === 'moltiplicatori' && !intermezzo && !girandoM && !rivelato && !inviando
  const materia = sfida?.tipo === 'domanda' ? sfida.materia : null

  return (
    <Pagina
      titolo={NOME_CRAZY_TIME}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {scena === 'domanda' && sfida?.tipo === 'domanda' ? (
        <Suspense fallback={<div className="ct-attesa" aria-hidden="true" />}>
          {sfida.domanda ? (
            <DomandaRuota
              key={`${giro?.n}-${giro?.stato}`}
              sfida={sfida}
              inviando={inviando}
              onRispondi={(r) => void rispondi(r)}
              onTorna={allaRuota}
            />
          ) : inviando ? (
            <div className="ct-attesa" aria-hidden="true" />
          ) : (
            <Pronti materia={sfida.materia} vincita={sfida.vincita} onVia={() => void apriDomanda()} />
          )}
        </Suspense>
      ) : (
        <div className="ct">
          {stato && <Tabellone {...(conto ?? { saldo, netto: stato.netto, giri: stato.giri })} />}
          <div className="ct-corpo">
            <div className={`ct-palco is-${scena}${luci === 'perso' ? ' is-scosso' : ''}`}>
              <span className="ct-palco__luce" aria-hidden="true" />
              <span className="ct-palco__scintille" aria-hidden="true" />
              <span className="ct-palco__insegna" aria-hidden="true">
                Crazy <span>Time</span>
              </span>
              {!stato ? (
                <div className="ct-palco__attesa" aria-hidden="true" />
              ) : (
                <>
                  <Scena attiva={scena === 'ruota'} nome="ruota">
                    <RuotaFisica
                      spicchi={SPICCHI.length}
                      disegno={<DisegnoRuota />}
                      fermaSu={fermaSu}
                      pronta={prontaRuota}
                      onLancio={() => void lanciaRuota()}
                      onFerma={fermataRuota}
                      onDebole={() => setDebole(true)}
                      annulla={annulla}
                      luci={luci}
                      lampade={24}
                      durataMinima={3_600}
                      mozzo={mozzo}
                      invito={prontaRuota}
                      etichetta="La ruota: trascinala e lasciala andare per girarla"
                      classe="is-principale"
                    />
                  </Scena>
                  <Scena attiva={scena === 'moltiplicatori'} nome="moltiplicatori">
                    {materia && <Cartello materia={materia} />}
                    <RuotaFisica
                      spicchi={MOLTIPLICATORI.length}
                      disegno={<DisegnoMoltiplicatori />}
                      fermaSu={fermaSuM}
                      pronta={prontaM}
                      onLancio={() => void lanciaMoltiplicatori()}
                      onFerma={fermataMoltiplicatori}
                      onDebole={() => setDebole(true)}
                      annulla={annullaM}
                      luci={luciM}
                      lampade={24}
                      durataMinima={2_800}
                      mozzo={mozzoM}
                      invito={prontaM}
                      etichetta="La ruota dei moltiplicatori: trascinala e lasciala andare"
                      classe="is-moltiplicatori"
                    />
                    {rivelato && palio && <Rivelazione {...palio} />}
                  </Scena>
                  <Scena attiva={scena === 'moneta'} nome="moneta">
                    {sfida?.tipo === 'moneta' && (
                      <Moneta
                        key={giro?.n}
                        moltiplicatore={sfida.moltiplicatore}
                        uscito={sfida.uscito}
                        lanciabile={scena === 'moneta' && !intermezzo && giro?.stato === 'sfida' && !inviando}
                        annulla={annullaMoneta}
                        onTocca={() => void lanciaMoneta()}
                        onCaduta={caduta}
                      />
                    )}
                  </Scena>
                </>
              )}
              <Intermezzo
                dati={intermezzo}
                onMezzo={() => intermezzo && setScena(intermezzo.verso)}
                onFine={() => setIntermezzo(null)}
              />
            </div>

            <section className="ct-pannello" aria-live="polite">
              {errore ? (
                <p className="ct-nota">{errore}</p>
              ) : !stato ? null : scena === 'moltiplicatori' ? (
                <Indicazione titolo={rivelato && palio ? `In palio ${palio.vincita} punti` : 'Gira i moltiplicatori'}>
                  {rivelato && palio
                    ? `${giro?.puntata} ${scriviMoltiplicatore(palio.moltiplicatore)}, se rispondi giusto`
                    : debole
                      ? 'Più forte: trascinala e lasciala andare'
                      : 'Trascina la ruota e lasciala andare'}
                </Indicazione>
              ) : scena === 'moneta' && sfida?.tipo === 'moneta' ? (
                <Indicazione
                  titolo={
                    sfida.uscito && monetaCaduta
                      ? sfida.uscito === 'blu'
                        ? `Blu: vinci ${sfida.vincita}!`
                        : 'Rosso: vince il banco'
                      : 'Tocca la moneta'
                  }
                >
                  <span className="ct-lati">
                    <span className="ct-lato is-blu">
                      Blu {scriviMoltiplicatore(sfida.moltiplicatore)} · vinci {sfida.vincita}
                    </span>
                    <span className="ct-lato is-rosso">Rosso · banco</span>
                  </span>
                </Indicazione>
              ) : !puoGirare ? (
                <PochiPunti saldo={saldo} onClassificate={() => vai(ROTTE.home)} />
              ) : (
                <>
                  <LineaPuntata min={PUNTATA_MINIMA} max={saldo} valore={scelta} onChange={setPuntata} />
                  <p className={`ct-suggerimento${debole ? ' is-debole' : ''}`}>
                    <ManoCheTrascina />
                    {girando
                      ? `Puntata di ${inGioco} punti`
                      : debole
                        ? 'Più forte: trascinala e lasciala andare'
                        : 'Trascina la ruota per girarla'}
                  </p>
                </>
              )}
            </section>
          </div>
        </div>
      )}

      <Adesivo adesivo={adesivo} />
      {pioggia > 0 && <PioggiaDiMonete key={pioggia} />}
      <ComeSiGiocaRuota open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/* ─────────────────────────────  I pezzi della pagina  ───────────────────────────── */

/** Una scena del palco: quella attiva si vede, le altre aspettano dietro, e non si toccano. */
function Scena({ attiva, nome, children }: { attiva: boolean; nome: string; children: ReactNode }) {
  return (
    <div className={`ct-scena ct-scena--${nome}${attiva ? ' is-attiva' : ''}`} aria-hidden={!attiva} inert={!attiva}>
      {children}
    </div>
  )
}

/**
 * Il tabellone in cima: il saldo, che conta quando cambia, e quel che Crazy Time
 * ha dato o tolto oggi. A ogni cambio del saldo la differenza sale e svanisce:
 * la puntata pagata al lancio, la vincita all'esito.
 */
function Tabellone({ saldo, netto, giri }: { saldo: number; netto: number; giri: number }) {
  const prima = useRef(saldo)
  const [variazione, setVariazione] = useState<{ chiave: number; quanto: number } | null>(null)
  useEffect(() => {
    const d = saldo - prima.current
    prima.current = saldo
    if (d !== 0) setVariazione({ chiave: Date.now(), quanto: d })
  }, [saldo])
  const tono = netto > 0 ? ' is-piu' : netto < 0 ? ' is-meno' : ''
  return (
    <div className="ct-tabellone">
      <span className="ct-tabellone__voce">
        <span className="ct-tabellone__etichetta">Saldo</span>
        <span className="ct-tabellone__saldo">
          <Numero valore={saldo} />
          {variazione && (
            <span
              key={variazione.chiave}
              className={`ct-tabellone__variazione${variazione.quanto > 0 ? ' is-piu' : ' is-meno'}`}
              aria-hidden="true"
            >
              {conSegno(variazione.quanto)}
            </span>
          )}
        </span>
      </span>
      <span className="ct-tabellone__voce is-destra">
        <span className="ct-tabellone__etichetta">Oggi</span>
        <span className="ct-tabellone__oggi">
          <span className={`ct-tabellone__netto u-tabnum${tono}`}>{conSegno(netto)}</span>
          <span className="ct-tabellone__giri">
            in <span className="u-tabnum">{giri}</span> {giri === 1 ? 'giro' : 'giri'}
          </span>
        </span>
      </span>
    </div>
  )
}

/** Il cartello sopra la ruota dei moltiplicatori: di che materia sara' la domanda. */
function Cartello({ materia }: { materia: MateriaRuota }) {
  return (
    <p className="ct-cartello" style={{ '--colore': COLORI_MATERIE_RUOTA[materia] } as CSSProperties}>
      <IconaMateria materia={materia} piccola />
      Domanda di {NOMI_MATERIE_RUOTA[materia].toLowerCase()}
    </p>
  )
}

/** Il moltiplicatore uscito, che salta fuori dalla ruota con quel che mette in palio. */
function Rivelazione({ moltiplicatore, vincita }: { moltiplicatore: number; vincita: number }) {
  return (
    <div
      className="ct-rivela"
      style={{ '--colore': coloreDelMoltiplicatore(moltiplicatore) } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ct-rivela__raggi" />
      <span className="ct-rivela__valore">{scriviMoltiplicatore(moltiplicatore)}</span>
      <span className="ct-rivela__palio">
        in palio <span className="u-tabnum">{vincita}</span>
      </span>
    </div>
  )
}

/** La domanda pronta ma non ancora aperta, come quando si riapre la pagina: il tempo parte dal Via. */
function Pronti({ materia, vincita, onVia }: { materia: MateriaRuota; vincita: number | null; onVia: () => void }) {
  return (
    <div className="ct-pronti">
      <Cartello materia={materia} />
      {vincita !== null && (
        <p className="ct-pronti__palio">
          In palio <span className="u-tabnum">{vincita}</span> punti
        </p>
      )}
      <Button size="lg" fullWidth onClick={onVia}>
        Via
      </Button>
    </div>
  )
}

function Indicazione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <div className="ct-indicazione">
      <p className="ct-indicazione__titolo">{titolo}</p>
      <p className="ct-indicazione__testo">{children}</p>
    </div>
  )
}

function PochiPunti({ saldo, onClassificate }: { saldo: number; onClassificate: () => void }) {
  return (
    <div className="ct-indicazione">
      <p className="ct-indicazione__titolo">Servono {PUNTATA_MINIMA} punti</p>
      <p className="ct-indicazione__testo">{saldo > 0 ? `Ne hai ${saldo}.` : 'Fai punti nelle classificate.'}</p>
      <Button size="lg" fullWidth variant="tinted" onClick={onClassificate}>
        Alle classificate
      </Button>
    </div>
  )
}

function IconaMateria({ materia, piccola = false }: { materia: MateriaRuota; piccola?: boolean }) {
  const Icona = ICONE_MATERIE_RUOTA[materia]
  return <Icona size={piccola ? 18 : 34} />
}

/** La moneta dell'insegna: mezza blu e mezza rossa. */
function MonetaPiccola() {
  return (
    <svg width="38" height="38" viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="19" fill="var(--ct-oro)" stroke="var(--ct-oro-scuro)" strokeWidth="1.4" />
      <path d="M0 -16A16 16 0 0 0 0 16Z" fill="var(--ct-blu)" />
      <path d="M0 -16A16 16 0 0 1 0 16Z" fill="var(--ct-rosso)" />
    </svg>
  )
}

/** Una mano che trascina: dice che la ruota si muove col dito. */
function ManoCheTrascina() {
  return (
    <svg className="ct-mano" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 11.5V5.2a1.6 1.6 0 0 1 3.2 0v5.3m0-1.2a1.6 1.6 0 0 1 3.2 0v1.6m0-.6a1.6 1.6 0 0 1 3.2 0v4.6
          c0 3.7-2.5 6.3-6 6.3h-.8c-2 0-3.4-.9-4.6-2.6L4 13.3a1.6 1.6 0 0 1 2.6-1.9L9 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ─────────────────────────────  Gli adesivi  ───────────────────────────── */

function adesivoVincita(vincita: number, puntata: number, moltiplicatore: number): Omit<DatiAdesivo, 'id'> {
  return {
    durata: ADESIVO_MS + 400,
    tono: 'vivace',
    titolo: `Vinci ${vincita}!`,
    sotto: `${puntata} ${scriviMoltiplicatore(moltiplicatore)}`,
    classe: 'ct-adesivo-vincita',
    suono: 'vincita',
  }
}

function adesivoBanco(puntata: number): Omit<DatiAdesivo, 'id'> {
  return {
    durata: ADESIVO_MS,
    tono: 'bordato',
    titolo: 'Vince il banco',
    sotto: `${conSegno(-puntata)} punti`,
    colore: 'var(--ct-rosso)',
    suono: 'banco',
  }
}
