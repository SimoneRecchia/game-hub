import type { CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Copertina } from '@/components/Copertina'
import { Sezione } from '@/components/Elementi'
import { IconChevronRight } from '@/components/Icons'
import { Vetrina } from '@/components/Vetrina'
import { DOVE_BREVE, useAmiciOnline } from '@/games/amici/amici'
import { GIOCHI, GIOCHI_DA_TAVOLO, giocoTavoloDi, type Gioco, type GiocoTavolo } from '@/games/catalog'
import { formatGameDate } from '@/lib/format'
import { usePresenza } from '@/lib/presenza'
import { gameDate } from '@shared/daily'
import type { AmicoOnline, GiocatoreBreve, GiocoDaTavolo } from '@shared/types'
import './Salotto.css'

/**
 * Le libere dei sei giochi: portano alla scelta della partita. Hanno la
 * stessa copertina delle carte dell'Arena, quindi niente transizione condivisa.
 */
const LIBERE: ReadonlyArray<{ id: Gioco['id']; nome: string; a: string }> = GIOCHI.map((g) => ({
  id: g.id,
  nome: g.nome,
  a: ROTTE.libera(g.id),
}))

/** I giochi da tavolo, con la copertina che si allarga nella sala dove arrivano. */
const DA_TAVOLO: ReadonlyArray<{ id: GiocoTavolo['id']; nome: string; a: string }> = GIOCHI_DA_TAVOLO.map((g) => ({
  id: g.id,
  nome: g.nome,
  a: `/${g.slug}`,
}))

/** Quanti amici si vedono nell'eroe: gli altri stanno in un tondo con il numero, che porta al profilo. */
const IN_VISTA = 4

/**
 * Il Salotto: le partite che non contano, quando si vuole e con chi c'e'. In
 * cima chi e' online, che si tocca per aprirne il profilo e invitarlo a
 * giocare; sotto le partite in corso con gli amici, le libere dei sei giochi e
 * i giochi da tavolo.
 */
export default function Salotto() {
  const amici = useAmiciOnline()
  const { dati: presenza } = usePresenza()
  const inCorso = partiteInCorso(presenza)

  return (
    <Vetrina scheda="salotto" titolo="Salotto" sopra={formatGameDate(gameDate())}>
      <ChiCe amici={amici} />

      {inCorso.length > 0 && (
        <Sezione titolo="In corso">
          <ul className="salotto__in-corso">
            {inCorso.map((p, i) => (
              <li key={p.a} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
                <Collegamento to={p.a} className="in-corso">
                  <Copertina gioco={p.gioco} formato="icona" />
                  <span className="in-corso__testo">
                    <span className="in-corso__nome">{p.nome}</span>
                    <span className="in-corso__con">con {p.avversario.displayName}</span>
                  </span>
                  {p.tuoTurno && <span className="in-corso__turno">Tocca a te</span>}
                  <Avatar nickname={p.avversario.nickname} color={p.avversario.avatarColor} size={30} />
                  <IconChevronRight size={18} className="in-corso__freccia" />
                </Collegamento>
              </li>
            ))}
          </ul>
        </Sezione>
      )}

      <Sezione titolo="Libere">
        <ul className="salotto__tessere">
          {LIBERE.map((l, i) => (
            <li key={l.id} className="entra" style={{ '--n': i + 2 } as CSSProperties}>
              <Tessera id={l.id} nome={l.nome} a={l.a} />
            </li>
          ))}
        </ul>
      </Sezione>

      <Sezione titolo="Da tavolo">
        <ul className="salotto__tessere">
          {DA_TAVOLO.map((l, i) => (
            <li key={l.id} className="entra" style={{ '--n': i + LIBERE.length + 2 } as CSSProperties}>
              <Tessera id={l.id} nome={l.nome} a={l.a} transizione={`copertina-${l.id}`} />
            </li>
          ))}
        </ul>
      </Sezione>
    </Vetrina>
  )
}

/** Una tessera: la copertina e il nome, come le icone di un telefono, che galleggiano un poco. */
function Tessera({
  id,
  nome,
  a,
  transizione,
}: {
  id: Gioco['id'] | GiocoDaTavolo
  nome: string
  a: string
  transizione?: string
}) {
  return (
    <Collegamento
      to={a}
      className="salotto-tessera"
      style={{ '--c1': `var(--${id}-1)`, '--c2': `var(--${id}-2)` } as CSSProperties}
    >
      <Copertina gioco={id} formato="icona" transizione={transizione} />
      <span className="salotto-tessera__nome">{nome}</span>
    </Collegamento>
  )
}

