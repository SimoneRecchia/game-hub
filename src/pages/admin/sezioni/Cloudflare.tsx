import { useState } from 'react'
import type { AdminCloudflare } from '@shared/admin'
import { LIMITI_GRATUITI } from '@shared/admin'
import { useAdmin, useChiama, messaggioDi } from '../dati'
import { byte, compatto, decimale, delMese, fa, giorno, numero, settimana } from '../formato'
import { GraficoColonne, GraficoLinee, Misura, type PuntoGrafico } from '../Grafici'
import { IconaAvviso, IconaEsterno, IconaNuvola } from '../icone'
import { Carta, Cifra, Cifre, Codice, Stato } from '../pezzi'
import { ConDati, Schermata } from '../Schermata'
import { useToast } from '@/components/Toast'

const asse = (data: string) => ({ etichetta: `${settimana(data)} ${giorno(data)}`, asse: delMese(data) })
const ms = (n: number) => `${decimale(n)} ms`
const somma = <T,>(righe: T[], di: (riga: T) => number) => righe.reduce((s, r) => s + di(r), 0)

/**
 * Cloudflare: quanto si usa del piano gratuito. Le richieste alle Functions
 * (centomila al giorno per tutto il sito), la CPU di una richiesta (dieci
 * millisecondi), le righe lette e scritte di D1 e il suo spazio; e, se ci sono
 * le chiavi, il traffico del dominio, le visite e i deploy. Le statistiche
 * costano una richiesta all'API di Cloudflare, e il server le tiene un minuto:
 * "Aggiorna" le chiede di nuovo davvero.
 */
export default function Cloudflare() {
  const d = useAdmin<AdminCloudflare>('/cloudflare')
  const chiama = useChiama()
  const toast = useToast()
  const [forzo, setForzo] = useState(false)
  const aggiorna = {
    quando: d.quando,
    aggiornando: d.aggiornando || forzo,
    onAggiorna: async () => {
      setForzo(true)
      try {
        d.imposta(await chiama<AdminCloudflare>('/cloudflare?aggiorna=1'))
      } catch (e) {
        toast.show(messaggioDi(e), 'error', 3200)
      } finally {
        setForzo(false)
      }
    },
  }
  return (
    <Schermata
      titolo="Cloudflare"
      aggiorna={aggiorna}
      sotto={
        d.dati?.configurato ? `Dal ${giorno(d.dati.da.slice(0, 10))} al ${giorno(d.dati.a.slice(0, 10))}` : undefined
      }
    >
      <ConDati d={d}>
        {(cf) => (cf.configurato ? <Statistiche cf={cf} /> : <DaConfigurare mancano={cf.mancano} />)}
      </ConDati>
    </Schermata>
  )
}

