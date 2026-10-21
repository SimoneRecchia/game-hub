import type { CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Biglietto } from '@/components/Biglietto'
import { Copertina } from '@/components/Copertina'
import { Sezione } from '@/components/Elementi'
import { IconChevronRight } from '@/components/Icons'
import { Vetrina } from '@/components/Vetrina'
import { useAmiciOnline } from '@/games/amici/amici'
import { CATEGORIE_LIBERE, COLORE_FAMIGLIA, GIOCHI, giocoTavoloDi, type Gioco } from '@/games/catalog'
import { NOMI_AL_TAVOLO } from '@/games/tavolo/nomi'
import { formatGameDate } from '@/lib/format'
import { usePresenza } from '@/lib/presenza'
import { gameDate } from '@shared/daily'
import type { AmicoOnline, GiocatoreBreve, GiocoDaTavolo } from '@shared/types'
import './Libere.css'

/** Di quanti gradi e' storto ogni adesivo, a mano. */
const STORTI = [-6, 5, -4, 6, -5, 4, -6, 5, -3, 6]

/**
 * Le famiglie dei giochi: un gioco classificato porta alla sua libera, uno da
 * tavolo alla sua sala.
 */
const FAMIGLIE = CATEGORIE_LIBERE.map((c, k) => ({
  nome: c.nome,
  // Le righe entrano una dopo l'altra, anche da una famiglia alla seguente.
  prima: CATEGORIE_LIBERE.slice(0, k).reduce((n, x) => n + x.giochi.length, 0),
  giochi: c.giochi.map((id) => {
    const classificato = GIOCHI.find((g) => g.id === id)
    if (classificato) {
      return { id, nome: classificato.nome, motto: classificato.motto, a: ROTTE.libera(classificato.id) }
    }
    const tavolo = giocoTavoloDi(id as GiocoDaTavolo)
    return { id, nome: tavolo.nome, motto: tavolo.motto, a: `/${tavolo.slug}` }
  }),
}))

/** Le cabine della ruota panoramica: gli amici che ci salgono, gli altri nel conto. */
const CABINE = 5

/**
 * Le Libere: le partite che non contano, quando si vuole e con chi c'e'. In
 * cima la ruota panoramica con gli amici online, che si toccano per aprirne il
 * profilo e invitarli a giocare; sotto le partite in corso con gli amici, come
 * biglietti, e i giochi divisi per famiglia (`CATEGORIE_LIBERE`), le libere
 * dei classificati con i giochi da tavolo.
 */
export default function Libere() {
  const amici = useAmiciOnline()
  const { dati: presenza } = usePresenza()
  const inCorso = partiteInCorso(presenza)

  return (
    <Vetrina scheda="libere" titolo="Libere" sopra={formatGameDate(gameDate())} classifica={ROTTE.classifica()}>
      <ChiCe amici={amici} />

      {inCorso.length > 0 && (
        <Sezione titolo="In corso">
          <ul className="libere__in-corso">
            {inCorso.map((p, i) => (
              <li key={p.a} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
                <BigliettoPartita partita={p} i={i} />
              </li>
            ))}
          </ul>
        </Sezione>
      )}

      <div className="libere__famiglie">
        {FAMIGLIE.map((f) => (
          <Sezione
            key={f.nome}
            titolo={f.nome}
            conto={f.giochi.length === 1 ? '1 gioco' : `${f.giochi.length} giochi`}
            className="libere__famiglia"
            stile={{ '--conto': COLORE_FAMIGLIA[f.nome] } as CSSProperties}
          >
            <ul className="libere__giochi">
              {f.giochi.map((l, i) => (
                <li key={l.id} className="entra" style={{ '--n': f.prima + i + 2 } as CSSProperties}>
                  <RigaGioco id={l.id} nome={l.nome} motto={l.motto} a={l.a} giro={STORTI[(f.prima + i) % 10]} />
                </li>
              ))}
            </ul>
          </Sezione>
        ))}
      </div>
    </Vetrina>
  )
}

