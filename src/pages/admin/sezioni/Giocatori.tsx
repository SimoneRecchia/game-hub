import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AdminGiocatoreRiga, AdminGiocatori, FiltroGiocatori, OrdineGiocatori } from '@shared/admin'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Vuoto } from '@/components/Elementi'
import { IconChevronRight, IconClose, IconPeople } from '@/components/Icons'
import { DOVE } from '@/lib/presenza'
import type { Attivita } from '@shared/types'
import { useAdmin, useRitardato } from '../dati'
import { data, dataOra, fa, numero } from '../formato'
import { IconaCerca } from '../icone'
import { Attesa, Carta, Online, Paginatore, Scelta, Stato } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

const ORDINI: Array<{ valore: OrdineGiocatori; nome: string }> = [
  { valore: 'recenti', nome: 'Visti di recente' },
  { valore: 'iscritti', nome: 'Iscritti di recente' },
  { valore: 'attivi', nome: 'Più attivi' },
  { valore: 'nome', nome: 'Per nome' },
]

const FILTRI: Array<{ valore: FiltroGiocatori; nome: string }> = [
  { valore: 'tutti', nome: 'Tutti' },
  { valore: 'online', nome: 'Online' },
  { valore: 'non-verificati', nome: 'Email da confermare' },
  { valore: 'sospesi', nome: 'Sospesi' },
  { valore: 'amministratori', nome: 'Amministratori' },
]

/** Che cosa sta facendo, per la presenza: "gioca a Wordle". */
export function doveE(attivita: string | null): string | null {
  const dove = attivita ? DOVE[attivita as Attivita] : undefined
  return dove && dove !== DOVE.altro ? dove : null
}

/**
 * I giocatori: si cercano per nome o email, si filtrano, si ordinano, e
 * toccandone uno si apre la sua scheda. La ricerca, il filtro, l'ordine e la
 * pagina stanno nell'indirizzo: tornando dalla scheda di un giocatore
 * l'elenco e' come lo si era lasciato.
 */
export default function Giocatori() {
  const [query] = useSearchParams()
  const { vai } = useNavigazione()
  const ordine = (ORDINI.find((o) => o.valore === query.get('ordine'))?.valore ?? 'recenti') as OrdineGiocatori
  const filtro = (FILTRI.find((f) => f.valore === query.get('filtro'))?.valore ?? 'tutti') as FiltroGiocatori
  const pagina = Math.max(1, Number(query.get('pagina')) || 1)
  const [testo, setTesto] = useState(query.get('q') ?? '')
  const cercato = useRitardato(testo.trim(), 280)

  const cambia = (dopo: { q?: string; ordine?: string; filtro?: string; pagina?: number }) => {
    const p = new URLSearchParams()
    const q = dopo.q ?? cercato
    const o = dopo.ordine ?? ordine
    const f = dopo.filtro ?? filtro
    const n = dopo.pagina ?? 1
    if (q) p.set('q', q)
    if (o !== 'recenti') p.set('ordine', o)
    if (f !== 'tutti') p.set('filtro', f)
    if (n > 1) p.set('pagina', String(n))
    const s = p.toString()
    vai(`${ROTTE.admin('giocatori')}${s ? `?${s}` : ''}`, { replace: true, direzione: 'nessuna' })
  }

  // La ricerca scritta va nell'indirizzo quando si smette di scrivere, e riporta alla prima pagina.
  useEffect(() => {
    if (cercato !== (query.get('q') ?? '')) cambia({ q: cercato })
    // Solo quando cambia la ricerca: il filtro, l'ordine e la pagina li scrive chi li cambia.
  }, [cercato])

  const parametri = new URLSearchParams({ q: cercato, ordine, filtro, pagina: String(pagina) })
  const d = useAdmin<AdminGiocatori>(`/giocatori?${parametri}`, { tieni: true })

  return (
    <Schermata titolo="Giocatori" aggiorna={aggiornaDa(d)}>
      <div className="adm-filtri" role="search">
        <label className="adm-cerca">
          <IconaCerca size={17} />
          <span className="u-visually-hidden">Cerca</span>
          <input
            type="search"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Nome, nickname o email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {testo && (
            <button
              type="button"
              className="adm-cerca__via"
              onClick={() => setTesto('')}
              aria-label="Cancella la ricerca"
            >
              <IconClose size={14} />
            </button>
          )}
        </label>
        <Scelta etichetta="Filtro" valore={filtro} voci={FILTRI} onCambia={(f) => cambia({ filtro: f })} />
        <Scelta etichetta="Ordine" valore={ordine} voci={ORDINI} onCambia={(o) => cambia({ ordine: o })} />
      </div>

      <ConDati d={d} sbiadisci attesa={<Attesa righe={1} alta={420} />}>
        {(r) => (
          <>
            <p className="adm-conteggio" aria-live="polite">
              {numero(r.totale)} {r.totale === 1 ? 'giocatore' : 'giocatori'}
            </p>
            {r.righe.length === 0 ? (
              <Carta>
                <Vuoto icona={<IconPeople size={28} />} titolo="Nessuno" testo="Prova a cercare un’altra cosa." />
              </Carta>
            ) : (
              <Carta className="adm-carta--elenco">
                <div className="adm-tabella-g" role="list" aria-label="Giocatori">
                  <div className="adm-tabella-g__testa" aria-hidden="true">
                    <span>Giocatore</span>
                    <span>Iscritto</span>
                    <span>Ultima visita</span>
                    <span>Attivo in 30 giorni</span>
                  </div>
                  {r.righe.map((g) => (
                    <RigaGiocatore key={g.id} g={g} />
                  ))}
                </div>
              </Carta>
            )}
            <Paginatore
              pagina={r.pagina}
              perPagina={r.perPagina}
              totale={r.totale}
              onPagina={(n) => cambia({ pagina: n })}
              disabilitato={d.aggiornando}
            />
          </>
        )}
      </ConDati>
    </Schermata>
  )
}

