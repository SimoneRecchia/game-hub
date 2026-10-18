import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import type { AdminDatabase, AdminSqlRisultato } from '@shared/admin'
import { MASSIMO_RIGHE_SQL } from '@shared/admin'
import { Button } from '@/components/Button'
import { Interruttore } from '@/components/Interruttore'
import { IconCopy, IconPlay } from '@/components/Icons'
import { messaggioDi, useAdmin, useChiama, useCopia } from '../dati'
import { byte, durata, numero } from '../formato'
import { Carta, Conferma, Scelta, Stato } from '../pezzi'
import { Schermata } from '../Schermata'
import { primeRighe } from './Database'

/** Le ultime query, su questo dispositivo: per rilanciarle senza riscriverle. */
const CHIAVE_RECENTI = 'adm-sql-recenti'
const RECENTI = 8

function leggiRecenti(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHIAVE_RECENTI) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENTI) : []
  } catch {
    return []
  }
}

function salvaRecente(sql: string): string[] {
  const dopo = [sql, ...leggiRecenti().filter((x) => x !== sql)].slice(0, RECENTI)
  try {
    localStorage.setItem(CHIAVE_RECENTI, JSON.stringify(dopo))
  } catch {
    // Senza memoria non ci sono le recenti: la console funziona lo stesso.
  }
  return dopo
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Un valore di una cella, come lo si legge: NULL in corsivo, gli oggetti in JSON. */
function testoDi(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * La console SQL sul database di produzione. Di partenza legge soltanto: il
 * server lascia passare SELECT, WITH, EXPLAIN e PRAGMA. Con "Scrittura"
 * acceso passa tutto, e prima di ogni esecuzione si conferma con la query
 * sotto gli occhi; ogni scrittura finisce nel registro. Un'istruzione alla
 * volta, perché D1 non ne prepara due insieme.
 */
export default function Console() {
  const { state } = useLocation()
  const iniziale = (state as { sql?: string } | null)?.sql
  const chiama = useChiama()
  const copia = useCopia()
  const db = useAdmin<AdminDatabase>('/database')
  const [sql, setSql] = useState(() => iniziale ?? leggiRecenti()[0] ?? '')
  const [scrittura, setScrittura] = useState(false)
  const [risultato, setRisultato] = useState<AdminSqlRisultato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [conferma, setConferma] = useState(false)
  const [recenti, setRecenti] = useState(leggiRecenti)
  const area = useRef<HTMLTextAreaElement>(null)
  const partita = useRef(false)

  // Da "Prime 100 righe" la query e' gia' pronta: parte da sola, perché e' una lettura. Una volta sola,
  // anche dove React monta due volte (in sviluppo).
  useEffect(() => {
    if (partita.current) return
    partita.current = true
    if (iniziale) void esegui(iniziale, false)
    // Sul telefono il fuoco aprirebbe la tastiera sopra la pagina appena arrivata.
    else if (window.matchMedia('(pointer: fine)').matches) area.current?.focus({ preventScroll: true })
  }, [])

  async function esegui(testo: string, scrivi: boolean) {
    const q = testo.trim()
    if (!q) return
    setOccupato(true)
    setErrore(null)
    try {
      const r = await chiama<AdminSqlRisultato>('/sql', { method: 'POST', body: { sql: q, scrittura: scrivi } })
      setRisultato(r)
      setRecenti(salvaRecente(q))
    } catch (e) {
      setRisultato(null)
      setErrore(messaggioDi(e))
    } finally {
      setOccupato(false)
      setConferma(false)
    }
  }

  const avvia = () => {
    if (!sql.trim() || occupato) return
    if (scrittura) setConferma(true)
    else void esegui(sql, false)
  }

  const tasti = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      avvia()
    }
  }

  const tsv = () =>
    risultato
      ? [
          risultato.colonne.join('\t'),
          ...risultato.righe.map((r) => r.map((v) => testoDi(v).replace(/[\t\n]/g, ' ')).join('\t')),
        ].join('\n')
      : ''

  const tabelle = db.dati?.tabelle ?? []

  return (
    <Schermata titolo="Console SQL" sotto="Sul database di produzione">
      <Carta className={`adm-console${scrittura ? ' is-scrittura' : ''}`}>
        <div className="adm-console__barra">
          {tabelle.length > 0 ? (
            <Scelta
              etichetta="Prime 100 righe di una tabella"
              valore=""
              voci={[
                { valore: '', nome: 'Prime 100 righe di…' },
                ...tabelle.map((t) => ({ valore: t.nome, nome: t.nome })),
              ]}
              onCambia={(t) => {
                if (!t) return
                const q = primeRighe(t)
                setSql(q)
                setScrittura(false)
                void esegui(q, false)
              }}
            />
          ) : (
            <span />
          )}
          <label className="adm-console__scrittura">
            <span>Scrittura</span>
            <Interruttore acceso={scrittura} onCambia={setScrittura} etichetta="Scrittura" />
          </label>
        </div>
        <label htmlFor="adm-sql" className="u-visually-hidden">
          Query SQL
        </label>
        <textarea
          id="adm-sql"
          ref={area}
          className="adm-console__area"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={tasti}
          placeholder="SELECT nickname, created_at FROM players ORDER BY created_at DESC LIMIT 20"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          rows={6}
        />
        <div className="adm-console__piede">
          {scrittura ? (
            <Stato tono="avviso">Può modificare i dati</Stato>
          ) : (
            <span className="adm-console__aiuto">Solo lettura · {MAC ? '⌘' : 'Ctrl'} + Invio</span>
          )}
          <Button
            variant={scrittura ? 'destructive' : 'filled'}
            loading={occupato}
            disabled={!sql.trim()}
            onClick={avvia}
          >
            <IconPlay size={16} />
            Esegui
          </Button>
        </div>
      </Carta>

      {errore && (
        <Carta className="adm-console__errore">
          <p role="alert" data-selezionabile>
            {errore}
          </p>
        </Carta>
      )}

      {risultato && (
        <Carta
          titolo={
            risultato.colonne.length === 0
              ? 'Fatto'
              : `${numero(risultato.righe.length)} ${risultato.righe.length === 1 ? 'riga' : 'righe'}`
          }
          sotto={
            <span className="adm-console__meta">
              <span>{numero(risultato.meta.righeLette)} lette</span>
              <span>{numero(risultato.meta.righeScritte)} scritte</span>
              {risultato.meta.modifiche > 0 && <span>{numero(risultato.meta.modifiche)} modificate</span>}
              <span>{durata(risultato.meta.durataMs)}</span>
              {risultato.meta.dimensione !== null && <span>database {byte(risultato.meta.dimensione)}</span>}
            </span>
          }
          azioni={
            risultato.colonne.length > 0 && (
              <button type="button" className="adm-bottoncino" onClick={() => void copia(tsv(), 'Righe copiate')}>
                <IconCopy size={14} />
                Copia
              </button>
            )
          }
        >
          {risultato.troncato && (
            <p className="adm-console__troncato">
              <Stato tono="avviso">{`Solo le prime ${numero(MASSIMO_RIGHE_SQL)}`}</Stato> Aggiungi un LIMIT per vedere
              le altre.
            </p>
          )}
          {risultato.colonne.length > 0 && (
            <div className="adm-risultati" tabIndex={0} aria-label="Risultati">
              <table>
                <thead>
                  <tr>
                    <th scope="col" className="adm-risultati__n">
                      #
                    </th>
                    {risultato.colonne.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-selezionabile>
                  {risultato.righe.map((r, i) => (
                    <tr key={i}>
                      <td className="adm-risultati__n">{i + 1}</td>
                      {r.map((v, k) => {
                        const t = testoDi(v)
                        return (
                          <td
                            key={k}
                            className={
                              v === null || v === undefined
                                ? 'is-null'
                                : typeof v === 'number'
                                  ? 'is-numero'
                                  : undefined
                            }
                            title={t.length > 40 ? t : undefined}
                          >
                            {t}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Carta>
      )}

      {recenti.length > 0 && (
        <Carta titolo="Recenti" sotto="Su questo dispositivo">
          <ul className="adm-recenti">
            {recenti.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  className="adm-recenti__voce adm-mono"
                  onClick={() => {
                    setSql(q)
                    area.current?.focus()
                  }}
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </Carta>
      )}

      <Conferma
        aperta={conferma}
        titolo="Eseguire sul database?"
        testo="La query può cambiare o cancellare i dati di produzione, e finisce nel registro."
        azione="Esegui"
        occupato={occupato}
        onConferma={() => void esegui(sql, true)}
        onChiudi={() => setConferma(false)}
      >
        <pre className="adm-conferma__sql" data-selezionabile>
          {sql.trim()}
        </pre>
      </Conferma>
    </Schermata>
  )
}
