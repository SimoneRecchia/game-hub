import { useState } from 'react'
import type { AdminConteggi, AdminDatabase, AdminTabella } from '@shared/admin'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { IconChevronRight } from '@/components/Icons'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useToast } from '@/components/Toast'
import { messaggioDi, useAdmin, useChiama } from '../dati'
import { byte, compatto, data, numero } from '../formato'
import { Misura } from '../Grafici'
import { IconaCerca, IconaConsole } from '../icone'
import { Carta, Cifra, Cifre, Codice, Stato } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

/** Quante tabelle si contano in una richiesta: il server ne accetta quaranta. */
const PER_VOLTA = 40

/** Le righe contate restano finché la scheda e' aperta: contarle costa letture, e non cambiano in un attimo. */
let contate: Record<string, number> = {}

/** La query che la console riceve da "Prime 100 righe". */
export const primeRighe = (tabella: string) => `SELECT * FROM "${tabella.replace(/"/g, '""')}" LIMIT 100`

/**
 * Il database: quanto e' pieno, le tabelle con le loro colonne e il loro
 * SQL, le migrazioni. Le righe di ogni tabella si contano solo a richiesta,
 * perché contarle legge la tabella intera e le letture di D1 sono contate.
 */
export default function Database() {
  const d = useAdmin<AdminDatabase>('/database')
  const chiama = useChiama()
  const toast = useToast()
  const { vai } = useNavigazione()
  const [righe, setRighe] = useState<Record<string, number>>(contate)
  const [conto, setConto] = useState<{ fatte: number; di: number } | null>(null)
  const [cerca, setCerca] = useState('')
  const [ordine, setOrdine] = useState<'nome' | 'righe'>('nome')
  const [aperta, setAperta] = useState<string | null>(null)
  const [tutte, setTutte] = useState(false)

  async function conta(tabelle: AdminTabella[]) {
    const nomi = tabelle.map((t) => t.nome)
    setConto({ fatte: 0, di: nomi.length })
    try {
      for (let i = 0; i < nomi.length; i += PER_VOLTA) {
        const gruppo = nomi.slice(i, i + PER_VOLTA)
        const r = await chiama<AdminConteggi>(`/database/righe?tabelle=${encodeURIComponent(gruppo.join(','))}`)
        contate = { ...contate, ...r.conteggi }
        setRighe(contate)
        setConto({ fatte: Math.min(nomi.length, i + PER_VOLTA), di: nomi.length })
      }
      setOrdine('righe')
    } catch (e) {
      toast.show(messaggioDi(e), 'error', 3200)
    } finally {
      setConto(null)
    }
  }

  return (
    <Schermata titolo="Database" aggiorna={aggiornaDa(d)}>
      <ConDati d={d}>
        {(db) => {
          const totaleRighe = Object.values(righe).reduce((s, n) => s + n, 0)
          const contatoTutto = db.tabelle.every((t) => righe[t.nome] !== undefined)
          const massimo = Math.max(1, ...db.tabelle.map((t) => righe[t.nome] ?? 0))
          const filtro = cerca.trim().toLowerCase()
          const tabelle = db.tabelle
            .filter(
              (t) =>
                !filtro ||
                t.nome.toLowerCase().includes(filtro) ||
                t.colonne.some((c) => c.toLowerCase().includes(filtro)),
            )
            .sort((a, b) =>
              ordine === 'righe'
                ? (righe[b.nome] ?? -1) - (righe[a.nome] ?? -1) || a.nome.localeCompare(b.nome)
                : a.nome.localeCompare(b.nome),
            )
          const applicate = db.migrazioni.filter((m) => m.applicataIl !== null).length
          const daApplicare = db.migrazioni.length - applicate
          const migrazioni = [...db.migrazioni].sort((a, b) => b.nome.localeCompare(a.nome))
          return (
            <>
              <Carta>
                <Misura etichetta="Spazio usato" valore={db.dimensione} limite={db.limite} formato={byte} />
              </Carta>
              <Cifre>
                <Cifra etichetta="Tabelle" valore={numero(db.tabelle.length)} />
                <Cifra
                  etichetta="Righe"
                  valore={contatoTutto ? numero(totaleRighe) : '—'}
                  sotto={contatoTutto ? 'in tutte le tabelle' : 'da contare'}
                />
                <Cifra
                  etichetta="Migrazioni"
                  valore={numero(applicate)}
                  sotto={
                    daApplicare > 0 ? <Stato tono="avviso">{`${daApplicare} da applicare`}</Stato> : 'tutte applicate'
                  }
                />
              </Cifre>

              <Carta
                titolo="Le tabelle"
                azioni={
                  <Button variant="tinted" loading={conto !== null} onClick={() => void conta(db.tabelle)}>
                    {contatoTutto ? 'Conta di nuovo' : 'Conta le righe'}
                  </Button>
                }
                sotto={conto ? `Conto… ${conto.fatte} di ${conto.di}` : 'Contare le righe legge ogni tabella'}
              >
                <div className="adm-filtri adm-filtri--carta">
                  <label className="adm-cerca">
                    <IconaCerca size={17} />
                    <span className="u-visually-hidden">Cerca una tabella</span>
                    <input
                      type="search"
                      value={cerca}
                      onChange={(e) => setCerca(e.target.value)}
                      placeholder="Tabella o colonna"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                  {Object.keys(righe).length > 0 && (
                    <div className="adm-segmentato">
                      <SegmentedControl
                        ariaLabel="Ordine"
                        value={ordine}
                        onChange={setOrdine}
                        options={[
                          { value: 'nome', label: 'Nome' },
                          { value: 'righe', label: 'Righe' },
                        ]}
                      />
                    </div>
                  )}
                </div>
                <ul className="adm-tabelle">
                  {tabelle.map((t) => {
                    const n = righe[t.nome]
                    const aperto = aperta === t.nome
                    return (
                      <li key={t.nome} className={`adm-tabelle__voce${aperto ? ' is-aperta' : ''}`}>
                        <button
                          type="button"
                          className="adm-tabelle__testa"
                          aria-expanded={aperto}
                          onClick={() => setAperta(aperto ? null : t.nome)}
                        >
                          <IconChevronRight size={14} className="adm-tabelle__chevron" />
                          <span className="adm-tabelle__nome adm-mono adm-tronca">{t.nome}</span>
                          <span className="adm-tabelle__conti">
                            {t.colonne.length} col · {t.indici} {t.indici === 1 ? 'indice' : 'indici'}
                          </span>
                          <span className="adm-tabelle__righe">
                            {n !== undefined && (
                              <span className="adm-tacchette" aria-hidden="true">
                                <span style={{ width: `${(n / massimo) * 100}%` }} />
                              </span>
                            )}
                            <span className="u-tabnum" title={n !== undefined ? `${numero(n)} righe` : undefined}>
                              {n === undefined ? '' : compatto(n)}
                            </span>
                          </span>
                        </button>
                        {aperto && (
                          <div className="adm-tabelle__corpo">
                            <ul className="adm-colonne" aria-label="Colonne">
                              {t.colonne.map((c) => (
                                <li key={c} className="adm-chip-codice">
                                  {c}
                                </li>
                              ))}
                            </ul>
                            <Codice testo={t.sql} alto={260} etichetta="Copia lo SQL" />
                            <div>
                              <Button
                                variant="tinted"
                                onClick={() =>
                                  vai(ROTTE.admin('sql'), {
                                    direzione: 'scheda',
                                    replace: true,
                                    state: { sql: primeRighe(t.nome) },
                                  })
                                }
                              >
                                <IconaConsole size={18} />
                                Prime 100 righe
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {tabelle.length === 0 && <p className="adm-vuoto-piccolo">Nessuna tabella così.</p>}
              </Carta>

              <Carta
                titolo="Le migrazioni"
                sotto={`${numero(applicate)} applicate${daApplicare > 0 ? `, ${daApplicare} no` : ''}`}
              >
                <ul className="adm-migrazioni">
                  {(tutte ? migrazioni : migrazioni.slice(0, 6)).map((m) => (
                    <li key={m.nome}>
                      <span className="adm-mono adm-tronca">{m.nome}</span>
                      {m.applicataIl ? (
                        <span className="is-tenue">{data(m.applicataIl)}</span>
                      ) : (
                        <Stato tono="avviso">Da applicare</Stato>
                      )}
                    </li>
                  ))}
                </ul>
                {migrazioni.length > 6 && (
                  <button type="button" className="adm-link adm-link--bottone" onClick={() => setTutte(!tutte)}>
                    {tutte ? 'Mostra le ultime' : `Mostra tutte (${migrazioni.length})`}
                  </button>
                )}
              </Carta>
            </>
          )
        }}
      </ConDati>
    </Schermata>
  )
}
