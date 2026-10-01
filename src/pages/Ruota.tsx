import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi, type DatiAdesivo } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, DURATA_FESTA_MS } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { ComeSiGiocaRuota } from '@/games/ruota/ComeSiGioca'
import { LineaPuntata } from '@/games/ruota/LineaPuntata'
import { Moneta } from '@/games/ruota/Moneta'
import { COLORI_MATERIE_RUOTA, Ruota } from '@/games/ruota/Ruota'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import {
  INTERVALLO_GIRI_MS,
  NOME_CRAZY_TIME,
  NOMI_MATERIE_RUOTA,
  PUNTATA_MINIMA,
  SPICCHI,
  conSegno,
  eSfida,
  postaDi,
  type LatoMoneta,
} from '@shared/ruota'
import type { GiroRuota, RuotaStato } from '@shared/types'
import './Ruota.css'

const DomandaRuota = lazy(() => import('@/games/ruota/DomandaRuota'))

/** Quanto resta un adesivo. */
const ADESIVO_MS = 2_200
/** Quanto resta in vista la moneta caduta, prima di tornare alla ruota: il lato uscito si deve vedere. */
const MONETA_CADUTA_MS = 1_400

/**
 * L'adesivo dell'esito di un giro: vivace se da', bordato se toglie. Lo 0 non
 * ne ha: esce quasi un giro su due, e un adesivo a ogni giro smetterebbe di dire
 * qualcosa — basta la ruota ferma sul grigio.
 */
function adesivoDi(giro: GiroRuota): Omit<DatiAdesivo, 'id'> | null {
  const s = SPICCHI[giro.spicchio]
  const bene = giro.delta > 0
  const base = {
    durata: ADESIVO_MS,
    sotto: `${conSegno(giro.delta)} punti`,
    tono: bene ? ('vivace' as const) : ('bordato' as const),
  }
  const sfida = giro.sfida
  if (sfida?.tipo === 'moneta' && sfida.uscito) {
    const titolo = sfida.uscito === 'testa' ? 'Testa!' : 'Croce!'
    const colore = bene ? 'var(--ruota-oro-2)' : 'var(--red)'
    return { ...base, titolo, colore, suono: bene ? 'vittoria' : 'sconfitta' }
  }
  if (sfida?.tipo === 'domanda' && sfida.risposta) {
    const { giusta, scelta } = sfida.risposta
    const titolo = giusta ? 'Giusta!' : scelta === null ? 'Tempo scaduto' : 'Sbagliata'
    const colore = giusta ? COLORI_MATERIE_RUOTA[sfida.materia] : 'var(--red)'
    return { ...base, titolo, colore, suono: giusta ? 'vittoria' : 'sconfitta' }
  }
  if (s.tipo === 'doppio') {
    return {
      ...base,
      titolo: 'x2!',
      colore: 'linear-gradient(155deg, var(--ruota-oro-1), var(--ruota-oro-2))',
      suono: 'vittoria',
    }
  }
  if (s.tipo === 'perdi') return { ...base, titolo: 'Persa', colore: 'var(--red)', suono: 'sconfitta' }
  return null
}

/** L'adesivo di una sfida appena uscita: la ruota si e' fermata su testa o croce, o su una domanda. */
function adesivoSfida(giro: GiroRuota): Omit<DatiAdesivo, 'id'> | null {
  const s = SPICCHI[giro.spicchio]
  if (!eSfida(s)) return null
  const posta = postaDi(s, giro.puntata)
  return {
    durata: ADESIVO_MS,
    tono: 'vivace',
    titolo: s.tipo === 'domanda' ? NOMI_MATERIE_RUOTA[s.materia] : 'Testa o croce',
    sotto: `${conSegno(posta)} o ${conSegno(-posta)}`,
    colore: s.tipo === 'domanda' ? COLORI_MATERIE_RUOTA[s.materia] : 'var(--ruota-moneta)',
    suono: 'invito',
  }
}

/**
 * Crazy Time: si punta, si gira, si gioca la sfida se la ruota si ferma su una,
 * e si ricomincia, quante volte si vuole. Il server decide tutto e risponde con
 * lo stato intero; qui si fa vedere, nell'ordine giusto: prima la ruota che
 * gira, poi l'esito.
 */
