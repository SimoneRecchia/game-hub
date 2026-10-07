/**
 * Le schermate del tavolo: quel che tutti possono guardare insieme — l'alba,
 * la discussione, le nomine, le arringhe, com'e' andato il giorno, la fine.
 * Prendono la vista del tavolo, che non ha segreti. Sul telefono che passa di
 * mano sono lo schermo appoggiato in mezzo; online ognuno le vede sul suo.
 *
 * I bottoni che mandano avanti la partita sono di chi conduce (`onAvanti`):
 * sul telefono che passa di mano conduce il telefono, online chi ha aperto la
 * stanza, o chiunque se lui non si fa vedere. Chi non conduce legge chi
 * aspetta (`attesa`).
 */

import type { CSSProperties } from 'react'
import { Button } from '@/components/Button'
import { PERSONAGGI } from '@shared/lupus-personaggi'
import type { GiocatoreAlTavolo, VistaTavolo } from '@shared/lupus-vista'
import { IconaLupus } from './Icone'
import { Schermo } from './Notte'
import {
  BadgeRuolo,
  Cronaca,
  DiChiConduce,
  Gettone,
  Orologio,
  Segnalini,
  StrisciaVivi,
  TesseraGiocatore,
  TestaFase,
} from './Pezzi'
import { NOMI_FAZIONI, VINCITORI, fazioneDelVincitore, nomeDi, nomiDi } from './testi'

interface PropsTavolo {
  vista: VistaTavolo
  onAvanti?: () => void
  /** Chi non conduce: chi aspetta, detto in una riga. */
  attesa?: string
}

const perId = (giocatori: GiocatoreAlTavolo[], id: string) => giocatori.find((g) => g.id === id)

/** Il ruolo di chi e' morto, se il tavolo lo sa: il Mortovivo, la variante che lo dice. */
function RuoliSvelati({ vista, morti }: { vista: VistaTavolo; morti: string[] }) {
  const svelati = morti.map((id) => perId(vista.giocatori, id)).filter((g): g is GiocatoreAlTavolo => !!g?.ruolo)
  if (svelati.length === 0) return null
  return (
    <section className="lupus-carta-piccola" aria-label="Le carte mostrate">
      {svelati.map((g) => (
        <p key={g.id} className="lupus-svelato">
          <BadgeRuolo ruolo={g.ruolo!} size={32} />
          <strong>{g.nome}</strong>
          <span>{PERSONAGGI[g.ruolo!].nome}</span>
        </p>
      ))}
    </section>
  )
}

/* ─────────────────────────────  L'alba  ───────────────────────────── */

export function Alba({ vista, onAvanti, attesa }: PropsTavolo) {
  const a = vista.alba
  const morti = a?.morti ?? []
  const sotto =
    morti.length === 0
      ? 'Stanotte non è morto nessuno.'
      : morti.length === 1
        ? `Il villaggio si sveglia e trova ${nomeDi(vista.giocatori, morti[0])} senza vita.`
        : `Il villaggio si sveglia e piange ${nomiDi(vista.giocatori, morti)}.`
  return (
    <Schermo
      piede={
        <DiChiConduce onClick={onAvanti} attesa={attesa}>
          Apri la discussione
        </DiChiConduce>
      }
    >
      <TestaFase icona="sole" tono="giorno" titolo={`Giorno ${vista.giorno}`} sotto={sotto} />
      {a?.risorto && (
        <p className="lupus-avviso">
          <IconaLupus nome="baron" size={18} />
          {nomeDi(vista.giocatori, a.risorto)} torna dal regno dei morti.
        </p>
      )}
      {a?.jekyll && (
        <p className="lupus-avviso is-male">
          <IconaLupus nome="jekyll" size={18} />
          Stanotte il dottor Jekyll è diventato mister Hyde.
        </p>
      )}
      {a?.sopravvissuto && (
        <p className="lupus-avviso">
          <IconaLupus nome="dorian" size={18} />
          {nomeDi(vista.giocatori, a.sopravvissuto)} è Dorian Wolf: il ritratto lo salva.
        </p>
      )}
      {morti.some((id) => a?.cause[id] === 'teschio') && (
        <p className="lupus-avviso is-male">
          <IconaLupus nome="amleto" size={18} />
          Amleto si è rivelato: chi aveva il teschio muore con lui.
        </p>
      )}
      <RuoliSvelati vista={vista} morti={morti} />
      <Segnalini vista={vista} />
      <StrisciaVivi giocatori={vista.giocatori} />
    </Schermo>
  )
}

