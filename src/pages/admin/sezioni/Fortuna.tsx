import { useState } from 'react'
import type { AdminFortuna, AdminFortunaGioco } from '@shared/admin'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useAdmin } from '../dati'
import { conSegno, delMese, giorno, giornoIntero, numero, settimana } from '../formato'
import { GraficoDivergente } from '../Grafici'
import { Carta, Cifra, Cifre, Gioco, Stato } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

type Quando = 'oggi' | 'sempre'

/**
 * I giochi della Fortuna dalla parte del banco: quanti giocano, quante
 * giocate, e il netto — quel che i giocatori hanno vinto meno quel che hanno
 * perso. Il banco ha guadagnato il contrario, e si legge li' accanto: la resa
 * dei giochi e' sotto la puntata per costruzione, e se il banco perde per
 * giorni qualcosa non va.
 */
export default function Fortuna() {
  const d = useAdmin<AdminFortuna>('/fortuna')
  const [quando, setQuando] = useState<Quando>('oggi')
  return (
    <Schermata titolo="Fortuna" aggiorna={aggiornaDa(d)}>
      <ConDati d={d}>
        {(f) => {
          const banco = (righe: AdminFortunaGioco[]) => -righe.reduce((s, r) => s + r.netto, 0)
          const righe = [...(quando === 'oggi' ? f.oggi : f.sempre)].sort((a, b) => b.giocate - a.giocate)
          const bancoTrenta = -f.serie.reduce((s, x) => s + x.valore, 0)
          return (
            <>
              <Cifre>
                <Cifra
                  etichetta="Il banco oggi"
                  valore={conSegno(banco(f.oggi))}
                  sotto={<Esito banco={banco(f.oggi)} />}
                />
                <Cifra etichetta="In 30 giorni" valore={conSegno(bancoTrenta)} sotto={<Esito banco={bancoTrenta} />} />
                <Cifra
                  etichetta="Da sempre"
                  valore={conSegno(banco(f.sempre))}
                  sotto={<Esito banco={banco(f.sempre)} />}
                />
                <Cifra
                  etichetta="Giocate oggi"
                  valore={numero(f.oggi.reduce((s, r) => s + r.giocate, 0))}
                  sotto={`${numero(Math.max(0, ...f.oggi.map((r) => r.giocatori)))} giocatori al più`}
                />
              </Cifre>

              <Carta
                titolo="Per gioco"
                azioni={
                  <div className="adm-segmentato">
                    <SegmentedControl<Quando>
                      ariaLabel="Periodo"
                      value={quando}
                      onChange={setQuando}
                      options={[
                        { value: 'oggi', label: 'Oggi' },
                        { value: 'sempre', label: 'Da sempre' },
                      ]}
                    />
                  </div>
                }
              >
                {righe.length === 0 ? (
                  <p className="adm-vuoto-piccolo">Nessuna giocata.</p>
                ) : (
                  <div className="adm-tabella-scorre">
                    <table className="adm-tabella">
                      <thead>
                        <tr>
                          <th scope="col">Gioco</th>
                          <th scope="col" className="is-numero">
                            Giocatori
                          </th>
                          <th scope="col" className="is-numero">
                            Giocate
                          </th>
                          <th scope="col" className="is-numero is-largo">
                            Giocatori, netto
                          </th>
                          <th scope="col" className="is-numero">
                            Banco
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {righe.map((r) => (
                          <tr key={r.gioco}>
                            <th scope="row">
                              <Gioco gioco={r.gioco} lato={22} />
                            </th>
                            <td className="is-numero">{numero(r.giocatori)}</td>
                            <td className="is-numero">{numero(r.giocate)}</td>
                            <td className="is-numero is-largo">{conSegno(r.netto)}</td>
                            <td className="is-numero">
                              <Segno n={-r.netto} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Carta>

              <Carta titolo="Il netto dei giocatori" sotto="Ultimi 30 giorni: sopra hanno vinto loro, sotto il banco">
                <GraficoDivergente
                  titolo="Netto dei giocatori alla Fortuna, ultimi 30 giorni"
                  punti={f.serie.map((s) => ({
                    etichetta: `${settimana(s.data)} ${giorno(s.data)}`,
                    asse: delMese(s.data),
                    valore: s.valore,
                  }))}
                  sopra={{ nome: 'Hanno vinto i giocatori', colore: 'var(--adm-serie-1)' }}
                  sotto={{ nome: 'Ha vinto il banco', colore: 'var(--adm-negativo)' }}
                  formato={conSegno}
                  evidenzia={f.serie.length - 1}
                />
              </Carta>

              <Carta titolo="SuperEnalotto" sotto="Il jackpot del prossimo concorso">
                <p className="adm-jackpot">
                  {numero(f.enalotto.jackpot)} <span>punti</span>
                </p>
                {f.enalotto.concorsi.length > 0 && (
                  <ul className="adm-concorsi">
                    {f.enalotto.concorsi.map((k) => (
                      <li key={k.numero} className="adm-concorsi__riga">
                        <div className="adm-concorsi__testa">
                          <span className="adm-concorsi__data">
                            {giornoIntero(k.data)} <span className="is-tenue">· n. {numero(k.numero)}</span>
                          </span>
                          {k.pagato ? (
                            <Stato tono="buono">Pagato</Stato>
                          ) : k.estratti ? (
                            <Stato tono="avviso">Da pagare</Stato>
                          ) : (
                            <Stato tono="neutro">Da estrarre</Stato>
                          )}
                        </div>
                        {k.estratti && (
                          <ol className="adm-palline" aria-label="Numeri estratti">
                            {k.estratti.map((n) => (
                              <li key={n} className="u-tabnum">
                                {n}
                              </li>
                            ))}
                          </ol>
                        )}
                        <p className="adm-concorsi__conti">
                          {numero(k.schede)} schede · raccolta {numero(k.raccolta)} · {numero(k.vincitori)}{' '}
                          {k.vincitori === 1 ? 'vincitore' : 'vincitori'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Carta>
            </>
          )
        }}
      </ConDati>
    </Schermata>
  )
}

/** Il banco in una parola, con la sua icona: il segno da solo si legge male. */
function Esito({ banco }: { banco: number }) {
  if (banco > 0) return <Stato tono="buono">Il banco guadagna</Stato>
  if (banco < 0) return <Stato tono="avviso">Il banco perde</Stato>
  return <Stato tono="neutro">Pari</Stato>
}

function Segno({ n }: { n: number }) {
  return <span className={`adm-segno${n > 0 ? ' is-piu' : n < 0 ? ' is-meno' : ''}`}>{conSegno(n)}</span>
}