export default function RuotaPagina() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const [stato, setStato] = useState<RuotaStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  /** La puntata scelta: finché non la si tocca e' quella del giro di prima. */
  const [puntata, setPuntata] = useState<number | null>(null)
  const [inviando, setInviando] = useState(false)
  /** La ruota sta girando verso lo spicchio del giro: l'esito si vede quando si ferma. */
  const [girando, setGirando] = useState(false)
  const [anima, setAnima] = useState(false)
  /** Fra due giri passa qualche secondo: senza animazioni la ruota si ferma subito, e il server direbbe di no. */
  const [pronta, setPronta] = useState(true)
  /** Sul mozzo l'esito dell'ultimo giro, finché non si tocca la puntata o si gira ancora. */
  const [esito, setEsito] = useState(false)
  /** La moneta e' in aria, o appena caduta. */
  const [lancio, setLancio] = useState(false)
  const [caduta, setCaduta] = useState(false)
  /** La domanda resta in vista dopo la risposta, finché non si torna alla ruota. */
  const [inDomanda, setInDomanda] = useState(false)
  const [regole, setRegole] = useState(false)
  const [festa, setFesta] = useState(false)
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
        setStato(s)
        setInDomanda(s.giro?.stato === 'domanda')
      })
      .catch((e) => vivo && setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la ruota.'))
    return () => {
      vivo = false
    }
  }, [leggi])

  useEffect(() => {
    if (pronta) return
    const t = window.setTimeout(() => setPronta(true), INTERVALLO_GIRI_MS)
    return () => window.clearTimeout(t)
  }, [pronta])

  const festeggia = useCallback(() => {
    setFesta(true)
    window.setTimeout(() => setFesta(false), DURATA_FESTA_MS)
  }, [])

  /** L'esito di un giro chiuso: sul mozzo, e nell'adesivo se conta. */
  const annuncia = useCallback(
    (g: GiroRuota) => {
      setEsito(true)
      const a = adesivoDi(g)
      if (a) accoda(a)
      if (g.delta > 0) festeggia()
    },
    [accoda, festeggia],
  )

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

  const giro = stato?.giro ?? null
  const sfida = giro?.sfida ?? null
  const saldo = stato?.saldo ?? 0
  const puoGirare = saldo >= PUNTATA_MINIMA
  // Si punta quanto si vuole, dalla minima a tutto il saldo; finché non la si cambia, la puntata e' quella di prima.
  const scelta = Math.min(saldo, Math.max(PUNTATA_MINIMA, puntata ?? giro?.puntata ?? PUNTATA_MINIMA))

  const gira = async () => {
    const nuovo = await chiedi('/ruota/gira', { puntata: scelta })
    if (!nuovo?.giro) return
    setEsito(false)
    setPronta(false)
    setAnima(true)
    setGirando(true)
    setStato(nuovo)
  }

  const ferma = useCallback(() => {
    setGirando(false)
    const g = ultimo.current?.giro
    if (!g) return
    if (g.stato === 'fatto') {
      annuncia(g)
      return
    }
    const annuncio = adesivoSfida(g)
    if (annuncio) accoda(annuncio)
  }, [accoda, annuncia])

  const lancia = async (lato: LatoMoneta) => {
    const nuovo = await chiedi('/ruota/moneta', { lato })
    if (!nuovo) return
    setLancio(true)
    setStato(nuovo)
  }

  // A moneta caduta l'esito, e dopo un momento si torna alla ruota.
  const cade = useCallback(() => {
    setLancio(false)
    setCaduta(true)
    const g = ultimo.current?.giro
    if (g) annuncia(g)
  }, [annuncia])

  useEffect(() => {
    if (!caduta) return
    const t = window.setTimeout(() => setCaduta(false), MONETA_CADUTA_MS)
    return () => window.clearTimeout(t)
  }, [caduta])

  const apri = async () => {
    const nuovo = await chiedi('/ruota/domanda')
    if (!nuovo) return
    setStato(nuovo)
    setInDomanda(true)
  }

  const rispondi = useCallback(
    async (risposta: string | null) => {
      const nuovo = await chiedi('/ruota/risposta', { scelta: risposta })
      if (!nuovo?.giro) return
      setStato(nuovo)
      annuncia(nuovo.giro)
    },
    [chiedi, annuncia],
  )

  const scegli = (p: number) => {
    setPuntata(p)
    setEsito(false)
  }

  const inSfida = !!giro && giro.stato !== 'fatto'
  const mostraDomanda = inDomanda && sfida?.tipo === 'domanda' && sfida.domanda !== null
  const moneta = sfida?.tipo === 'moneta' && !girando && (giro?.stato === 'sfida' || lancio || caduta)
  // Sul mozzo la puntata, che segue la linea; mentre la ruota gira quella del giro, poi l'esito; durante una
  // sfida, la sfida.
  const mozzo =
    girando && giro
      ? { testo: String(giro.puntata), sotto: 'puntata' }
      : inSfida || lancio
        ? { testo: '?', sotto: 'sfida' }
        : esito && giro
          ? { testo: conSegno(giro.delta), sotto: 'punti' }
          : puoGirare
            ? { testo: String(scelta), sotto: 'puntata' }
            : { testo: String(saldo), sotto: 'punti' }

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
      {mostraDomanda && sfida?.tipo === 'domanda' ? (
        <Suspense fallback={<div className="ruota-attesa" aria-hidden="true" />}>
          <DomandaRuota
            key={`${giro?.n}-${giro?.stato}`}
            sfida={sfida}
            inviando={inviando}
            onRispondi={rispondi}
            onTorna={() => setInDomanda(false)}
          />
        </Suspense>
      ) : (
        <div className="ruota-pagina">
          <div className={`ruota-campo${moneta ? ' is-moneta' : ''}`}>
            <span className="ruota-campo__luce" aria-hidden="true" />
            {stato ? (
              <Ruota
                fermaSu={giro?.spicchio ?? null}
                giro={giro?.n}
                anima={anima}
                onFerma={ferma}
                mozzo={mozzo.testo}
                mozzoSotto={mozzo.sotto}
              />
            ) : (
              <div className="ruota-campo__attesa" aria-hidden="true" />
            )}
            {moneta && sfida?.tipo === 'moneta' && (
              <div className="ruota-campo__moneta">
                <Moneta uscito={sfida.uscito} lancia={lancio} onFerma={cade} />
              </div>
            )}
          </div>

          <section className="ruota-pannello" aria-live="polite">
            {errore ? (
              <p className="ruota-pannello__nota">{errore}</p>
            ) : !stato ? null : girando && giro ? (
              <p className="ruota-pannello__nota">
                Puntata di <span className="u-tabnum">{giro.puntata}</span> punti
              </p>
            ) : moneta && sfida?.tipo === 'moneta' && giro ? (
              <div className="ruota-sfida">
                <p className="ruota-sfida__titolo">Testa o croce</p>
                <p className="ruota-sfida__posta">
                  {conSegno(sfida.posta)} se indovini, {conSegno(-sfida.posta)} se no
                </p>
                <div className="ruota-sfida__lati">
                  {(['testa', 'croce'] as const).map((lato) => (
                    <Button
                      key={lato}
                      size="lg"
                      fullWidth
                      variant={sfida.scelto === lato ? 'filled' : sfida.scelto ? 'plain' : 'tinted'}
                      disabled={inviando || giro.stato !== 'sfida'}
                      onClick={() => void lancia(lato)}
                    >
                      {lato === 'testa' ? 'Testa' : 'Croce'}
                    </Button>
                  ))}
                </div>
              </div>
            ) : sfida?.tipo === 'domanda' && giro && giro.stato !== 'fatto' ? (
              <div className="ruota-sfida">
                <p className="ruota-sfida__titolo">Domanda di {NOMI_MATERIE_RUOTA[sfida.materia].toLowerCase()}</p>
                <p className="ruota-sfida__posta">
                  {conSegno(sfida.posta)} se rispondi giusto, {conSegno(-sfida.posta)} se sbagli
                </p>
                {giro.stato === 'domanda' ? (
                  <Button size="lg" fullWidth onClick={() => setInDomanda(true)}>
                    Torna alla domanda
                  </Button>
                ) : (
                  <Button size="lg" fullWidth onClick={() => void apri()} loading={inviando}>
                    Via
                  </Button>
                )}
              </div>
            ) : !puoGirare ? (
              <PochiPunti saldo={saldo} onClassificate={() => vai(ROTTE.home)}>
                <Conto netto={stato.netto} giri={stato.giri} />
              </PochiPunti>
            ) : (
              <>
                <LineaPuntata min={PUNTATA_MINIMA} max={saldo} valore={scelta} onChange={scegli} />
                <Button size="lg" fullWidth onClick={() => void gira()} loading={inviando} disabled={!pronta}>
                  Gira
                </Button>
                <Conto netto={stato.netto} giri={stato.giri} />
              </>
            )}
          </section>
        </div>
      )}

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
      <ComeSiGiocaRuota open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

function PochiPunti({
  saldo,
  onClassificate,
  children,
}: {
  saldo: number
  onClassificate: () => void
  children: ReactNode
}) {
  return (
    <div className="ruota-sfida">
      <p className="ruota-sfida__titolo">Servono {PUNTATA_MINIMA} punti</p>
      <p className="ruota-sfida__posta">{saldo > 0 ? `Ne hai ${saldo}.` : 'Fai punti nelle classificate.'}</p>
      <Button size="lg" fullWidth variant="tinted" onClick={onClassificate}>
        Alle classificate
      </Button>
      {children}
    </div>
  )
}

/** Quel che Crazy Time ha dato o tolto oggi, e in quanti giri. Prima del primo giro non c'e'. */
function Conto({ netto, giri }: { netto: number; giri: number }) {
  if (giri === 0) return null
  const tono = netto > 0 ? ' is-piu' : netto < 0 ? ' is-meno' : ''
  return (
    <p className="ruota-pannello__conto">
      Oggi <span className={`ruota-pannello__netto u-tabnum${tono}`}>{conSegno(netto)}</span> in{' '}
      <span className="u-tabnum">{giri}</span> {giri === 1 ? 'giro' : 'giri'}
    </p>
  )
}
