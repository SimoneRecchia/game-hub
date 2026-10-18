import { useState } from 'react'
import type { AdminErrori, ErroreServer } from '@shared/admin'
import { Button } from '@/components/Button'
import { Vuoto } from '@/components/Elementi'
import { IconCheck, IconChevronRight } from '@/components/Icons'
import { useAdmin, useAzione } from '../dati'
import { dataOra, fa, numero } from '../formato'
import { Carta, Codice, Conferma } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

/**
 * Gli errori del server: le richieste che hanno risposto 500, con il
 * percorso, il messaggio, chi le aveva fatte e lo stack, che si apre toccando
 * l'errore. "Svuota" li cancella tutti, dopo averli letti.
 */
export default function Errori() {
  const d = useAdmin<AdminErrori>('/errori')
  const { esegui, occupato } = useAzione()
  const [svuota, setSvuota] = useState(false)
  return (
    <Schermata titolo="Errori" aggiorna={aggiornaDa(d)}>
      <ConDati d={d}>
        {(r) =>
          r.errori.length === 0 ? (
            <Carta>
              <Vuoto
                icona={<IconCheck size={28} />}
                titolo="Nessun errore"
                testo="Il server non ha sbagliato niente."
              />
            </Carta>
          ) : (
            <Carta
              className="adm-carta--elenco"
              titolo={`${numero(r.totale)} ${r.totale === 1 ? 'errore' : 'errori'}`}
              sotto={
                r.totale > r.errori.length
                  ? `Si vedono gli ultimi ${numero(r.errori.length)}`
                  : 'I più recenti per primi'
              }
              azioni={
                <Button variant="tinted" onClick={() => setSvuota(true)}>
                  Svuota
                </Button>
              }
            >
              <ul className="adm-errori">
                {r.errori.map((e) => (
                  <Errore key={e.id} e={e} />
                ))}
              </ul>
            </Carta>
          )
        }
      </ConDati>
      <Conferma
        aperta={svuota}
        titolo="Svuotare gli errori?"
        testo="Si cancellano tutti, anche quelli che non si vedono qui."
        azione="Svuota"
        occupato={occupato === 'svuota'}
        onConferma={async () => {
          const r = await esegui<AdminErrori>('svuota', '/errori', { method: 'DELETE' }, 'Errori cancellati')
          if (r) d.imposta(r)
          setSvuota(false)
        }}
        onChiudi={() => setSvuota(false)}
      />
    </Schermata>
  )
}

function Errore({ e }: { e: ErroreServer }) {
  const [aperto, setAperto] = useState(false)
  return (
    <li className="adm-errori__voce">
      <button type="button" className="adm-errori__riga" aria-expanded={aperto} onClick={() => setAperto(!aperto)}>
        <span className="adm-errori__testo">
          <span className="adm-errori__percorso adm-mono">
            <span className="adm-errori__metodo">{e.metodo}</span> <span className="adm-tronca">{e.percorso}</span>
          </span>
          <span className="adm-errori__messaggio">{e.messaggio}</span>
          <span className="adm-errori__quando" title={dataOra(e.at)}>
            {fa(e.at)}
            {e.giocatore && ` · @${e.giocatore}`}
          </span>
        </span>
        <IconChevronRight size={16} className={`adm-registro__freccia${aperto ? ' is-aperta' : ''}`} />
      </button>
      {aperto && (
        <div className="adm-registro__dettagli">
          <Codice
            testo={[`${e.metodo} ${e.percorso}`, dataOra(e.at), '', e.messaggio, '', e.stack ?? 'Senza stack'].join(
              '\n',
            )}
            alto={360}
          />
        </div>
      )}
    </li>
  )
}
