import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
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
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { formatCountdown } from '@/lib/format'
import {
  NOMI_MATERIE_RUOTA,
  PUNTATA_MINIMA,
  SPICCHI,
  conSegno,
  eSfida,
  type LatoMoneta,
} from '@shared/ruota'
import type { GiroRuota, RuotaStato } from '@shared/types'
import './Ruota.css'

const DomandaRuota = lazy(() => import('@/games/ruota/DomandaRuota'))

/** Quanto resta un adesivo. */
const ADESIVO_MS = 2_200
/** Quanto resta in vista la moneta caduta, prima di tornare alla ruota: il lato uscito si deve vedere. */
const MONETA_CADUTA_MS = 1_400

/** L'adesivo dell'esito di un giro: vivace se da', bordato se toglie o lascia com'e'. */
function adesivoDi(giro: GiroRuota): Omit<DatiAdesivo, 'id'> {
  const s = SPICCHI[giro.spicchio]
  const sotto = `${conSegno(giro.delta)} punti`
  const bene = giro.delta > 0
  const base = { durata: ADESIVO_MS, sotto, tono: bene ? ('vivace' as const) : ('bordato' as const) }
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
  return { ...base, titolo: 'Niente', sotto: 'Tutto com’è', colore: 'var(--label-secondary)' }
}

/** L'adesivo di una sfida appena uscita: la ruota si e' fermata su testa o croce, o su una domanda. */
function adesivoSfida(giro: GiroRuota): Omit<DatiAdesivo, 'id'> | null {
  const s = SPICCHI[giro.spicchio]
  if (!eSfida(s)) return null
  return {
    durata: ADESIVO_MS,
    tono: 'vivace',
    titolo: s.tipo === 'domanda' ? NOMI_MATERIE_RUOTA[s.materia] : 'Testa o croce',
    sotto: `${conSegno(s.posta)} o ${conSegno(-s.posta)}`,
    colore: s.tipo === 'domanda' ? COLORI_MATERIE_RUOTA[s.materia] : 'var(--ruota-moneta)',
    suono: 'invito',
  }
}

/**
 * La ruota del giorno: si punta, si gira, e si gioca la sfida se la ruota si
 * ferma su una. Il server decide tutto e risponde con lo stato intero; qui si
 * fa vedere, nell'ordine giusto: prima la ruota che gira, poi l'esito.
 */
