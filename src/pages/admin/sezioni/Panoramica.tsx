import type { AdminPanoramica, SerieGiorno } from '@shared/admin'
import { Collegamento } from '@/app/navigazione'
import { useAdmin } from '../dati'
import { byte, decimale, delMese, giorno, giornoIntero, numero, settimana } from '../formato'
import { Andamento, BarreOrizzontali, GraficoColonne, GraficoLinee, Misura, type PuntoGrafico } from '../Grafici'
import { IconaNuvola } from '../icone'
import { Carta, Cifra, Cifre, Gioco, Stato, Voce, nomeDi } from '../pezzi'
import { ConDati, Schermata, aggiornaDa, indirizzoDi } from '../Schermata'

/** La panoramica si rilegge da sola ogni mezzo minuto, finché la pagina si vede. */
const OGNI_MS = 30_000

/** Una serie di giorni per i grafici: "sab 18 ott" nel fumetto, "18" sotto l'asse. */
export function puntiDa(serie: SerieGiorno[]): PuntoGrafico[] {
  return serie.map((s) => ({
    etichetta: `${settimana(s.data)} ${giorno(s.data)}`,
    asse: delMese(s.data),
    valori: [s.valore],
  }))
}

const SERIE_PARTITE = [
  { nome: 'Finite', colore: 'var(--adm-serie-1)' },
  { nome: 'In corso', colore: 'var(--adm-serie-1-tenue)' },
]

/**
 * La prima schermata del pannello: le cifre che si guardano ogni giorno — chi
 * c'e', chi gioca, quanto e' pieno il database, se il server sbaglia — e i
 * trenta giorni di chi apre l'app e di chi si iscrive.
 */
export default function Panoramica() {
  const d = useAdmin<AdminPanoramica>('/panoramica', { ogni: OGNI_MS })
  return (
    <Schermata
      titolo="Panoramica"
      aggiorna={aggiornaDa(d)}
      sotto={d.dati ? `Giornata ${numero(d.dati.giornata.numero)}, ${giornoIntero(d.dati.giornata.data)}` : undefined}
    >
      <ConDati d={d}>{(p) => <Contenuto p={p} />}</ConDati>
    </Schermata>
  )
}

