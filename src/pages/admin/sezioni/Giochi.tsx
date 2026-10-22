import type { AdminGiochi, AdminSospese, AdminStatisticheGioco } from '@shared/admin'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { useAdmin } from '../dati'
import { decimale, delMese, giorno, numero, settimana } from '../formato'
import { GraficoColonne, GraficoLinee } from '../Grafici'
import { Carta, Cifra, Cifre, IconaGioco, nomeDi } from '../pezzi'
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
            <CartaSospese s={g.sospese} />
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

const SERIE_SOSPESE = [
  { nome: 'Cominciate', colore: 'var(--adm-serie-1)' },
  { nome: 'Riprese', colore: 'var(--adm-serie-2)' },
]

/**
 * Le libere in sospeso: quante ce ne sono adesso, quante se ne sono
 * cominciate e riprese, quante sono finite giocando, lasciate o scadute dopo
 * tre giorni senza essere aperte. Il grafico dice i giorni: le cominciate e le
 * riprese.
 */
function CartaSospese({ s }: { s: AdminSospese }) {
  const scaduteDiRecente = s.giorni.reduce((t, g) => t + g.scadute, 0)
  return (
    <Carta titolo="Libere in sospeso" sotto="Partite libere lasciate a metà, che si chiudono dopo tre giorni senza aprirle">
      <Cifre>
        <Cifra etichetta="In sospeso adesso" valore={numero(s.adesso)} vivo={s.adesso > 0} />
        <Cifra etichetta="Cominciate" valore={numero(s.create)} sotto="da sempre" />
        <Cifra etichetta="Riprese" valore={numero(s.riprese)} sotto="aperte di nuovo dopo averle lasciate" />
        <Cifra
          etichetta="Scadute"
          valore={numero(s.scadute)}
          sotto={`${numero(s.finite)} finite · ${numero(s.annullate)} lasciate · ${numero(scaduteDiRecente)} scadute in 14 giorni`}
        />
      </Cifre>
      <GraficoLinee
        titolo="Libere in sospeso: cominciate e riprese al giorno, ultimi 14 giorni"
        serie={SERIE_SOSPESE}
        altezza={160}
        punti={s.giorni.map((x) => ({
          etichetta: `${settimana(x.data)} ${giorno(x.data)}`,
          asse: delMese(x.data),
          valori: [x.create, x.riprese],
        }))}
        evidenzia={s.giorni.length - 1}
      />
      {s.perGioco.length > 0 && (
        <div className="adm-migliori">
          <p className="adm-migliori__titolo">In sospeso adesso, per gioco</p>
          <ol>
            {s.perGioco.map((p) => (
              <li key={p.gioco}>
                <IconaGioco gioco={p.gioco} lato={20} />
                <span className="adm-migliori__nome adm-tronca">{nomeDi(p.gioco)}</span>
                <span className="adm-migliori__punti u-tabnum">{numero(p.adesso)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Carta>
  )
}