/* ─────────────────────────────  La discussione  ───────────────────────────── */

export function Discussione({ vista, onAvanti, attesa, scarto }: PropsTavolo & { scarto?: number }) {
  return (
    <Schermo
      piede={
        <DiChiConduce onClick={onAvanti} attesa={attesa}>
          Passa alle votazioni
        </DiChiConduce>
      }
    >
      <TestaFase icona="gente" tono="giorno" titolo="Discussione" sotto="Chi è il lupo? Accusate e difendetevi." />
      <Orologio inizio={vista.inizioFase} fine={vista.fineFase} scarto={scarto} />
      <Segnalini vista={vista} />
      <StrisciaVivi giocatori={vista.giocatori} />
    </Schermo>
  )
}

/* ─────────────────────────────  Le nomine  ───────────────────────────── */

/**
 * La votazione pubblica degli indiziati: i voti si vedono man mano, come le
 * mani alzate. Sul telefono che passa di mano vota uno alla volta, nell'ordine,
 * sullo schermo in mezzo (`votante`); online ognuno dal suo.
 */
export function Nomine({
  vista,
  votante,
  io,
  bersagli,
  scelto,
  onScegli,
  onVota,
  onChiudi,
  attesa,
}: {
  vista: VistaTavolo
  /** Chi vota adesso: sul telefono il prossimo dell'ordine, online io se devo ancora votare. */
  votante: string | null
  io?: string
  bersagli: string[]
  scelto: string | null
  onScegli: (id: string) => void
  onVota: (id: string) => void
  /** Chi conduce chiude la votazione con i voti che ci sono. */
  onChiudi?: () => void
  attesa?: string
}) {
  const voti = vista.votiNomine
  const conto: Record<string, number> = {}
  for (const t of Object.values(voti)) if (t) conto[t] = (conto[t] ?? 0) + 1
  const massimo = Math.max(0, ...Object.values(conto))
  const fatti = Object.keys(voti).length
  const totale = vista.ordineDiVoto.length
  const vivi = vista.giocatori.filter((g) => g.vivo)
  const titolo = votante
    ? votante === io
      ? 'Chi sospetti?'
      : `${nomeDi(vista.giocatori, votante)}, chi sospetti?`
    : 'Chi va sotto accusa?'
  return (
    <Schermo
      piede={
        <>
          {votante && (
            <Button
              variant="destructive"
              size="lg"
              fullWidth
              disabled={!scelto}
              onClick={() => scelto && onVota(scelto)}
            >
              {scelto ? `Vota ${nomeDi(vista.giocatori, scelto)}` : 'Tocca chi sospetti'}
            </Button>
          )}
          {!votante && attesa && <p className="lupus-attesa">{attesa}</p>}
          {onChiudi && fatti < totale && (
            <Button variant="plain" size="lg" fullWidth onClick={onChiudi}>
              Chiudi la votazione ({fatti} di {totale})
            </Button>
          )}
        </>
      }
    >
      <header className="lupus-testa-notte lupus-testa-notte--giorno">
        <span className="lupus-testa-notte__icona" aria-hidden="true">
          <IconaLupus nome="gente" size={30} />
        </span>
        <div className="lupus-testa-notte__testo">
          <p className="lupus-occhiello">Giorno {vista.giorno} · Nomine</p>
          <h2 className="lupus-testa-notte__titolo">{titolo}</h2>
          <p className="lupus-testa-notte__sotto">
            I due più votati vanno sotto accusa. Voti: {fatti} di {totale}.
          </p>
        </div>
      </header>
      <div className="lupus-ordine" aria-label="L’ordine di voto">
        {vista.ordineDiVoto.map((id) => (
          <Gettone key={id} id={id} nome={nomeDi(vista.giocatori, id)} morto={id in voti} acceso={id === votante} />
        ))}
      </div>
      <div className="lupus-elenco">
        {vivi.map((g) => {
          const chi = Object.entries(voti)
            .filter(([, t]) => t === g.id)
            .map(([v]) => nomeDi(vista.giocatori, v))
          const puo = votante !== null && bersagli.includes(g.id)
          return (
            <TesseraGiocatore
              key={g.id}
              giocatore={g}
              conto={conto[g.id] ?? 0}
              caldo={(conto[g.id] ?? 0) > 0 && conto[g.id] === massimo}
              sotto={chi.length > 0 ? chi.join(', ') : undefined}
              scelto={scelto === g.id}
              mostraRuolo={false}
              onClick={puo ? () => onScegli(g.id) : undefined}
            />
          )
        })}
      </div>
    </Schermo>
  )
}

