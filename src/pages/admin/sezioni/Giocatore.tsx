import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  AdminGiocatore,
  AdminGiocoDelGiocatore,
  AdminSessione,
  GiocoAzzerabile,
  ModificaGiocatore,
} from '@shared/admin'
import { NICKNAME_MAX, NICKNAME_OGNI_GIORNI, NICKNAME_PATTERN } from '@shared/config'
import { CATEGORIE_NOTIFICHE } from '@shared/notifiche'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Interruttore } from '@/components/Interruttore'
import { usePlayer } from '@/lib/auth'
import { dimenticaAdmin, useAdmin, useAzione, useIo } from '../dati'
import { conSegno, data, dataOra, dispositivo, fa, giorno, numero, settimana } from '../formato'
import { Carta, Cifra, Cifre, Conferma, Gioco, Online, Stato, nomeDi } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'
import { Etichette, doveE } from './Giocatori'

const GIORNO_MS = 86_400_000

/**
 * La scheda di un giocatore: chi e', che cosa fa, e quel che il pannello gli
 * puo' fare — rimettere a posto una partita di oggi, chiudergli le sessioni,
 * cambiargli il nome o l'email, dargli il ruolo, sospenderlo, eliminarlo.
 * Ogni azione che non si disfa chiede conferma, e quelle sul nome e l'email
 * dicono che cosa cambia prima di salvarlo.
 */
export default function Giocatore({ id }: { id: string }) {
  const d = useAdmin<AdminGiocatore>(`/giocatori/${encodeURIComponent(id)}`)
  const titolo = d.dati?.giocatore.displayName ?? 'Giocatore'
  return (
    <Schermata
      titolo={titolo}
      indietro={{ a: ROTTE.admin('giocatori'), etichetta: 'Giocatori' }}
      aggiorna={aggiornaDa(d)}
    >
      <ConDati d={d}>{(g) => <Scheda g={g} onCambiato={d.imposta} />}</ConDati>
    </Schermata>
  )
}

type Chiesta =
  | { tipo: 'azzera'; gioco: AdminGiocoDelGiocatore }
  | { tipo: 'sessione'; sessione: AdminSessione }
  | { tipo: 'esci' }
  | { tipo: 'elimina' }
  | { tipo: 'salva'; modifica: ModificaGiocatore; righe: string[] }
  | null