/** Un gioco della famiglia: il vetrino con l'adesivo, il nome, il motto e la freccia. */
function RigaGioco({
  id,
  nome,
  motto,
  a,
  giro,
}: {
  id: Gioco['id'] | GiocoDaTavolo
  nome: string
  motto: string
  a: string
  giro: number
}) {
  return (
    <Collegamento to={a} className="libere-gioco" style={{ '--giro': `${giro}deg` } as CSSProperties}>
      <Copertina gioco={id} formato="icona" className="libere-gioco__vetrino" />
      <span className="libere-gioco__testo">
        <span className="libere-gioco__nome">{nome}</span>
        <span className="libere-gioco__motto">{motto}</span>
      </span>
      <IconChevronRight size={20} className="libere-gioco__freccia" />
    </Collegamento>
  )
}

/** Il numero di una partita sul biglietto: dall'indirizzo, sempre lo stesso per la stessa partita. */
function numeroDi(a: string): string {
  let h = 7
  for (let i = 0; i < a.length; i += 1) h = (h * 31 + a.charCodeAt(i)) % 10_000
  return String(h).padStart(4, '0')
}

/** Una partita in corso: un biglietto nel colore del gioco, e sul talloncino di chi e' il turno. */
function BigliettoPartita({ partita: p, i }: { partita: PartitaInCorso; i: number }) {
  const talloncino = p.tuoTurno ? ['Tocca', 'a te'] : p.avversario ? ['Tocca', `a ${p.avversario.displayName}`] : ['Apri', '']
  return (
    <Collegamento
      to={p.a}
      className={`partita-biglietto${p.tuoTurno ? ' is-turno' : ''}`}
      style={{ '--giro': `${i % 2 ? 1 : -1}deg`, '--ritardo': `${i * 0.6}s` } as CSSProperties}
    >
      <Biglietto colore={`color-mix(in srgb, var(--${p.gioco}-tinta) 42%, #fff)`}>
        <span className="partita-biglietto__dentro">
          <span className="partita-biglietto__gioco">
            <Copertina gioco={p.gioco} formato="icona" className="partita-biglietto__vetrino" />
            <span className="partita-biglietto__testi">
              <span className="partita-biglietto__numero">Partita N° {numeroDi(p.a)}</span>
              <span className="partita-biglietto__titolo">
                {p.nome}
                {p.avversario ? ` con ${p.avversario.displayName}` : ''}
              </span>
              {p.sotto && <span className="partita-biglietto__sotto">{p.sotto}</span>}
            </span>
          </span>
          <span className="partita-biglietto__talloncino">
            <span>{talloncino[0]}</span>
            {talloncino[1] && <span className="partita-biglietto__chi">{talloncino[1]}</span>}
          </span>
        </span>
      </Biglietto>
    </Collegamento>
  )
}

/** Dove sta la cabina numero `i` sulla ruota: in cerchio, la prima in cima. */
function postoCabina(i: number) {
  const a = (i / CABINE) * 2 * Math.PI
  return { left: `${50 + 41 * Math.sin(a)}%`, top: `${50 - 41 * Math.cos(a)}%` }
}

/**
 * Chi c'e': una ruota panoramica che gira piano, con gli amici online nelle
 * cabine — toccandone uno se ne apre il profilo — e accanto quanti sono e il
 * tasto per invitarli. Le cabine girano con la ruota e le faccine restano
 * dritte, girando al contrario.
 */