/* ─────────────────────────────  Le arringhe  ───────────────────────────── */

/** Il gufato di oggi, se c'e': lo dice la cronaca delle nomine. */
function gufatoDiOggi(vista: VistaTavolo): string | null {
  const e = [...vista.cronaca].reverse().find((x) => x.t === 'indiziati')
  return e && e.t === 'indiziati' ? (e.gufato ?? null) : null
}

export function Arringhe({ vista, onAvanti, attesa, scarto }: PropsTavolo & { scarto?: number }) {
  const gufato = gufatoDiOggi(vista)
  return (
    <Schermo
      piede={
        <DiChiConduce onClick={onAvanti} attesa={attesa} variante="destructive">
          Al ballottaggio
        </DiChiConduce>
      }
    >
      <TestaFase
        icona="teschio"
        tono="sangue"
        titolo={vista.indiziati.length === 1 ? 'L’indiziato' : 'Gli indiziati'}
        sotto="Un’ultima arringa per difendersi, poi il voto segreto."
      />
      <div className="lupus-elenco">
        {vista.indiziati.map((id) => {
          const g = perId(vista.giocatori, id)
          if (!g) return null
          return (
            <TesseraGiocatore
              key={id}
              giocatore={g}
              conto={vista.conteggioNomine?.[id] ?? 0}
              caldo
              sotto={id === gufato ? 'Gufato' : undefined}
              mostraRuolo={false}
            />
          )
        })}
      </div>
      <Orologio inizio={vista.inizioFase} fine={vista.fineFase} scarto={scarto} />
    </Schermo>
  )
}

/* ─────────────────────────────  Com'e' andato il giorno  ───────────────────────────── */

/** Il ballottaggio, prima che scenda la notte: chi e' stato linciato, e i voti. */
export function EsitoDelGiorno({ vista, onAvanti, attesa }: PropsTavolo) {
  const e = vista.esitoBallottaggio
  const linciato = e?.linciato ? perId(vista.giocatori, e.linciato) : undefined
  const altri = e?.altriMorti ?? []
  const voci = Object.entries(e?.conteggio ?? {}).sort((a, b) => b[1] - a[1])
  const massimo = Math.max(1, ...voci.map(([, n]) => n))
  return (
    <Schermo
      piede={
        <DiChiConduce onClick={onAvanti} attesa={attesa}>
          <IconaLupus nome="luna" size={18} /> Scende la notte
        </DiChiConduce>
      }
    >
      <TestaFase
        icona={linciato ? 'teschio' : 'sole'}
        tono={linciato ? 'sangue' : 'giorno'}
        titolo={linciato ? 'Linciaggio' : 'Nessun linciaggio'}
        sotto={
          linciato
            ? `Il villaggio ha deciso: lincia ${linciato.nome}.`
            : 'Il villaggio non ha trovato un colpevole.'
        }
      />
      {linciato && <RuoliSvelati vista={vista} morti={[linciato.id]} />}
      {e?.sopravvissuto && (
        <p className="lupus-avviso">
          <IconaLupus nome="dorian" size={18} />
          {nomeDi(vista.giocatori, e.sopravvissuto)} è Dorian Wolf: il ritratto lo salva.
        </p>
      )}
      {altri.length > 0 && (
        <p className="lupus-avviso is-male">
          <IconaLupus nome="teschio" size={18} />
          Muore anche {nomiDi(vista.giocatori, altri)}.
        </p>
      )}
      {voci.length > 0 && (
        <section className="lupus-conteggio" aria-label="I voti del ballottaggio">
          <p className="lupus-etichetta">I voti</p>
          {voci.map(([id, n]) => (
            <div key={id} className="lupus-conteggio__voce">
              <p className="lupus-conteggio__riga">
                <strong>{nomeDi(vista.giocatori, id)}</strong>
                <span className="u-tabnum">{n}</span>
              </p>
              <span className="lupus-conteggio__barra">
                <span style={{ width: `${(n / massimo) * 100}%` } as CSSProperties} />
              </span>
            </div>
          ))}
        </section>
      )}
      <Segnalini vista={vista} />
    </Schermo>
  )
}