function Scheda({ g: tutto, onCambiato }: { g: AdminGiocatore; onCambiato: (g: AdminGiocatore) => void }) {
  const { giocatore: g } = tutto
  const io = useIo()
  const me = usePlayer()
  const { vai } = useNavigazione()
  const { esegui, occupato } = useAzione()
  const [chiesta, setChiesta] = useState<Chiesta>(null)
  const percorso = `/giocatori/${encodeURIComponent(g.id)}`
  const sonoIo = g.id === me.id

  /** Una modifica andata: i dati nuovi della scheda, e l'elenco da rileggere. */
  const fatto = (nuovo: AdminGiocatore | null) => {
    if (!nuovo) return
    dimenticaAdmin('/giocatori?')
    dimenticaAdmin('/panoramica')
    onCambiato(nuovo)
    setChiesta(null)
  }

  async function conferma() {
    if (!chiesta) return
    if (chiesta.tipo === 'azzera') {
      const gioco = chiesta.gioco.gioco as GiocoAzzerabile
      fatto(
        await esegui<AdminGiocatore>(
          'azzera',
          `${percorso}/azzera`,
          { method: 'POST', body: { gioco } },
          'Partita azzerata',
        ),
      )
    } else if (chiesta.tipo === 'sessione') {
      fatto(
        await esegui<AdminGiocatore>(
          'sessione',
          `${percorso}/sessioni/${encodeURIComponent(chiesta.sessione.id)}`,
          { method: 'DELETE' },
          'Sessione chiusa',
        ),
      )
    } else if (chiesta.tipo === 'esci') {
      fatto(
        await esegui<AdminGiocatore>('esci', `${percorso}/esci`, { method: 'POST' }, 'Uscito da tutti i dispositivi'),
      )
    } else if (chiesta.tipo === 'salva') {
      fatto(
        await esegui<AdminGiocatore>(
          'salva',
          percorso,
          { method: 'PATCH', body: chiesta.modifica },
          'Modifiche salvate',
        ),
      )
    } else if (chiesta.tipo === 'elimina') {
      const ok = await esegui<{ ok: true }>(
        'elimina',
        percorso,
        { method: 'DELETE', body: { conferma: g.nickname } },
        `@${g.nickname} eliminato`,
      )
      if (ok) {
        dimenticaAdmin('/giocatori')
        dimenticaAdmin('/panoramica')
        setChiesta(null)
        vai(ROTTE.admin('giocatori'), { direzione: 'indietro', replace: true })
      }
    }
  }

  const azzerabili = tutto.giochi.filter((x) => x.gioco !== 'nomi')
  const giorniAttivi = tutto.attivita.filter((a) => a.valore > 0).length

  return (
    <>
      <Carta className="adm-chi">
        <div className="adm-chi__riga">
          <span className="adm-avatar adm-avatar--grande">
            <Avatar nickname={g.nickname} color={g.avatarColor} size={64} />
            <Online online={g.online} />
          </span>
          <div className="adm-chi__testo">
            <p className="adm-chi__nick" data-selezionabile>
              @{g.nickname}
              {sonoIo && <span className="adm-chi__tu"> · sei tu</span>}
            </p>
            {g.email ? (
              <p className="adm-chi__email">
                <span data-selezionabile className="adm-tronca">
                  {g.email}
                </span>
                {g.emailVerificata ? (
                  <Stato tono="buono">Confermata</Stato>
                ) : (
                  <Stato tono="avviso">{g.inAttesaFino ? 'Aspetta il codice' : 'Da confermare'}</Stato>
                )}
              </p>
            ) : (
              <p className="adm-chi__email">Senza email</p>
            )}
            <p className="adm-chi__etichette">
              <Etichette g={g} email={false} />
            </p>
          </div>
        </div>
        <dl className="adm-chi__fatti">
          <div>
            <dt>Adesso</dt>
            <dd>
              {g.online
                ? doveE(g.attivita)
                  ? `Online, ${doveE(g.attivita)}`
                  : 'Online'
                : g.vistoIl
                  ? `Visto ${fa(g.vistoIl)}`
                  : 'Mai visto'}
            </dd>
          </div>
          <div>
            <dt>Iscritto</dt>
            <dd title={dataOra(g.creatoIl)}>{data(g.creatoIl)}</dd>
          </div>
          <div>
            <dt>Nickname cambiato</dt>
            <dd>{g.nicknameCambiatoIl ? data(g.nicknameCambiatoIl) : 'Mai'}</dd>
          </div>
          <div>
            <dt>Id</dt>
            <dd className="adm-mono adm-tronca" data-selezionabile>
              {g.id}
            </dd>
          </div>
        </dl>
      </Carta>

      <Cifre>
        <Cifra etichetta="Attivo in 30 giorni" valore={`${numero(g.giorniAttivi30)}`} sotto="giorni su 30" />
        <Cifra etichetta="Sessioni" valore={numero(tutto.sessioni.length)} sotto="dispositivi con l’accesso" />
        <Cifra etichetta="Notifiche" valore={numero(tutto.dispositiviNotifiche)} sotto="dispositivi iscritti" />
        <Cifra
          etichetta="Fortuna oggi"
          valore={conSegno(tutto.fortuna.oggi)}
          sotto={`${conSegno(tutto.fortuna.sempre)} da sempre`}
        />
      </Cifre>

      <Carta
        titolo="Ultimi 30 giorni"
        sotto={`Ha aperto l’app ${giorniAttivi} ${giorniAttivi === 1 ? 'giorno' : 'giorni'}`}
      >
        <ol className="adm-striscia" aria-label="Giorni in cui ha aperto l’app">
          {tutto.attivita.map((a, i) => (
            <li
              key={a.data}
              className={`${a.valore > 0 ? 'is-attivo' : ''}${i === tutto.attivita.length - 1 ? ' is-oggi' : ''}`}
              title={`${settimana(a.data)} ${giorno(a.data)}: ${a.valore > 0 ? 'c’era' : 'non c’era'}`}
            >
              <span className="u-visually-hidden">
                {giorno(a.data)}: {a.valore > 0 ? 'attivo' : 'assente'}
              </span>
            </li>
          ))}
        </ol>
        {tutto.attivita.length > 0 && (
          <p className="adm-striscia__assi" aria-hidden="true">
            <span>{giorno(tutto.attivita[0].data)}</span>
            <span>Oggi</span>
          </p>
        )}
      </Carta>

      <Carta titolo="Le classificate" sotto="Da sempre, e la partita di oggi">
        <div className="adm-gg" role="table" aria-label="Le classificate">
          <div className="adm-gg__riga adm-gg__testa" role="row">
            <span role="columnheader">Gioco</span>
            <span className="adm-gg__conti">
              <span role="columnheader" className="is-numero">
                Giornate
              </span>
              <span role="columnheader" className="is-numero">
                Punti
              </span>
              <span role="columnheader">Ultima</span>
            </span>
            <span role="columnheader">Oggi</span>
            <span role="columnheader">
              <span className="u-visually-hidden">Azioni</span>
            </span>
          </div>
          {tutto.giochi.map((x) => (
            <div key={x.gioco} className="adm-gg__riga" role="row">
              <span className="adm-gg__gioco" role="rowheader">
                <Gioco gioco={x.gioco} lato={22} />
              </span>
              <span className="adm-gg__conti">
                <span role="cell" className="is-numero">
                  {numero(x.giornate)}
                  <span className="adm-gg__unita"> {x.giornate === 1 ? 'giornata' : 'giornate'}</span>
                </span>
                <span role="cell" className="is-numero">
                  {numero(x.punti)}
                  <span className="adm-gg__unita"> pt</span>
                </span>
                <span role="cell">{x.ultima ? giorno(x.ultima.slice(0, 10)) : '—'}</span>
              </span>
              <span className="adm-gg__oggi" role="cell">
                {x.oggi === null ? (
                  <span className="is-tenue">—</span>
                ) : x.oggi.stato === 'finita' ? (
                  <Stato tono="buono">Finita · {numero(x.oggi.punti)}</Stato>
                ) : (
                  <Stato tono="neutro">In corso</Stato>
                )}
              </span>
              <span className="adm-gg__azione" role="cell">
                {x.oggi !== null && azzerabili.includes(x) && (
                  <button
                    type="button"
                    className="adm-bottoncino"
                    onClick={() => setChiesta({ tipo: 'azzera', gioco: x })}
                  >
                    Azzera oggi
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </Carta>

      <div className="adm-griglia">
        <Carta titolo="Fortuna">
          <dl className="adm-voci">
            <div className="adm-voci__riga">
              <dt>Oggi</dt>
              <dd className="u-tabnum">{conSegno(tutto.fortuna.oggi)}</dd>
            </div>
            <div className="adm-voci__riga">
              <dt>Da sempre</dt>
              <dd className="u-tabnum">{conSegno(tutto.fortuna.sempre)}</dd>
            </div>
            <div className="adm-voci__riga">
              <dt>Giocate</dt>
              <dd className="u-tabnum">{numero(tutto.fortuna.giocate)}</dd>
            </div>
          </dl>
        </Carta>
        <Carta titolo="Notifiche" sotto={`${numero(tutto.dispositiviNotifiche)} dispositivi iscritti`}>
          <dl className="adm-voci">
            {CATEGORIE_NOTIFICHE.map((c) => {
              const scelta = g.notifiche?.[c.id]
              const accesa = typeof scelta === 'boolean' ? scelta : c.predefinita
              return (
                <div key={c.id} className="adm-voci__riga">
                  <dt>{c.nome}</dt>
                  <dd>
                    {accesa ? 'Accese' : 'Spente'}
                    {typeof scelta !== 'boolean' && <span className="is-tenue"> · di partenza</span>}
                  </dd>
                </div>
              )
            })}
          </dl>
        </Carta>
      </div>

      <Carta
        titolo="Sessioni"
        sotto="I dispositivi da cui è entrato"
        azioni={
          tutto.sessioni.length > 0 && (
            <button type="button" className="adm-bottoncino is-rosso" onClick={() => setChiesta({ tipo: 'esci' })}>
              Esci da tutti
            </button>
          )
        }
      >
        {tutto.sessioni.length === 0 ? (
          <p className="adm-vuoto-piccolo">Nessuna sessione aperta.</p>
        ) : (
          <ul className="adm-sessioni">
            {tutto.sessioni.map((s) => (
              <li key={s.id} className="adm-sessioni__riga">
                <div className="adm-sessioni__testo">
                  <p className="adm-sessioni__nome">
                    {dispositivo(s.dispositivo)}
                    {s.adminFino && new Date(s.adminFino).getTime() > Date.now() && (
                      <Stato tono="neutro">Pannello aperto</Stato>
                    )}
                  </p>
                  <p className="adm-sessioni__sotto" title={s.dispositivo ?? undefined}>
                    Usata {fa(s.usataIl)} · entrata il {data(s.creataIl)} · scade il {data(s.scadeIl)}
                  </p>
                </div>
                <button
                  type="button"
                  className="adm-bottoncino"
                  onClick={() => setChiesta({ tipo: 'sessione', sessione: s })}
                >
                  Chiudi
                </button>
              </li>
            ))}
          </ul>
        )}
      </Carta>

      <Modifica
        g={tutto}
        proprietario={io.ruolo === 'proprietario'}
        sonoIo={sonoIo}
        onSalva={(modifica, righe) => setChiesta({ tipo: 'salva', modifica, righe })}
        onSblocca={async () =>
          fatto(
            await esegui<AdminGiocatore>(
              'sblocca',
              percorso,
              { method: 'PATCH', body: { sbloccaNickname: true } satisfies ModificaGiocatore },
              'Può cambiare il nickname',
            ),
          )
        }
        sblocca={occupato === 'sblocca'}
      />

      <Carta
        className="adm-pericolo"
        titolo="Elimina l’account"
        sotto="Cancella il giocatore e tutto quel che ha giocato. Non si torna indietro."
      >
        <Button
          variant="destructive"
          onClick={() => setChiesta({ tipo: 'elimina' })}
          disabled={g.ruolo === 'proprietario' || sonoIo}
        >
          Elimina @{g.nickname}
        </Button>
      </Carta>

      <Conferma
        aperta={chiesta?.tipo === 'azzera'}
        titolo="Azzerare la partita di oggi?"
        testo={
          chiesta?.tipo === 'azzera'
            ? `${nomeDi(chiesta.gioco.gioco)}: la partita di oggi di @${g.nickname} si cancella, con i suoi punti. ` +
              'Potrà rigiocarla da capo.'
            : ''
        }
        azione="Azzera la partita"
        occupato={occupato === 'azzera'}
        onConferma={() => void conferma()}
        onChiudi={() => setChiesta(null)}
      />
      <Conferma
        aperta={chiesta?.tipo === 'sessione'}
        titolo="Chiudere la sessione?"
        testo={
          chiesta?.tipo === 'sessione'
            ? `${dispositivo(chiesta.sessione.dispositivo)}: per rientrare servirà un codice all’email.`
            : ''
        }
        azione="Chiudi la sessione"
        occupato={occupato === 'sessione'}
        onConferma={() => void conferma()}
        onChiudi={() => setChiesta(null)}
      />
      <Conferma
        aperta={chiesta?.tipo === 'esci'}
        titolo="Uscire da tutti i dispositivi?"
        testo={
          sonoIo
            ? 'Esci anche da questo: per rientrare servirà un codice all’email.'
            : `@${g.nickname} dovrà rientrare con un codice all’email.`
        }
        azione="Esci da tutti"
        occupato={occupato === 'esci'}
        onConferma={() => void conferma()}
        onChiudi={() => setChiesta(null)}
      />
      <Conferma
        aperta={chiesta?.tipo === 'salva'}
        titolo="Salvare le modifiche?"
        azione="Salva"
        distruttiva={false}
        occupato={occupato === 'salva'}
        onConferma={() => void conferma()}
        onChiudi={() => setChiesta(null)}
      >
        {chiesta?.tipo === 'salva' && (
          <ul className="adm-modifiche">
            {chiesta.righe.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </Conferma>
      <Conferma
        aperta={chiesta?.tipo === 'elimina'}
        titolo={`Eliminare @${g.nickname}?`}
        testo="Si cancellano l’account, le partite, i punti e le sessioni. Non si torna indietro."
        azione="Elimina l’account"
        scrivi={g.nickname}
        occupato={occupato === 'elimina'}
        onConferma={() => void conferma()}
        onChiudi={() => setChiesta(null)}
      />
    </>
  )
}

/**
 * Il modulo delle modifiche: i campi e gli interruttori, salvati insieme. Il
 * bottone si accende quando qualcosa e' cambiato, e la conferma elenca che
 * cosa — "Email: a → b" — perché un'email sbagliata chiude fuori un giocatore.
 */
function Modifica({
  g: tutto,
  proprietario,
  sonoIo,
  onSalva,
  onSblocca,
  sblocca,
}: {
  g: AdminGiocatore
  proprietario: boolean
  sonoIo: boolean
  onSalva: (modifica: ModificaGiocatore, righe: string[]) => void
  onSblocca: () => void
  sblocca: boolean
}) {
  const { giocatore: g } = tutto
  const iniziale = useMemo(
    () => ({
      displayName: g.displayName,
      nickname: g.nickname,
      email: g.email ?? '',
      emailVerificata: g.emailVerificata,
      admin: g.ruolo !== null,
      sospeso: g.sospeso,
    }),
    [g],
  )
  const [v, setV] = useState(iniziale)
  // I dati nuovi dal server (dopo un salvataggio) rimettono il modulo come sta adesso.
  useEffect(() => setV(iniziale), [iniziale])
  const proprietarioLui = g.ruolo === 'proprietario'

  const errori = {
    displayName: v.displayName.trim().length === 0 ? 'Serve un nome' : null,
    nickname: NICKNAME_PATTERN.test(v.nickname.trim())
      ? null
      : 'Da 3 a 16: lettere, numeri, punto, trattino, underscore',
    email: v.email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()) ? null : 'Non sembra un’email',
  }

  const modifica: ModificaGiocatore = {}
  const righe: string[] = []
  if (v.displayName.trim() !== g.displayName) {
    modifica.displayName = v.displayName.trim()
    righe.push(`Nome: ${g.displayName} → ${modifica.displayName}`)
  }
  if (v.nickname.trim() !== g.nickname) {
    modifica.nickname = v.nickname.trim()
    righe.push(`Nickname: @${g.nickname} → @${modifica.nickname}`)
  }
  const email = v.email.trim() === '' ? null : v.email.trim()
  if (email !== g.email) {
    modifica.email = email
    righe.push(`Email: ${g.email ?? 'nessuna'} → ${email ?? 'nessuna'}`)
  }
  if (v.emailVerificata !== g.emailVerificata) {
    modifica.emailVerificata = v.emailVerificata
    righe.push(v.emailVerificata ? 'Email: confermata' : 'Email: da confermare')
  }
  if (proprietario && !proprietarioLui && v.admin !== (g.ruolo !== null)) {
    modifica.ruolo = v.admin ? 'admin' : null
    righe.push(v.admin ? 'Diventa amministratore' : 'Non è più amministratore')
  }
  if (v.sospeso !== g.sospeso) {
    modifica.sospeso = v.sospeso
    righe.push(v.sospeso ? 'Sospeso: non può più entrare' : 'Non più sospeso')
  }
  const valido = !errori.displayName && !errori.nickname && !errori.email
  const cambiato = righe.length > 0

  const cambiabileDal = g.nicknameCambiatoIl
    ? new Date(new Date(g.nicknameCambiatoIl).getTime() + NICKNAME_OGNI_GIORNI * GIORNO_MS)
    : null
  const bloccato = cambiabileDal !== null && cambiabileDal.getTime() > Date.now()

  function invia(e: FormEvent) {
    e.preventDefault()
    if (valido && cambiato) onSalva(modifica, righe)
  }

  return (
    <Carta titolo="Modifica" sotto="Le modifiche si salvano insieme">
      <form className="adm-modulo" onSubmit={invia} noValidate>
        <div className="adm-modulo__campi">
          <Campo
            etichetta="Nome"
            valore={v.displayName}
            onCambia={(x) => setV({ ...v, displayName: x })}
            errore={errori.displayName}
            maxLength={40}
          />
          <Campo
            etichetta="Nickname"
            valore={v.nickname}
            onCambia={(x) => setV({ ...v, nickname: x })}
            errore={errori.nickname}
            maxLength={NICKNAME_MAX}
            prima="@"
          />
          <Campo
            etichetta="Email"
            valore={v.email}
            onCambia={(x) => setV({ ...v, email: x })}
            errore={errori.email}
            tipo="email"
          />
        </div>

        <div className="adm-interruttori">
          <RigaInterruttore
            nome="Email confermata"
            acceso={v.emailVerificata}
            onCambia={(x) => setV({ ...v, emailVerificata: x })}
          />
          {proprietario && (
            <RigaInterruttore
              nome="Amministratore"
              sotto={proprietarioLui ? 'È il proprietario' : 'Apre questo pannello'}
              acceso={v.admin}
              onCambia={(x) => setV({ ...v, admin: x })}
              disabilitato={proprietarioLui}
            />
          )}
          <RigaInterruttore
            nome="Sospeso"
            sotto={
              proprietarioLui ? 'Il proprietario non si sospende' : sonoIo ? 'Sei tu' : 'Non può entrare né giocare'
            }
            acceso={v.sospeso}
            onCambia={(x) => setV({ ...v, sospeso: x })}
            disabilitato={proprietarioLui || sonoIo}
            rosso
          />
        </div>

        {bloccato && cambiabileDal && (
          <div className="adm-modulo__sblocca">
            <p>
              Può cambiare il nickname dal{' '}
              <strong>{cambiabileDal.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</strong>.
            </p>
            <Button variant="tinted" loading={sblocca} onClick={onSblocca}>
              Sblocca adesso
            </Button>
          </div>
        )}

        <div className="adm-modulo__piede">
          {cambiato && (
            <Button variant="plain" onClick={() => setV(iniziale)}>
              Annulla
            </Button>
          )}
          <Button type="submit" disabled={!cambiato || !valido}>
            {cambiato ? `Salva ${righe.length === 1 ? 'la modifica' : `${righe.length} modifiche`}` : 'Salva'}
          </Button>
        </div>
      </form>
    </Carta>
  )
}

function Campo({
  etichetta,
  valore,
  onCambia,
  errore,
  tipo = 'text',
  maxLength,
  prima,
}: {
  etichetta: string
  valore: string
  onCambia: (valore: string) => void
  errore: string | null
  tipo?: 'text' | 'email'
  maxLength?: number
  prima?: string
}) {
  const id = `adm-campo-${etichetta.toLowerCase()}`
  return (
    <div className={`adm-modulo__campo${errore ? ' is-errore' : ''}`}>
      <label htmlFor={id}>{etichetta}</label>
      <span className="adm-modulo__input">
        {prima && <span className="adm-modulo__prima">{prima}</span>}
        <input
          id={id}
          type={tipo}
          value={valore}
          onChange={(e) => onCambia(e.target.value)}
          maxLength={maxLength}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errore ? true : undefined}
          aria-describedby={errore ? `${id}-errore` : undefined}
        />
      </span>
      {errore && (
        <p className="adm-modulo__errore" id={`${id}-errore`}>
          {errore}
        </p>
      )}
    </div>
  )
}

function RigaInterruttore({
  nome,
  sotto,
  acceso,
  onCambia,
  disabilitato = false,
  rosso = false,
}: {
  nome: string
  sotto?: string
  acceso: boolean
  onCambia: (acceso: boolean) => void
  disabilitato?: boolean
  rosso?: boolean
}) {
  return (
    <div className={`adm-interruttori__riga${rosso && acceso ? ' is-rosso' : ''}`}>
      <span className="adm-interruttori__testo">
        <span>{nome}</span>
        {sotto && <span className="adm-interruttori__sotto">{sotto}</span>}
      </span>
      <Interruttore acceso={acceso} onCambia={onCambia} etichetta={nome} disabilitato={disabilitato} />
    </div>
  )
}
