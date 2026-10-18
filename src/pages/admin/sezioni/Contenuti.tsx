import { useLayoutEffect, useRef, useState } from 'react'
import type { AdminContenuti, AdminContenuto, ContenutoDelGiorno } from '@shared/admin'
import { Button } from '@/components/Button'
import { IconCheck, IconClose } from '@/components/Icons'
import { Sheet } from '@/components/Sheet'
import { messaggioDi, useAdmin, useChiama } from '../dati'
import { delMese, giorno, giornoIntero, numero, settimana } from '../formato'
import { Carta, Codice, IconaGioco, Stato, nomeDi } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

/** Che cosa prepara la notte, per ogni contenuto: la riga sotto il nome. */
const COSA: Record<ContenutoDelGiorno, string> = {
  wordle: 'La parola',
  cruciverba: 'Lo schema',
  sudoku: 'Lo schema',
  quiz: 'Le dieci domande',
  ghigliottina: 'Le coppie e la vincente',
  catena: 'La catena',
  anagrammi: 'Le cinque parole',
  paroliere: 'La griglia',
  scarabeo: 'Il traguardo',
  'crazy-time': 'Le domande',
}

/** Sotto questa larghezza i giorni vanno in colonna e i giochi in riga, come un calendario. */
const LARGA = 640

/**
 * I contenuti del giorno, dai tre giorni passati ai quattordici che vengono:
 * verde se la notte li ha preparati, rosso se mancano. Oggi e' segnato, e
 * toccando una casella si apre il contenuto di quel giorno — con le soluzioni,
 * quindi dietro un bottone.
 */