/** Il ruolo e lo stato di un giocatore, nelle etichette: proprietario, admin, sospeso, email da confermare. */
export function Etichette({ g, email = true }: { g: AdminGiocatoreRiga; email?: boolean }) {
  return (
    <>
      {g.ruolo === 'proprietario' && <Stato tono="neutro">Proprietario</Stato>}
      {g.ruolo === 'admin' && <Stato tono="neutro">Admin</Stato>}
      {g.sospeso && <Stato tono="cattivo">Sospeso</Stato>}
      {email && g.email && !g.emailVerificata && (
        <Stato tono="avviso">{g.inAttesaFino ? 'Aspetta il codice' : 'Da confermare'}</Stato>
      )}
    </>
  )
}

function RigaGiocatore({ g }: { g: AdminGiocatoreRiga }) {
  const dove = doveE(g.attivita)
  const visto = g.online ? (dove ? `Online · ${dove}` : 'Online') : g.vistoIl ? fa(g.vistoIl) : 'Mai'
  return (
    <Collegamento to={ROTTE.adminGiocatore(g.id)} className="adm-tabella-g__riga" role="listitem">
      <span className="adm-tabella-g__chi">
        <span className="adm-avatar">
          <Avatar nickname={g.nickname} color={g.avatarColor} size={38} />
          <Online online={g.online} />
        </span>
        <span className="adm-tabella-g__nomi">
          <span className="adm-tabella-g__nome">
            <span className="adm-tronca">{g.displayName}</span>
            <Etichette g={g} />
          </span>
          <span className="adm-tabella-g__sotto adm-tronca">
            @{g.nickname}
            {g.email && <> · {g.email}</>}
          </span>
        </span>
      </span>
      <span className="adm-tabella-g__col" title={dataOra(g.creatoIl)}>
        <span className="adm-tabella-g__etichetta">Iscritto</span>
        {data(g.creatoIl)}
      </span>
      <span
        className={`adm-tabella-g__col${g.online ? ' is-online' : ''}`}
        title={g.vistoIl ? dataOra(g.vistoIl) : undefined}
      >
        <span className="adm-tabella-g__etichetta">Visto</span>
        <span className="adm-tronca">{visto}</span>
      </span>
      <span className="adm-tabella-g__col adm-tabella-g__attivo">
        <span className="adm-tabella-g__etichetta">Attivo</span>
        <span className="adm-tacchette" aria-hidden="true">
          <span style={{ width: `${(Math.min(30, g.giorniAttivi30) / 30) * 100}%` }} />
        </span>
        <span className="u-tabnum">{g.giorniAttivi30}/30</span>
      </span>
      <IconChevronRight size={16} className="adm-tabella-g__freccia" />
    </Collegamento>
  )
}