function ChiCe({ amici }: { amici: AmicoOnline[] | null }) {
  const saliti = amici?.slice(0, CABINE) ?? []
  const altri = amici ? amici.length - saliti.length : 0
  const nomi = saliti.slice(0, 4).map((a) => a.displayName)
  const quanti = amici?.length ?? 0
  return (
    <section className="eroe chi-ce" aria-label="Chi c'è">
      <div className="chi-ce__ruota" aria-hidden={amici === null}>
        <svg className="chi-ce__sostegno" viewBox="0 0 184 206" aria-hidden="true">
          <path d="M92 92L52 206M92 92l40 114M64 176h56" />
        </svg>
        <div className="chi-ce__giro">
          <svg className="chi-ce__raggi" viewBox="0 0 156 156" aria-hidden="true">
            <circle className="chi-ce__cerchio" cx="78" cy="78" r="64" />
            <circle className="chi-ce__mozzo-anello" cx="78" cy="78" r="26" />
            <path d="M78 14v128M14 78h128M32.7 32.7l90.6 90.6M123.3 32.7l-90.6 90.6" />
            <circle className="chi-ce__mozzo" cx="78" cy="78" r="7" />
          </svg>
          <ul className="chi-ce__amici">
            {Array.from({ length: CABINE }, (_, i) => {
              const a = saliti[i]
              return (
                <li key={a?.playerId ?? `vuota-${i}`} style={{ ...postoCabina(i), '--n': i } as CSSProperties}>
                  <span className="chi-ce__dritta">
                    {a ? (
                      <Collegamento
                        to={ROTTE.amico(a.nickname)}
                        stato={{ da: 'Libere' }}
                        className="chi-ce__cabina"
                        aria-label={`${a.displayName}, il profilo`}
                      >
                        <Avatar nickname={a.nickname} color={a.avatarColor} size={36} />
                      </Collegamento>
                    ) : (
                      <span className="chi-ce__cabina is-vuota" aria-hidden="true" />
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      <div className="chi-ce__testi">
        {amici === null ? (
          <>
            <span className="chi-ce__titolo scheletro" />
            <span className="chi-ce__nomi scheletro" />
          </>
        ) : (
          <>
            <h2 className="chi-ce__titolo">
              {quanti === 0 ? 'Nessuno online' : quanti === 1 ? '1 amico online' : `${quanti} amici online`}
            </h2>
            <p className="chi-ce__nomi">
              {quanti === 0
                ? 'Gioca da solo, o cerca qualcuno da sfidare'
                : nomi.join(', ') + (quanti > nomi.length ? ` e ${quanti === nomi.length + 1 ? 'un altro' : `altri ${quanti - nomi.length}`}` : '')}
            </p>
          </>
        )}
        <Collegamento to={ROTTE.profilo} stato={{ da: 'Libere' }} className="chi-ce__invita">
          {quanti === 0 ? 'Cerca una persona' : 'Invita a giocare'}
        </Collegamento>
        {altri > 0 && <span className="u-visually-hidden">e altri {altri} online</span>}
      </div>
    </section>
  )
}

interface PartitaInCorso {
  gioco: Gioco['id'] | GiocoDaTavolo
  nome: string
  a: string
  /** Con chi, se e' uno solo; una stanza di Lupus dice quanti sono (`sotto`). */
  avversario?: GiocatoreBreve
  sotto?: string
  tuoTurno: boolean
}

/**
 * Le partite con gli amici ancora aperte, dal giro della presenza: la
 * battaglia, Indovina chi, i tavolieri, la sfida a quiz e la stanza di Lupus.
 */
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
      nome: NOMI_AL_TAVOLO[p.partitaTavolo.gioco],
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
  if (p.stanzaLupus && p.stanzaLupus.stato !== 'finita') {
    const s = p.stanzaLupus
    partite.push({
      gioco: 'lupus',
      nome: `Lupus · ${s.codice}`,
      a: ROTTE.stanzaLupus(s.codice),
      sotto: s.stato === 'partita' ? 'Partita in corso' : s.iscritti === 1 ? 'Aspetti gli altri' : `In ${s.iscritti}`,
      tuoTurno: false,
    })
  }
  if (p.stanzaScarabocchi && p.stanzaScarabocchi.stato !== 'finita') {
    const s = p.stanzaScarabocchi
    partite.push({
      gioco: 'scarabocchi',
      nome: `Scarabocchi · ${s.codice}`,
      a: ROTTE.stanzaScarabocchi(s.codice),
      sotto: s.stato === 'partita' ? 'Partita in corso' : s.iscritti === 1 ? 'Aspetti gli altri' : `In ${s.iscritti}`,
      tuoTurno: false,
    })
  }
  return partite
}