function Statistiche({ cf }: { cf: AdminCloudflare }) {
  const f = cf.funzioni
  const oggiF = f?.[f.length - 1]
  const d1 = cf.d1
  const oggiD = d1?.giorni[d1.giorni.length - 1]
  const giorniF: PuntoGrafico[] = (f ?? []).map((x) => ({ ...asse(x.data), valori: [x.richieste] }))
  const errori = (f ?? []).reduce((s, x) => s + x.errori, 0)
  const richieste = (f ?? []).reduce((s, x) => s + x.richieste, 0)

  return (
    <>
      {cf.errori.length > 0 && (
        <Carta className="adm-avvisi" icona={<IconaAvviso size={20} />} titolo="Non tutto si è potuto leggere">
          <ul className="adm-avvisi__voci">
            {cf.errori.map((e) => (
              <li key={e.sezione}>
                <strong>{e.sezione}</strong> <span data-selezionabile>{e.messaggio}</span>
              </li>
            ))}
          </ul>
        </Carta>
      )}

      {oggiF && (
        <Cifre>
          <Cifra
            etichetta="Richieste oggi"
            valore={numero(oggiF.richieste)}
            sotto={`${Math.round((oggiF.richieste / LIMITI_GRATUITI.richiesteGiorno) * 100)}% del limite del giorno`}
          />
          <Cifra
            etichetta="Errori oggi"
            valore={numero(oggiF.errori)}
            sotto={
              oggiF.errori > 0 ? (
                <Stato tono="cattivo">{`${numero(errori)} nel periodo`}</Stato>
              ) : (
                <Stato tono="buono">Nessuno</Stato>
              )
            }
          />
          <Cifra
            etichetta="CPU, mediana"
            valore={oggiF.cpuP50 === null ? '—' : ms(oggiF.cpuP50)}
            sotto={`su ${LIMITI_GRATUITI.cpuMs} ms per richiesta`}
          />
          <Cifra
            etichetta="CPU, 99° percentile"
            valore={oggiF.cpuP99 === null ? '—' : ms(oggiF.cpuP99)}
            sotto={
              oggiF.cpuP99 !== null && oggiF.cpuP99 > LIMITI_GRATUITI.cpuMs * 0.7 ? (
                <Stato tono={oggiF.cpuP99 >= LIMITI_GRATUITI.cpuMs ? 'cattivo' : 'avviso'}>Vicino al limite</Stato>
              ) : (
                'le richieste più lente'
              )
            }
          />
        </Cifre>
      )}

      {f && (
        <div className="adm-griglia">
          <Carta titolo="Richieste alle Functions" sotto={`${numero(richieste)} nel periodo · le pagine non contano`}>
            {oggiF && (
              <Misura
                etichetta="Oggi"
                valore={oggiF.richieste}
                limite={LIMITI_GRATUITI.richiesteGiorno}
                formato={compatto}
              />
            )}
            <GraficoColonne
              titolo="Richieste alle Functions al giorno"
              serie={[{ nome: 'Richieste', colore: 'var(--adm-serie-1)' }]}
              punti={giorniF}
              evidenzia={giorniF.length - 1}
            />
          </Carta>
          <Carta titolo="CPU per richiesta" sotto={`Il limite è ${LIMITI_GRATUITI.cpuMs} ms`}>
            <GraficoLinee
              titolo="CPU per richiesta, mediana e 99° percentile, in millisecondi"
              serie={[
                { nome: 'Mediana', colore: 'var(--adm-serie-1)' },
                { nome: '99° percentile', colore: 'var(--adm-serie-2)' },
              ]}
              punti={f.map((x) => ({ ...asse(x.data), valori: [x.cpuP50, x.cpuP99] }))}
              formato={ms}
              interi={false}
              limite={{ valore: LIMITI_GRATUITI.cpuMs, nome: `Limite ${LIMITI_GRATUITI.cpuMs} ms` }}
              evidenzia={f.length - 1}
            />
          </Carta>
        </div>
      )}

      {d1 && (
        <Carta titolo="Database D1" sotto={d1.tabelle !== null ? `${numero(d1.tabelle)} tabelle` : undefined}>
          <div className="adm-misure">
            {oggiD && (
              <>
                <Misura
                  etichetta="Righe lette oggi"
                  valore={oggiD.righeLette}
                  limite={LIMITI_GRATUITI.d1RigheLetteGiorno}
                  formato={compatto}
                />
                <Misura
                  etichetta="Righe scritte oggi"
                  valore={oggiD.righeScritte}
                  limite={LIMITI_GRATUITI.d1RigheScritteGiorno}
                  formato={compatto}
                />
              </>
            )}
            {d1.dimensione !== null && (
              <Misura etichetta="Spazio" valore={d1.dimensione} limite={LIMITI_GRATUITI.d1Dimensione} formato={byte} />
            )}
          </div>
          {d1.giorni.length > 0 && (
            <div className="adm-griglia adm-griglia--interna">
              <div>
                <p className="adm-sottotitolo">Righe lette al giorno</p>
                <GraficoColonne
                  titolo="Righe lette di D1 al giorno"
                  serie={[{ nome: 'Righe lette', colore: 'var(--adm-serie-1)' }]}
                  punti={d1.giorni.map((x) => ({ ...asse(x.data), valori: [x.righeLette] }))}
                  altezza={150}
                  evidenzia={d1.giorni.length - 1}
                />
              </div>
              <div>
                <p className="adm-sottotitolo">Righe scritte al giorno</p>
                <GraficoColonne
                  titolo="Righe scritte di D1 al giorno"
                  serie={[{ nome: 'Righe scritte', colore: 'var(--adm-serie-1)' }]}
                  punti={d1.giorni.map((x) => ({ ...asse(x.data), valori: [x.righeScritte] }))}
                  altezza={150}
                  evidenzia={d1.giorni.length - 1}
                />
              </div>
            </div>
          )}
          {oggiD && (
            <p className="adm-nota">
              Oggi {numero(oggiD.letture)} query di lettura e {numero(oggiD.scritture)} di scrittura.
            </p>
          )}
        </Carta>
      )}

      {(cf.traffico || cf.visite) && (
        <div className={cf.traffico && cf.visite ? 'adm-griglia' : 'adm-pila'}>
          {cf.traffico && (
            <Carta
              titolo="Il dominio"
              sotto={[
                `${numero(somma(cf.traffico, (x) => x.richieste))} richieste`,
                byte(somma(cf.traffico, (x) => x.byte)),
              ].join(' · ')}
            >
              <GraficoColonne
                titolo="Visitatori del dominio al giorno"
                serie={[{ nome: 'Visitatori', colore: 'var(--adm-serie-1)' }]}
                punti={cf.traffico.map((x) => ({ ...asse(x.data), valori: [x.visitatori] }))}
                evidenzia={cf.traffico.length - 1}
              />
              <p className="adm-nota">
                {numero(cf.traffico.reduce((s, x) => s + x.pagine, 0))} pagine viste nel periodo.
              </p>
            </Carta>
          )}
          {cf.visite && (
            <Carta
              titolo="Le visite"
              sotto={`${numero(cf.visite.reduce((s, x) => s + x.visite, 0))} nel periodo, da Web Analytics`}
            >
              <GraficoColonne
                titolo="Visite al giorno"
                serie={[{ nome: 'Visite', colore: 'var(--adm-serie-1)' }]}
                punti={cf.visite.map((x) => ({ ...asse(x.data), valori: [x.visite] }))}
                evidenzia={cf.visite.length - 1}
              />
            </Carta>
          )}
        </div>
      )}

      {cf.deploy && (
        <Carta titolo="I deploy" sotto="Gli ultimi pubblicati su Pages">
          {cf.deploy.length === 0 ? (
            <p className="adm-vuoto-piccolo">Nessun deploy.</p>
          ) : (
            <ul className="adm-deploy">
              {cf.deploy.map((x) => (
                <li key={x.id} className="adm-deploy__riga">
                  <div className="adm-deploy__testo">
                    <p className="adm-deploy__messaggio adm-tronca">{x.messaggio ?? 'Senza messaggio'}</p>
                    <p className="adm-deploy__sotto">
                      {x.commit && <span className="adm-mono">{x.commit.slice(0, 7)}</span>}
                      <span>
                        {x.ambiente === 'production'
                          ? 'Produzione'
                          : x.ambiente === 'preview'
                            ? 'Anteprima'
                            : x.ambiente}
                      </span>
                      <span title={x.creatoIl}>{fa(x.creatoIl)}</span>
                    </p>
                  </div>
                  <StatoDeploy stato={x.stato} />
                  <a
                    className="adm-deploy__apri"
                    href={x.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Apri il deploy"
                  >
                    <IconaEsterno size={16} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Carta>
      )}
    </>
  )
}

function StatoDeploy({ stato }: { stato: string }) {
  // Gli stati dell'ultima fase di un deploy di Pages.
  const s = stato.toLowerCase()
  if (s === 'success') return <Stato tono="buono">Riuscito</Stato>
  if (s === 'failure') return <Stato tono="cattivo">Fallito</Stato>
  if (s === 'canceled') return <Stato tono="avviso">Annullato</Stato>
  return <Stato tono="neutro">{s === 'active' ? 'In corso' : s === 'idle' ? 'In attesa' : stato}</Stato>
}

/** Senza le chiavi: i passi per averle, in ordine, con i comandi da copiare. */
function DaConfigurare({ mancano }: { mancano: string[] }) {
  return (
    <>
      <Carta
        className="adm-invito"
        icona={<IconaNuvola size={20} />}
        titolo="Collega Cloudflare"
        sotto="Tre passi, poi un deploy."
      >
        {mancano.length > 0 && (
          <p className="adm-mancano">
            Mancano{' '}
            {mancano.map((m) => (
              <code key={m} className="adm-chip-codice">
                {m}
              </code>
            ))}
          </p>
        )}
      </Carta>

      <Carta titolo="1. Crea un token">
        <p className="adm-passo">
          Su{' '}
          <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
            dash.cloudflare.com → Profilo → API Tokens
          </a>
          , “Create Token” e “Custom token”, con questi permessi:
        </p>
        <ul className="adm-permessi">
          <li>
            <strong>Account</strong> · Account Analytics · Read
          </li>
          <li>
            <strong>Account</strong> · D1 · Read
          </li>
          <li>
            <strong>Account</strong> · Cloudflare Pages · Read
          </li>
          <li>
            <strong>Zone</strong> · Analytics · Read{' '}
            <span className="is-tenue">· facoltativo, per il traffico del dominio</span>
          </li>
        </ul>
      </Carta>

      <Carta titolo="2. Salva i segreti">
        <p className="adm-passo">
          L’id dell’account è nella barra a destra della home del dashboard. Dal terminale, nella cartella del progetto:
        </p>
        <Codice
          testo={[
            'npx wrangler pages secret put CF_ACCOUNT_ID --project-name game-hub',
            'npx wrangler pages secret put CF_API_TOKEN --project-name game-hub',
            '# facoltativi',
            'npx wrangler pages secret put CF_ZONE_ID --project-name game-hub',
            'npx wrangler pages secret put CF_WEB_ANALYTICS_TAG --project-name game-hub',
          ].join('\n')}
          etichetta="Copia i comandi"
        />
        <p className="adm-passo">
          Oppure dal dashboard: Workers &amp; Pages → game-hub → Settings → Variables and Secrets.
        </p>
      </Carta>

      <Carta titolo="3. Pubblica di nuovo">
        <p className="adm-passo">I segreti valgono dal deploy dopo: rilancia il workflow del deploy, poi torna qui.</p>
      </Carta>
    </>
  )
}