function Contenuto({ p }: { p: AdminPanoramica }) {
  const { giocatori: g, attivi: a } = p
  const iniziate = p.partiteOggi.reduce((s, x) => s + x.iniziate, 0)
  const finite = p.partiteOggi.reduce((s, x) => s + x.finite, 0)
  const oggi = p.serieAttivi.length - 1
  const partite = [...p.partiteOggi].sort((x, y) => y.iniziate - x.iniziate)

  return (
    <>
      <Cifre>
        <Cifra
          etichetta="Giocatori"
          valore={numero(g.totali)}
          sotto={`+${numero(g.nuovi7)} in 7 giorni`}
          andamento={<Andamento valori={cumulata(p.serieIscrizioni)} />}
          a={indirizzoDi('giocatori')}
        />
        <Cifra etichetta="Online adesso" vivo={a.online > 0} valore={numero(a.online)} sotto="Con l’app aperta" />
        <Cifra
          etichetta="Attivi oggi"
          valore={numero(a.oggi)}
          sotto={`${numero(a.settimana)} in 7 giorni · ${numero(a.mese)} in 30`}
          andamento={<Andamento valori={p.serieAttivi.map((s) => s.valore)} />}
        />
        <Cifra
          etichetta="Partite oggi"
          valore={numero(iniziate)}
          sotto={`${numero(finite)} finite`}
          a={indirizzoDi('giochi')}
        />
        <Cifra
          etichetta="Sessioni aperte"
          valore={numero(p.sessioni)}
          sotto={`${numero(p.dispositiviNotifiche)} con le notifiche`}
        />
        <Cifra
          etichetta="Errori in 24 ore"
          valore={numero(p.errori24h)}
          sotto={p.errori24h > 0 ? <Stato tono="cattivo">Da guardare</Stato> : <Stato tono="buono">Nessuno</Stato>}
          a={indirizzoDi('errori')}
        />
      </Cifre>

      {!p.cloudflare && (
        <Carta
          className="adm-invito"
          icona={<IconaNuvola size={20} />}
          titolo="Collega Cloudflare"
          sotto="Per vedere richieste, CPU e letture del database."
        >
          <Collegamento
            to={indirizzoDi('cloudflare')}
            direzione="scheda"
            replace
            className="btn btn--tinted btn--md adm-invito__azione"
          >
            Come si fa
          </Collegamento>
        </Carta>
      )}

      <div className="adm-griglia">
        <Carta titolo="Chi apre l’app" sotto="Giocatori diversi al giorno, ultimi 30 giorni">
          <GraficoLinee
            titolo="Giocatori attivi al giorno, ultimi 30 giorni"
            serie={[{ nome: 'Attivi', colore: 'var(--adm-serie-1)' }]}
            punti={puntiDa(p.serieAttivi)}
            evidenzia={oggi}
          />
        </Carta>
        <Carta titolo="Iscrizioni" sotto={`${numero(g.nuovi30)} negli ultimi 30 giorni`}>
          <GraficoColonne
            titolo="Iscrizioni al giorno, ultimi 30 giorni"
            serie={[{ nome: 'Iscrizioni', colore: 'var(--adm-serie-1)' }]}
            punti={puntiDa(p.serieIscrizioni)}
            evidenzia={p.serieIscrizioni.length - 1}
          />
        </Carta>
      </div>

      <div className="adm-griglia adm-griglia--larga">
        <Carta titolo="Le partite di oggi" sotto={`${numero(iniziate)} aperte, ${numero(finite)} finite`}>
          {partite.length === 0 ? (
            <p className="adm-vuoto-piccolo">Ancora nessuna partita.</p>
          ) : (
            <BarreOrizzontali
              titolo="Partite di oggi per gioco"
              serie={SERIE_PARTITE}
              righe={partite.map((x) => ({
                chiave: x.gioco,
                nome: <Gioco gioco={x.gioco} lato={22} />,
                testo: nomeDi(x.gioco),
                valori: [x.finite, Math.max(0, x.iniziate - x.finite)],
                dopo: (
                  <>
                    <strong>{numero(x.finite)}</strong>/{numero(x.iniziate)}
                    {x.mediaPunti !== null && <span className="adm-barre__media"> · {decimale(x.mediaPunti)} pt</span>}
                  </>
                ),
              }))}
            />
          )}
        </Carta>

        <div className="adm-pila">
          <Carta
            titolo="Database"
            azioni={
              <Collegamento to={indirizzoDi('database')} direzione="scheda" replace className="adm-link">
                Apri
              </Collegamento>
            }
          >
            <Misura etichetta="Spazio usato" valore={p.database.dimensione} limite={p.database.limite} formato={byte} />
            <p className="adm-nota">{numero(p.database.tabelle)} tabelle</p>
          </Carta>
          <Carta titolo="Gli account">
            <dl className="adm-voci">
              <Voce nome="Email confermata" valore={`${numero(g.verificati)} su ${numero(g.totali)}`} />
              <Voce nome="Nuovi oggi" valore={numero(g.nuoviOggi)} />
              <Voce nome="Nuovi in 30 giorni" valore={numero(g.nuovi30)} />
              <Voce nome="Amministratori" valore={numero(g.amministratori)} />
              <Voce nome="Sospesi" valore={numero(g.sospesi)} />
            </dl>
          </Carta>
        </div>
      </div>
    </>
  )
}

/** Le iscrizioni giorno per giorno, sommate: la linea di quanti eravamo. */
function cumulata(serie: SerieGiorno[]): number[] {
  let somma = 0
  return serie.map((s) => (somma += s.valore))
}
