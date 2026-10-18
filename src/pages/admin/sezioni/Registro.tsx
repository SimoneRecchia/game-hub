import { useState } from 'react'
import type { AdminRegistro, VoceRegistro } from '@shared/admin'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Vuoto } from '@/components/Elementi'
import { IconChevronRight } from '@/components/Icons'
import { useAdmin } from '../dati'
import { dataOra, fa } from '../formato'
import { IconaRegistro } from '../icone'
import { Carta, Codice, Paginatore } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

/** Le azioni del registro, dette come le direbbe una persona; quelle che non si conoscono restano come sono. */
const AZIONI: Record<string, string> = {
  'pannello.sblocco': 'ha sbloccato il pannello',
  'giocatore.modifica': 'ha modificato',
  'giocatore.esci': 'ha chiuso tutte le sessioni di',
  'giocatore.sessione': 'ha chiuso una sessione di',
  'giocatore.azzera': 'ha azzerato una partita di',
  'giocatore.elimina': 'ha eliminato',
  'sql.scrittura': 'ha scritto nel database',
  'annuncio.nuovo': 'ha pubblicato un annuncio',
  'annuncio.modifica': 'ha cambiato un annuncio',
  'annuncio.elimina': 'ha eliminato un annuncio',
  'errori.svuota': 'ha svuotato gli errori',
}

/**
 * Il registro: chi ha fatto che cosa dal pannello, e quando. Ogni modifica a
 * un giocatore, ogni scrittura nel database, ogni annuncio ci finisce da
 * solo, e non si cancella da qui. I dettagli — la query, i campi cambiati —
 * si aprono toccando la voce.
 */
export default function Registro() {
  const [pagina, setPagina] = useState(1)
  const d = useAdmin<AdminRegistro>(`/registro?pagina=${pagina}`, { tieni: true })
  return (
    <Schermata titolo="Registro" aggiorna={aggiornaDa(d)}>
      <ConDati d={d} sbiadisci>
        {(r) =>
          r.voci.length === 0 ? (
            <Carta>
              <Vuoto
                icona={<IconaRegistro size={28} />}
                titolo="Ancora niente"
                testo="Le azioni del pannello finiscono qui."
              />
            </Carta>
          ) : (
            <>
              <Carta className="adm-carta--elenco">
                <ul className="adm-registro">
                  {r.voci.map((v) => (
                    <Voce key={v.id} v={v} />
                  ))}
                </ul>
              </Carta>
              <Paginatore
                pagina={r.pagina}
                perPagina={r.perPagina}
                totale={r.totale}
                onPagina={setPagina}
                disabilitato={d.aggiornando}
              />
            </>
          )
        }
      </ConDati>
    </Schermata>
  )
}

function Voce({ v }: { v: VoceRegistro }) {
  const [aperta, setAperta] = useState(false)
  const dettagli =
    v.dettagli !== null &&
    v.dettagli !== undefined &&
    !(typeof v.dettagli === 'object' && Object.keys(v.dettagli as object).length === 0)
  const azione = AZIONI[v.azione]
  const corpo = (
    <>
      <span className="adm-registro__chi">
        {v.admin ? (
          <Avatar nickname={v.admin.nickname} size={30} />
        ) : (
          <span className="adm-iniziale" style={{ width: 30, height: 30 }}>
            ?
          </span>
        )}
      </span>
      <span className="adm-registro__testo">
        <span className="adm-registro__frase">
          <strong>{v.admin ? `@${v.admin.nickname}` : 'Qualcuno'}</strong>{' '}
          {azione ?? <code className="adm-mono">{v.azione}</code>}
          {v.oggetto && (
            <>
              {' '}
              <strong>{v.azione.startsWith('giocatore.') ? `@${v.oggetto}` : v.oggetto}</strong>
            </>
          )}
        </span>
        <span className="adm-registro__quando" title={dataOra(v.at)}>
          {fa(v.at)} · {dataOra(v.at)}
        </span>
      </span>
      {dettagli && <IconChevronRight size={16} className={`adm-registro__freccia${aperta ? ' is-aperta' : ''}`} />}
    </>
  )
  return (
    <li className="adm-registro__voce">
      {dettagli ? (
        <button type="button" className="adm-registro__riga" aria-expanded={aperta} onClick={() => setAperta(!aperta)}>
          {corpo}
        </button>
      ) : (
        <div className="adm-registro__riga">{corpo}</div>
      )}
      {aperta && dettagli && (
        <div className="adm-registro__dettagli">
          <Codice
            testo={typeof v.dettagli === 'string' ? v.dettagli : JSON.stringify(v.dettagli, null, 2)}
            alto={280}
          />
          {v.admin && (
            <Collegamento to={ROTTE.adminGiocatore(v.admin.id)} className="adm-link">
              Scheda di @{v.admin.nickname}
            </Collegamento>
          )}
        </div>
      )}
    </li>
  )
}