export default function Contenuti() {
  const d = useAdmin<AdminContenuti>('/contenuti')
  const [aperta, setAperta] = useState<{
    contenuto: ContenutoDelGiorno
    numero: number
    data: string
    pronto: boolean
  } | null>(null)
  return (
    <Schermata titolo="Contenuti" aggiorna={aggiornaDa(d)}>
      <ConDati d={d}>
        {(c) => {
          const oggi = c.giorni.findIndex((g) => g.numero === c.oggi)
          const domani = oggi + 1
          const mancano = domani < c.giorni.length ? c.contenuti.filter((x) => !x.pronti[domani]) : []
          return (
            <>
              <Carta>
                <div className="adm-esito">
                  {mancano.length === 0 ? (
                    <Stato tono="buono">Domani è tutto pronto</Stato>
                  ) : (
                    <Stato tono="cattivo">
                      Per domani mancano: {mancano.map((m) => nomeDi(m.contenuto)).join(', ')}
                    </Stato>
                  )}
                </div>
                <Tabella c={c} oggi={oggi} onApri={setAperta} />
                <ul className="adm-legenda adm-legenda--sotto">
                  <li>
                    <span className="adm-cella is-pronto is-chiave" aria-hidden="true">
                      <IconCheck size={11} strokeWidth={3} />
                    </span>
                    Pronto
                  </li>
                  <li>
                    <span className="adm-cella is-manca is-chiave" aria-hidden="true">
                      <IconClose size={11} strokeWidth={3} />
                    </span>
                    Manca
                  </li>
                  <li>
                    <span className="adm-cella is-passato is-chiave" aria-hidden="true" />
                    Passato, senza
                  </li>
                </ul>
              </Carta>

              {c.scorte.length > 0 && (
                <Carta titolo="Le scorte delle libere" sotto="Quel che la notte tiene pieno">
                  <dl className="adm-voci">
                    {c.scorte.map((s) => (
                      <div key={s.nome} className="adm-voci__riga">
                        <dt>{s.nome}</dt>
                        <dd>
                          <span className="u-tabnum">{numero(s.quanti)}</span>
                          {s.quanti === 0 ? (
                            <Stato tono="cattivo">Finita</Stato>
                          ) : s.quanti < 10 ? (
                            <Stato tono="avviso">Quasi finita</Stato>
                          ) : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Carta>
              )}
            </>
          )
        }}
      </ConDati>
      <FoglioContenuto aperta={aperta} onChiudi={() => setAperta(null)} />
    </Schermata>
  )
}

type Apri = (cosa: { contenuto: ContenutoDelGiorno; numero: number; data: string; pronto: boolean }) => void

function Tabella({ c, oggi, onApri }: { c: AdminContenuti; oggi: number; onApri: Apri }) {
  const ref = useRef<HTMLDivElement>(null)
  const [larga, setLarga] = useState(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const misura = (w: number) => setLarga(w >= LARGA)
    misura(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(([v]) => misura(v.contentRect.width))
    o.observe(el)
    return () => o.disconnect()
  }, [])

  const cella = (k: number, i: number) => {
    const x = c.contenuti[k]
    const g = c.giorni[i]
    const pronto = x.pronti[i]
    const stato = pronto ? 'is-pronto' : i < oggi ? 'is-passato' : 'is-manca'
    const nome = `${nomeDi(x.contenuto)}, ${giornoIntero(g.data)}: ${pronto ? 'pronto' : 'manca'}`
    return (
      <button
        key={`${x.contenuto}-${g.numero}`}
        type="button"
        className={`adm-cella ${stato}${i === oggi ? ' is-oggi' : ''}`}
        aria-label={nome}
        title={nome}
        onClick={() => onApri({ contenuto: x.contenuto, numero: g.numero, data: g.data, pronto })}
      >
        {pronto ? <IconCheck size={12} strokeWidth={3} /> : i >= oggi ? <IconClose size={12} strokeWidth={3} /> : null}
      </button>
    )
  }

  const testaGiorno = (i: number) => {
    const g = c.giorni[i]
    return (
      <span key={g.numero} className={`adm-calendario__giorno${i === oggi ? ' is-oggi' : ''}`}>
        <span>{i === oggi ? 'Oggi' : settimana(g.data)}</span>
        <strong>{delMese(g.data)}</strong>
      </span>
    )
  }

  return (
    <div ref={ref} className="adm-calendario-cornice">
      {larga ? (
        <div
          className="adm-calendario"
          style={{ gridTemplateColumns: `minmax(9rem, 12rem) repeat(${c.giorni.length}, minmax(0, 1fr))` }}
        >
          <span />
          {c.giorni.map((_, i) => testaGiorno(i))}
          {c.contenuti.map((x, k) => (
            <div key={x.contenuto} className="adm-calendario__riga" role="group" aria-label={nomeDi(x.contenuto)}>
              <span className="adm-calendario__nome">
                <IconaGioco gioco={x.contenuto} lato={24} />
                <span className="adm-calendario__testo">
                  <span className="adm-tronca">{nomeDi(x.contenuto)}</span>
                  <span className="adm-calendario__cosa adm-tronca">{prontiFino(c, k, oggi)}</span>
                </span>
              </span>
              {c.giorni.map((_, i) => cella(k, i))}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="adm-calendario is-stretto"
          style={{ gridTemplateColumns: `3.5rem repeat(${c.contenuti.length}, minmax(0, 1fr))` }}
        >
          <span />
          {c.contenuti.map((x) => (
            <span key={x.contenuto} className="adm-calendario__icona" title={nomeDi(x.contenuto)}>
              <IconaGioco gioco={x.contenuto} lato={22} />
              <span className="u-visually-hidden">{nomeDi(x.contenuto)}</span>
            </span>
          ))}
          {c.giorni.map((g, i) => (
            <div key={g.numero} className="adm-calendario__riga" role="group" aria-label={giornoIntero(g.data)}>
              {testaGiorno(i)}
              {c.contenuti.map((_, k) => cella(k, i))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Fin dove e' pronto, da oggi senza buchi: "Pronto fino al 31 ott", "Manca oggi". */
function prontiFino(c: AdminContenuti, k: number, oggi: number): string {
  const pronti = c.contenuti[k].pronti
  if (oggi < 0) return COSA[c.contenuti[k].contenuto]
  if (!pronti[oggi]) return 'Manca oggi'
  let i = oggi
  while (i + 1 < pronti.length && pronti[i + 1]) i += 1
  return i === oggi ? 'Solo oggi' : `Fino al ${giorno(c.giorni[i].data)}`
}

/** Il contenuto di un giorno: le soluzioni si vedono solo chiedendole. */
function FoglioContenuto({
  aperta,
  onChiudi,
}: {
  aperta: { contenuto: ContenutoDelGiorno; numero: number; data: string; pronto: boolean } | null
  onChiudi: () => void
}) {
  const chiama = useChiama()
  const [dati, setDati] = useState<AdminContenuto | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [carico, setCarico] = useState(false)
  const chiave = aperta ? `${aperta.contenuto}/${aperta.numero}` : null
  const [visto, setVisto] = useState<string | null>(null)
  if (visto !== chiave) {
    setVisto(chiave)
    setDati(null)
    setErrore(null)
  }

  async function mostra() {
    if (!aperta) return
    setCarico(true)
    setErrore(null)
    try {
      setDati(await chiama<AdminContenuto>(`/contenuti/${aperta.contenuto}/${aperta.numero}`))
    } catch (e) {
      setErrore(messaggioDi(e))
    } finally {
      setCarico(false)
    }
  }

  return (
    <Sheet open={aperta !== null} onClose={onChiudi} title={aperta ? nomeDi(aperta.contenuto) : ''}>
      {aperta && (
        <>
          <p className="adm-foglio__sotto">
            {COSA[aperta.contenuto]} di {giornoIntero(aperta.data)} · giornata {numero(aperta.numero)}
          </p>
          {!aperta.pronto ? (
            <p className="adm-foglio__testo">Non c’è ancora: lo prepara il workflow della notte.</p>
          ) : dati ? (
            <Codice testo={JSON.stringify(dati.dati, null, 2)} alto={420} etichetta="Copia il JSON" />
          ) : (
            <div className="adm-spoiler">
              <span className="adm-spoiler__righe" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <p>Ci sono le soluzioni.</p>
              <Button variant="tinted" loading={carico} onClick={() => void mostra()}>
                Mostra la soluzione
              </Button>
            </div>
          )}
          {errore && (
            <p className="adm-foglio__errore" role="alert">
              {errore}
            </p>
          )}
        </>
      )}
    </Sheet>
  )
}