export default function RuotaPagina() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const [stato, setStato] = useState<RuotaStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [puntata, setPuntata] = useState<number | null>(null)
  const [inviando, setInviando] = useState(false)
  /** La ruota sta girando verso lo spicchio del giro: l'esito si vede quando si ferma. */
  const [girando, setGirando] = useState(false)
  const [anima, setAnima] = useState(false)
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

  const festeggia = useCallback(() => {
    setFesta(true)
    window.setTimeout(() => setFesta(false), DURATA_FESTA_MS)
  }, [])

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
  const puntiDiOggi = stato?.puntiDiOggi ?? 0
  const puoGirare = puntiDiOggi >= PUNTATA_MINIMA
  // Si punta quanto si vuole, dalla minima a tutti. Si propone tutto: il x2 e' il solo spicchio che guarda la
  // puntata, e non toglie.
  const scelta = puntata === null ? puntiDiOggi : Math.min(puntiDiOggi, Math.max(PUNTATA_MINIMA, puntata))

  const gira = async () => {
    const nuovo = await chiedi('/ruota/gira', { puntata: scelta })
    if (!nuovo?.giro) return
    setAnima(true)
    setGirando(true)
    setStato(nuovo)
  }

  const ferma = useCallback(() => {
    setGirando(false)
    const g = ultimo.current?.giro
    if (!g) return
    if (g.stato !== 'fatto') {
      const annuncio = adesivoSfida(g)
      if (annuncio) accoda(annuncio)
      return
    }
    accoda(adesivoDi(g))
    if (SPICCHI[g.spicchio].tipo === 'doppio') festeggia()
  }, [accoda, festeggia])

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
    if (g) {
      accoda(adesivoDi(g))
      if (g.delta > 0) festeggia()
    }
  }, [accoda, festeggia])

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
      accoda(adesivoDi(nuovo.giro))
      if (nuovo.giro.delta > 0) festeggia()
    },
    [chiedi, accoda, festeggia],
  )

  const mostraDomanda = inDomanda && sfida?.tipo === 'domanda' && sfida.domanda !== null
  const moneta = sfida?.tipo === 'moneta' && !girando && (giro?.stato === 'sfida' || lancio || caduta)
  const fatto = giro?.stato === 'fatto' && !girando && !lancio && !caduta
  // Sul mozzo la puntata finché la ruota gira, poi l'esito; durante una sfida, la sfida.
  const mozzo = !giro
    ? puoGirare
      ? { testo: String(scelta), sotto: 'puntata' }
      : { testo: String(puntiDiOggi), sotto: 'punti' }
    : girando
      ? { testo: String(giro.puntata), sotto: 'puntata' }
      : fatto
        ? { testo: conSegno(giro.delta), sotto: 'punti' }
        : { testo: '?', sotto: 'sfida' }

  return (
    <Pagina
      titolo="Ruota"
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
            key={giro?.stato}
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
            ) : !stato ? null : !giro ? (
              !puoGirare ? (
                <PochiPunti punti={puntiDiOggi} onClassificate={() => vai(ROTTE.home)} />
              ) : (
                <>
                  <LineaPuntata min={PUNTATA_MINIMA} max={puntiDiOggi} valore={scelta} onChange={setPuntata} />
                  <Button size="lg" fullWidth onClick={() => void gira()} loading={inviando}>
                    Gira
                  </Button>
                </>
              )
            ) : girando ? (
              <p className="ruota-pannello__nota">
                Puntata di <span className="u-tabnum">{giro.puntata}</span> punti
              </p>
            ) : moneta && sfida?.tipo === 'moneta' ? (
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
            ) : sfida?.tipo === 'domanda' && giro.stato !== 'fatto' ? (
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
            ) : (
              <Esito giro={giro} puntiDiOggi={stato.puntiDiOggi} msToNext={stato.msToNextPuzzle} />
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

function PochiPunti({ punti, onClassificate }: { punti: number; onClassificate: () => void }) {
  return (
    <div className="ruota-sfida">
      <p className="ruota-sfida__titolo">Servono {PUNTATA_MINIMA} punti di oggi</p>
      <p className="ruota-sfida__posta">
        {punti > 0 ? `Per ora ne hai ${punti}.` : 'Gioca le classificate, poi torna qui.'}
      </p>
      <Button size="lg" fullWidth variant="tinted" onClick={onClassificate}>
        Alle classificate
      </Button>
    </div>
  )
}

/** Dove si e' fermata: il x2 con la puntata, la sfida con com'e' andata, o niente. */
function doveSiEFermata(giro: GiroRuota): string {
  const sfida = giro.sfida
  if (SPICCHI[giro.spicchio].tipo === 'doppio') return `x2 sulla puntata di ${giro.puntata}`
  if (sfida?.tipo === 'moneta' && sfida.scelto && sfida.uscito) {
    return sfida.scelto === sfida.uscito
      ? `Testa o croce · è uscita ${sfida.uscito}`
      : `Testa o croce · hai scelto ${sfida.scelto}, è uscita ${sfida.uscito}`
  }
  if (sfida?.tipo === 'domanda' && sfida.risposta) {
    const { giusta, scelta } = sfida.risposta
    const materia = NOMI_MATERIE_RUOTA[sfida.materia].toLowerCase()
    return `Domanda di ${materia} · ${giusta ? 'giusta' : scelta === null ? 'tempo scaduto' : 'sbagliata'}`
  }
  return 'Niente'
}

/** Com'e' andata: dove si e' fermata, quel che ha dato o tolto, i punti di oggi e quando torna la ruota. */
function Esito({ giro, puntiDiOggi, msToNext }: { giro: GiroRuota; puntiDiOggi: number; msToNext: number }) {
  const restano = useCountdown(msToNext)
  const tono = giro.delta > 0 ? ' is-piu' : giro.delta < 0 ? ' is-meno' : ''
  const dove = doveSiEFermata(giro)
  return (
    <div className="ruota-esito">
      <p className="ruota-esito__spicchio">{dove}</p>
      <p className={`ruota-esito__delta u-tabnum${tono}`}>
        {conSegno(giro.delta)} <span>punti</span>
      </p>
      <p className="ruota-esito__nota">
        Oggi <span className="u-tabnum">{puntiDiOggi + giro.delta}</span> punti · la ruota torna fra{' '}
        <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
    </div>
  )
}
