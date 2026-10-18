import type { AdminGiochi, AdminStatisticheGioco } from '@shared/admin'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { useAdmin } from '../dati'
import { decimale, delMese, giorno, numero, settimana } from '../formato'
import { GraficoColonne } from '../Grafici'
import { Carta, IconaGioco, nomeDi } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

const SERIE = [
  { nome: 'Finite', colore: 'var(--adm-serie-1)' },
  { nome: 'Non finite', colore: 'var(--adm-serie-1-tenue)' },
]

/**
 * I giochi classificati, uno per carta: come va oggi, gli ultimi quattordici
 * giorni, i migliori di oggi e i conti da sempre. Si legge per confrontare:
 * le carte hanno tutte la stessa forma, e i giochi piu' giocati vengono primi.
 */
export default function Giochi() {
  const d = useAdmin<AdminGiochi>('/giochi')
  return (
    <Schermata titolo="Giochi" aggiorna={aggiornaDa(d)}>
      <ConDati d={d}>
        {(g) => (
          <div className="adm-griglia">
            {[...g.giochi]
              .sort((a, b) => oggiDi(b).giocate - oggiDi(a).giocate || b.totale.giocate - a.totale.giocate)
              .map((s) => (
                <CartaGioco key={s.gioco} s={s} />
              ))}
          </div>
        )}
      </ConDati>
    </Schermata>
  )
}

const oggiDi = (s: AdminStatisticheGioco) =>
  s.giorni[s.giorni.length - 1] ?? { giocate: 0, finite: 0, mediaPunti: null }

function CartaGioco({ s }: { s: AdminStatisticheGioco }) {
  const oggi = oggiDi(s)
  return (
    <Carta
      icona={<IconaGioco gioco={s.gioco} lato={32} />}
      titolo={nomeDi(s.gioco)}
      sotto={`${numero(s.totale.giocatori)} giocatori da sempre`}
    >
      <dl className="adm-tris">
        <div>
          <dt>Oggi</dt>
          <dd>{numero(oggi.giocate)}</dd>
          <span className="adm-tris__sotto">{numero(oggi.finite)} finite</span>
        </div>
        <div>
          <dt>Media di oggi</dt>
          <dd>{oggi.mediaPunti === null ? '—' : decimale(oggi.mediaPunti)}</dd>
          <span className="adm-tris__sotto">punti</span>
        </div>
        <div>
          <dt>Da sempre</dt>
          <dd>{numero(s.totale.giocate)}</dd>
          <span className="adm-tris__sotto">
            {s.totale.mediaPunti === null ? 'partite' : `media ${decimale(s.totale.mediaPunti)}`}
          </span>
        </div>
      </dl>
      <GraficoColonne
        titolo={`${nomeDi(s.gioco)}: partite al giorno, ultimi 14 giorni`}
        serie={SERIE}
        totale="Giocate"
        altezza={150}
        punti={s.giorni.map((x) => ({
          etichetta: `${settimana(x.data)} ${giorno(x.data)}`,
          asse: delMese(x.data),
          valori: [x.finite, Math.max(0, x.giocate - x.finite)],
        }))}
        evidenzia={s.giorni.length - 1}
      />
      {s.migliori.length > 0 && (
        <div className="adm-migliori">
          <p className="adm-migliori__titolo">I migliori di oggi</p>
          <ol>
            {s.migliori.slice(0, 5).map((m, i) => (
              <li key={m.id}>
                <span className="adm-migliori__posto u-tabnum">{i + 1}</span>
                <Collegamento to={ROTTE.adminGiocatore(m.id)} className="adm-migliori__nome adm-tronca">
                  @{m.nickname}
                </Collegamento>
                <span className="adm-migliori__punti u-tabnum">{numero(m.punti)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Carta>
  )
}
