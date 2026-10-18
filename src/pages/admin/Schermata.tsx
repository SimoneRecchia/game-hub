import { createContext, useContext, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { ROTTE } from '@/app/rotte'
import { IconFortuna, IconGames, IconList, IconPeople, IconRefresh, IconCalendar } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import type { DatiAdmin } from './dati'
import { ora } from './formato'
import { Attesa, Errore } from './pezzi'
import {
  IconaAvviso,
  IconaConsole,
  IconaDatabase,
  IconaMegafono,
  IconaNuvola,
  IconaPanoramica,
  IconaRegistro,
  IconaSistema,
} from './icone'

type Icona = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

export type IdSezione =
  | 'panoramica'
  | 'giocatori'
  | 'giochi'
  | 'contenuti'
  | 'fortuna'
  | 'cloudflare'
  | 'database'
  | 'sql'
  | 'annunci'
  | 'registro'
  | 'errori'
  | 'sistema'

export interface Sezione {
  id: IdSezione
  nome: string
  gruppo: string
  Icona: Icona
}

/**
 * Le sezioni del pannello, nei loro gruppi: chi gioca, i giochi, la macchina
 * che li fa girare, e quel che si gestisce a mano. Sul computer sono il menu a
 * sinistra; sul telefono un foglio, che si apre dal bottone in alto.
 */
export const SEZIONI: readonly Sezione[] = [
  { id: 'panoramica', nome: 'Panoramica', gruppo: 'Generale', Icona: IconaPanoramica },
  { id: 'giocatori', nome: 'Giocatori', gruppo: 'Generale', Icona: IconPeople },
  { id: 'giochi', nome: 'Giochi', gruppo: 'Giochi', Icona: IconGames },
  { id: 'contenuti', nome: 'Contenuti', gruppo: 'Giochi', Icona: IconCalendar },
  { id: 'fortuna', nome: 'Fortuna', gruppo: 'Giochi', Icona: IconFortuna },
  { id: 'cloudflare', nome: 'Cloudflare', gruppo: 'Infrastruttura', Icona: IconaNuvola },
  { id: 'database', nome: 'Database', gruppo: 'Infrastruttura', Icona: IconaDatabase },
  { id: 'sql', nome: 'Console SQL', gruppo: 'Infrastruttura', Icona: IconaConsole },
  { id: 'annunci', nome: 'Annunci', gruppo: 'Gestione', Icona: IconaMegafono },
  { id: 'registro', nome: 'Registro', gruppo: 'Gestione', Icona: IconaRegistro },
  { id: 'errori', nome: 'Errori', gruppo: 'Gestione', Icona: IconaAvviso },
  { id: 'sistema', nome: 'Sistema', gruppo: 'Gestione', Icona: IconaSistema },
]

export const GRUPPI = [...new Set(SEZIONI.map((s) => s.gruppo))]

/** L'indirizzo di una sezione: la panoramica e' /admin. */
export const indirizzoDi = (id: IdSezione) => ROTTE.admin(id === 'panoramica' ? undefined : id)

/** Il menu delle sezioni, sul telefono: lo apre il bottone della barra di ogni schermata. */
export const GuscioContext = createContext<{ apriMenu: () => void }>({ apriMenu: () => {} })

interface Aggiornamento {
  quando: number | null
  aggiornando: boolean
  onAggiorna: () => void
}

/** Il bottone "Aggiorna" e l'ora dei dati di una sezione, dai suoi dati. */
export function aggiornaDa<T>(d: DatiAdmin<T>): Aggiornamento {
  return { quando: d.quando, aggiornando: d.aggiornando, onAggiorna: () => void d.ricarica() }
}

/**
 * I tre momenti dei dati di una sezione: non ci sono ancora (i blocchi grigi),
 * non sono arrivati (l'errore e "Riprova"), ci sono. Se ci sono e l'ultima
 * richiesta non e' andata, restano quelli di prima con un avviso sopra.
 */
export function ConDati<T>({
  d,
  attesa,
  sbiadisci = false,
  children,
}: {
  d: DatiAdmin<T>
  attesa?: ReactNode
  /** Mentre arriva la pagina dopo di un elenco, quella di prima resta, sbiadita. */
  sbiadisci?: boolean
  children: (dati: T) => ReactNode
}) {
  if (d.dati === undefined) {
    if (d.errore) return <Errore testo={d.errore} onRiprova={() => void d.ricarica()} />
    return <>{attesa ?? <Attesa />}</>
  }
  return (
    <>
      {d.errore && (
        <p className="adm-avviso-dati" role="status">
          Non riesco ad aggiornare: {d.errore}
        </p>
      )}
      <div className={`adm-dati${sbiadisci && d.aggiornando ? ' is-aggiorna' : ''}`}>{children(d.dati)}</div>
    </>
  )
}

/**
 * Una schermata del pannello: la `Pagina` dell'app, larga, con "Pannello
 * admin" sopra il titolo, e nella barra il bottone per rileggere i dati e,
 * sul telefono, quello delle sezioni. Sotto il titolo, quando sono arrivati i
 * dati che si vedono.
 */
export function Schermata({
  titolo,
  indietro,
  aggiorna,
  sotto,
  children,
}: {
  titolo: string
  indietro?: { a: string; etichetta: string }
  aggiorna?: Aggiornamento
  /** Sotto il titolo, prima dell'ora dei dati: "Giornata 51 · domenica 18 ottobre". */
  sotto?: string
  children: ReactNode
}) {
  const { apriMenu } = useContext(GuscioContext)
  const quando = aggiorna?.aggiornando
    ? 'aggiorno…'
    : aggiorna?.quando
      ? `aggiornato alle ${ora(aggiorna.quando)}`
      : null
  const riga = [sotto, quando].filter(Boolean).join(' · ')
  return (
    <Pagina
      titolo={titolo}
      sopra="Pannello admin"
      sotto={riga ? riga.charAt(0).toUpperCase() + riga.slice(1) : undefined}
      larga
      indietro={indietro ?? { a: ROTTE.profilo, etichetta: 'Profilo' }}
      azioni={
        <>
          {aggiorna && (
            <span className={`adm-ricarica${aggiorna.aggiornando ? ' is-gira' : ''}`}>
              <BottoneBarra etichetta="Aggiorna" onClick={aggiorna.onAggiorna}>
                <IconRefresh size={19} />
              </BottoneBarra>
            </span>
          )}
          <span className="adm-solo-telefono">
            <BottoneBarra etichetta="Sezioni" onClick={apriMenu}>
              <IconList size={20} />
            </BottoneBarra>
          </span>
        </>
      }
    >
      <div className="adm">{children}</div>
    </Pagina>
  )
}