/** Chi c'e': gli amici online, con quel che fanno. Toccandone uno se ne apre il profilo. */
function ChiCe({ amici }: { amici: AmicoOnline[] | null }) {
  const visti = amici?.slice(0, IN_VISTA) ?? []
  const altri = amici ? amici.length - visti.length : 0
  return (
    <section className="eroe eroe--salotto chi-ce" aria-label="Chi c'è">
      <span className="eroe__testa">
        <span className="eroe__occhiello">Chi c'è</span>
        {amici && amici.length > 0 && (
          <span className="eroe__capsula">
            <span className="chi-ce__punto" aria-hidden="true" />
            {amici.length === 1 ? '1 online' : `${amici.length} online`}
          </span>
        )}
      </span>
      {amici === null ? (
        <span className="chi-ce__amici" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="chi-ce__vuoto" />
          ))}
        </span>
      ) : amici.length === 0 ? (
        <span className="chi-ce__nessuno">
          <span className="chi-ce__titolo">Nessuno online</span>
          <span className="chi-ce__sotto">Gioca da solo, o invita qualcuno da un gioco</span>
        </span>
      ) : (
        <ul className="chi-ce__amici">
          {visti.map((a, i) => (
            <li key={a.playerId} style={{ '--n': i } as CSSProperties}>
              <Collegamento to={ROTTE.amico(a.nickname)} stato={{ da: 'Salotto' }} className="chi-ce__amico">
                <span className="chi-ce__avatar">
                  <Avatar nickname={a.nickname} color={a.avatarColor} size={52} />
                  <span className="chi-ce__online" aria-hidden="true" />
                </span>
                <span className="chi-ce__nome">{a.displayName}</span>
                <span className="chi-ce__dove">{DOVE_BREVE[a.attivita]}</span>
              </Collegamento>
            </li>
          ))}
          {altri > 0 && (
            <li>
              <Collegamento to={ROTTE.profilo} stato={{ da: 'Salotto' }} className="chi-ce__amico">
                <span className="chi-ce__altri u-tabnum">+{altri}</span>
                <span className="chi-ce__nome">Altri</span>
              </Collegamento>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

interface PartitaInCorso {
  gioco: Gioco['id'] | GiocoDaTavolo
  nome: string
  a: string
  avversario: GiocatoreBreve
  tuoTurno: boolean
}

/** Le partite con gli amici ancora aperte, dal giro della presenza: la battaglia, Indovina chi, i tavolieri. */
function partiteInCorso(p: ReturnType<typeof usePresenza>['dati']): PartitaInCorso[] {
  if (!p) return []
  const partite: PartitaInCorso[] = []
  if (p.partita && p.partita.stato !== 'finita') {
    partite.push({
      gioco: 'battaglia',
      nome: 'Battaglia navale',
      a: ROTTE.partitaBattaglia(p.partita.id),
      avversario: p.partita.avversario,
      tuoTurno: p.partita.tuoTurno,
    })
  }
  if (p.partitaIndovina) {
    partite.push({
      gioco: 'indovina',
      nome: 'Indovina chi',
      a: ROTTE.partitaIndovina(p.partitaIndovina.id),
      avversario: p.partitaIndovina.avversario,
      tuoTurno: p.partitaIndovina.tocca !== null,
    })
  }
  if (p.partitaTavolo) {
    partite.push({
      gioco: p.partitaTavolo.gioco,
      nome: giocoTavoloDi(p.partitaTavolo.gioco).nome,
      a: ROTTE.partitaTavolo(p.partitaTavolo.gioco, p.partitaTavolo.id),
      avversario: p.partitaTavolo.avversario,
      tuoTurno: p.partitaTavolo.tuoTurno,
    })
  }
  if (p.duello) {
    partite.push({
      gioco: 'quiz',
      nome: 'Sfida a quiz',
      a: ROTTE.duelloQuiz(p.duello.id),
      avversario: p.duello.avversario,
      tuoTurno: false,
    })
  }
  return partite
}