/* ─────────────────────────────  La fine  ───────────────────────────── */

export function Fine({
  vista,
  io,
  onAncora,
  ancora = 'Un’altra partita',
  onEsci,
  esci = 'Torna alla sala',
  attesa,
}: {
  vista: VistaTavolo
  /** Online: chi guarda, per dirgli se ha vinto. */
  io?: string
  onAncora?: () => void
  ancora?: string
  onEsci: () => void
  esci?: string
  attesa?: string
}) {
  const e = vista.esito!
  const v = VINCITORI[e.vincitore]
  const fazione = fazioneDelVincitore(e.vincitore)
  const mio = io ? e.vincitori.includes(io) : null
  return (
    <Schermo
      piede={
        <>
          {onAncora ? (
            <Button size="lg" fullWidth onClick={onAncora}>
              {ancora}
            </Button>
          ) : (
            attesa && <p className="lupus-attesa">{attesa}</p>
          )}
          <Button variant="plain" size="lg" fullWidth onClick={onEsci}>
            {esci}
          </Button>
        </>
      }
    >
      <section className={`lupus-esito is-${fazione}`}>
        <span className="lupus-esito__icona" aria-hidden="true">
          <IconaLupus nome={v.icona} size={44} />
        </span>
        <h2 className="lupus-esito__titolo">{v.titolo}</h2>
        <p className="lupus-esito__sotto">
          {mio === null ? v.sotto : mio ? `${v.sotto} Hai vinto.` : `${v.sotto} Hai perso.`}
        </p>
      </section>
      <section className="lupus-carta-piccola" aria-label="Chi era chi">
        <p className="lupus-etichetta">Chi era chi</p>
        {vista.giocatori.map((g) => {
          const ruolo = e.ruoli[g.id]
          const vince = e.vincitori.includes(g.id)
          const p = PERSONAGGI[ruolo]
          return (
            <div key={g.id} className={`lupus-chi${!g.vivo && !g.nonMorto ? ' is-morto' : ''}`}>
              <BadgeRuolo ruolo={ruolo} size={36} />
              <span className="lupus-chi__testo">
                <span className="lupus-chi__nome">{g.nome}</span>
                <span className="lupus-chi__ruolo">
                  {p.nome} · {NOMI_FAZIONI[p.fazione]}
                </span>
              </span>
              <span className={`lupus-chi__esito${vince ? ' is-vince' : ''}`}>
                {vince && <IconaLupus nome="corona" size={12} />}
                {vince ? 'Vince' : 'Perde'}
              </span>
            </div>
          )
        })}
      </section>
      <section className="lupus-carta-piccola" aria-label="La cronaca">
        <p className="lupus-etichetta">La cronaca</p>
        <Cronaca cronaca={vista.cronaca} giocatori={vista.giocatori} />
      </section>
    </Schermo>
  )
}

