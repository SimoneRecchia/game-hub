/**
 * Come si gioca una partita: il mazzo e le regole, gli stessi per il telefono
 * che passa di mano e per la stanza online. Si aprono da due righe, ognuna in
 * un foglio; chi non conduce la stanza li vede e basta.
 */

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Cursore } from '@/components/Cursore'
import { Elenco, Riga } from '@/components/Elementi'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { IMPOSTAZIONI_LUPUS, type ImpostazioniLupus } from '@shared/lupus'
import {
  carteTotali,
  composizioneAutomatica,
  controllaComposizione,
  GIOCATORI_MINIMI,
  lupiIn,
  type Composizione,
} from '@shared/lupus-composizione'
import { PERSONAGGI, TUTTI_I_PERSONAGGI, type IdPersonaggio, type Serie } from '@shared/lupus-personaggi'
import { IconaLupus } from './Icone'
import { BadgeRuolo, Interruttore, Passi, PillolaFazione } from './Pezzi'
import {
  NOMI_GUFO,
  SECONDI_ARRINGHE,
  SECONDI_DISCUSSIONE,
  nomeConCopie,
  nomeDeiSecondi,
  piuVicino,
  regoleCambiate,
} from './testi'

const SERIE: { serie: Serie; titolo: string }[] = [
  { serie: 'base', titolo: 'Lupus in Tabula' },
  { serie: 'espansione', titolo: 'La vendetta della Lupa Mannara' },
]

/* ─────────────────────────────  Le due righe  ───────────────────────────── */

/** Le righe che aprono il mazzo e le regole, con quel che si e' scelto a destra. */
export function RigheDellaPartita({
  giocatori,
  composizione,
  regole,
  onMazzo,
  onRegole,
}: {
  giocatori: number
  composizione: Composizione | null
  regole: ImpostazioniLupus
  onMazzo: () => void
  onRegole: () => void
}) {
  const cambiate = regoleCambiate(regole, IMPOSTAZIONI_LUPUS)
  const mazzo = composizione ?? (giocatori >= GIOCATORI_MINIMI ? composizioneAutomatica(giocatori) : null)
  return (
    <Elenco>
      <Riga
        icona={<IconaLupus nome="lupo" size={18} />}
        titolo="Personaggi"
        sotto={mazzo ? riassuntoDelMazzo(mazzo) : undefined}
        valore={composizione ? 'A scelta' : 'Del regolamento'}
        onClick={onMazzo}
      />
      <Riga
        icona={<IconaLupus nome="luna" size={18} />}
        titolo="Regole"
        valore={cambiate === 0 ? 'Del regolamento' : cambiate === 1 ? '1 cambiata' : `${cambiate} cambiate`}
        onClick={onRegole}
      />
    </Elenco>
  )
}

/** "2 lupi, Veggente, Medium e 4 villici". */
function riassuntoDelMazzo(c: Composizione): string {
  const lupi = lupiIn(c)
  const altri = TUTTI_I_PERSONAGGI.filter((id) => (c[id] ?? 0) > 0 && !PERSONAGGI[id].contaComeLupo && id !== 'villico')
  const villici = c.villico ?? 0
  const pezzi = [
    lupi === 1 ? '1 lupo' : `${lupi} lupi`,
    ...altri.map((id) => nomeConCopie(id, c[id] ?? 0)),
    ...(villici > 0 ? [villici === 1 ? '1 villico' : `${villici} villici`] : []),
  ]
  return pezzi.length <= 1 ? pezzi.join('') : `${pezzi.slice(0, -1).join(', ')} e ${pezzi[pezzi.length - 1]}`
}

/* ─────────────────────────────  Il mazzo  ───────────────────────────── */

/**
 * Il mazzo: quello del regolamento per quei giocatori, o personaggio per
 * personaggio. Sotto, quel che non va: gli errori fermano il via, gli avvisi
 * no. Senza `onCambia` si guarda soltanto.
 */
export function FoglioMazzo({
  open,
  onClose,
  giocatori,
  composizione,
  onCambia,
}: {
  open: boolean
  onClose: () => void
  giocatori: number
  composizione: Composizione | null
  onCambia?: (c: Composizione | null) => void
}) {
  const [dettaglio, setDettaglio] = useState<IdPersonaggio | null>(null)
  const pochi = giocatori < GIOCATORI_MINIMI
  const effettiva = composizione ?? composizioneAutomatica(Math.max(GIOCATORI_MINIMI, giocatori))
  const problemi = pochi ? [] : controllaComposizione(effettiva, giocatori)
  const totale = carteTotali(effettiva)
  const lupi = lupiIn(effettiva)

  const cambia = (id: IdPersonaggio, n: number) => {
    const dopo: Composizione = { ...effettiva, [id]: n }
    if (n === 0) delete dopo[id]
    onCambia?.(dopo)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Personaggi">
      <div className="lupus-foglio">
        {onCambia && (
          <SegmentedControl
            ariaLabel="Il mazzo"
            value={composizione === null ? 'regolamento' : 'scelta'}
            onChange={(v) => onCambia(v === 'regolamento' ? null : { ...effettiva })}
            options={[
              { value: 'regolamento', label: 'Del regolamento' },
              { value: 'scelta', label: 'A scelta' },
            ]}
          />
        )}
        {pochi && <p className="lupus-avviso">Servono almeno {GIOCATORI_MINIMI} giocatori per il mazzo.</p>}
        {!pochi && composizione === null && (
          <>
            <p className="lupus-etichetta">Per {giocatori} giocatori</p>
            <div className="lupus-mazzo">
              {TUTTI_I_PERSONAGGI.filter((id) => (effettiva[id] ?? 0) > 0).map((id) => (
                <button key={id} type="button" className="lupus-mazzo__carta" onClick={() => setDettaglio(id)}>
                  <BadgeRuolo ruolo={id} size={26} />
                  {nomeConCopie(id, effettiva[id] ?? 0)}
                </button>
              ))}
            </div>
          </>
        )}
        {!pochi && composizione !== null && (
          <>
            <p className={`lupus-totale${totale !== giocatori ? ' is-male' : ''}`}>
              <span className="u-tabnum">
                {totale} di {giocatori} personaggi
              </span>
              <span className="u-tabnum">{lupi === 1 ? '1 lupo' : `${lupi} lupi`}</span>
            </p>
            {SERIE.map(({ serie, titolo }) => (
              <section key={serie} className="lupus-serie" aria-label={titolo}>
                <p className="lupus-etichetta">{titolo}</p>
                <div className="lupus-serie__righe">
                  {TUTTI_I_PERSONAGGI.filter((id) => PERSONAGGI[id].serie === serie).map((id) => {
                    const p = PERSONAGGI[id]
                    const n = effettiva[id] ?? 0
                    return (
                      <div key={id} className={`lupus-serie__riga${n > 0 ? ' is-dentro' : ''}`}>
                        <button type="button" className="lupus-serie__chi" onClick={() => setDettaglio(id)}>
                          <BadgeRuolo ruolo={id} size={34} />
                          <span className="lupus-serie__testo">
                            <span className="lupus-serie__nome">{p.nome}</span>
                            <span className="lupus-serie__sotto">
                              {p.minimoGiocatori > 0 ? `Da ${p.minimoGiocatori} giocatori` : 'Sempre'}
                              {p.inBlocchi > 1 ? ' · in coppia' : ''}
                            </span>
                          </span>
                        </button>
                        {onCambia ? (
                          <Passi
                            valore={n}
                            massimo={p.massimo}
                            passo={p.inBlocchi}
                            etichetta={p.nome}
                            onCambia={(v) => cambia(id, v)}
                          />
                        ) : (
                          <span className="lupus-serie__quante u-tabnum">{n}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </>
        )}
        {problemi.map((p, i) => (
          <p key={i} className={`lupus-avviso${p.livello === 'errore' ? ' is-male' : ''}`}>
            {p.messaggio}
          </p>
        ))}
      </div>
      <FoglioPersonaggio ruolo={dettaglio} onClose={() => setDettaglio(null)} />
    </Sheet>
  )
}

/** Un personaggio per intero: il tondo, la fazione, la regola, e che cosa fa di notte. */
export function FoglioPersonaggio({ ruolo, onClose }: { ruolo: IdPersonaggio | null; onClose: () => void }) {
  const p = ruolo ? PERSONAGGI[ruolo] : null
  return (
    <Sheet open={p !== null} onClose={onClose} title={p?.nome}>
      {p && (
        <div className="lupus-foglio">
          <div className="lupus-personaggio">
            <BadgeRuolo ruolo={p.id} size={64} />
            <span className="lupus-personaggio__testo">
              <span className="lupus-personaggio__motto">{p.motto}</span>
              <span className="lupus-personaggio__pillole">
                <PillolaFazione fazione={p.fazione} />
                <span className="lupus-segno">{p.serie === 'base' ? 'Gioco base' : 'Espansione'}</span>
              </span>
            </span>
          </div>
          <p className="lupus-foglio__testo">{p.descrizione}</p>
          {p.consiglioNotte && (
            <p className="lupus-avviso">
              <IconaLupus nome="luna" size={16} />
              {p.consiglioNotte}
            </p>
          )}
          {p.minimoGiocatori > 0 && (
            <p className="lupus-foglio__nota">Il regolamento lo consiglia da {p.minimoGiocatori} giocatori.</p>
          )}
        </div>
      )}
    </Sheet>
  )
}

/* ─────────────────────────────  Le regole  ───────────────────────────── */

function Impostazione({ titolo, valore, children }: { titolo: string; valore?: string; children?: ReactNode }) {
  return (
    <div className="lupus-impostazione">
      <span className="lupus-impostazione__testa">
        <span className="lupus-impostazione__titolo">{titolo}</span>
        {valore && <span className="lupus-impostazione__valore">{valore}</span>}
      </span>
      {children}
    </div>
  )
}

/** Un si' o no: l'interruttore per chi decide, la parola per chi guarda. */
function SiNo({
  titolo,
  valore,
  onCambia,
}: {
  titolo: string
  valore: boolean
  onCambia?: (v: boolean) => void
}) {
  return (
    <div className="lupus-impostazione lupus-impostazione--riga">
      <span className="lupus-impostazione__titolo">{titolo}</span>
      {onCambia ? (
        <Interruttore acceso={valore} onCambia={onCambia} etichetta={titolo} />
      ) : (
        <span className="lupus-impostazione__valore">{valore ? 'Sì' : 'No'}</span>
      )}
    </div>
  )
}

/** Le regole della partita: le varianti del regolamento e i tempi del giorno. */
export function FoglioRegole({
  open,
  onClose,
  regole,
  onCambia,
}: {
  open: boolean
  onClose: () => void
  regole: ImpostazioniLupus
  onCambia?: (r: ImpostazioniLupus) => void
}) {
  const metti = onCambia
    ? <K extends keyof ImpostazioniLupus>(k: K) =>
        (v: ImpostazioniLupus[K]) =>
          onCambia({ ...regole, [k]: v })
    : null
  const discussione = piuVicino(SECONDI_DISCUSSIONE, regole.secondiDiscussione)
  const arringhe = piuVicino(SECONDI_ARRINGHE, regole.secondiArringhe)
  return (
    <Sheet open={open} onClose={onClose} title="Regole">
      <div className="lupus-foglio">
        <div className="lupus-impostazioni">
          <SiNo
            titolo="Prima notte senza vittime"
            valore={regole.primaNotteSenzaVittime}
            onCambia={metti?.('primaNotteSenzaVittime')}
          />
          <SiNo titolo="I fantasmi votano" valore={regole.fantasmiVotano} onCambia={metti?.('fantasmiVotano')} />
          <SiNo
            titolo="Carta svelata alla morte"
            valore={regole.rivelaRuoloAllaMorte}
            onCambia={metti?.('rivelaRuoloAllaMorte')}
          />
        </div>
        <div className="lupus-impostazioni">
          <Impostazione titolo="Gufo letale" valore={metti ? undefined : NOMI_GUFO[regole.gufoLetale]}>
            {metti && (
              <SegmentedControl
                ariaLabel="Gufo letale"
                value={regole.gufoLetale}
                onChange={metti('gufoLetale')}
                options={[
                  { value: 'auto', label: 'Da 20' },
                  { value: 'si', label: 'Sempre' },
                  { value: 'no', label: 'Mai' },
                ]}
              />
            )}
          </Impostazione>
          <Impostazione titolo="Discussione" valore={nomeDeiSecondi(discussione)}>
            {metti && (
              <Cursore
                ariaLabel="Discussione"
                valori={SECONDI_DISCUSSIONE}
                valore={discussione}
                etichetta={nomeDeiSecondi}
                voce={(s) => (s === 0 ? 'senza tempo' : nomeDeiSecondi(s))}
                onChange={metti('secondiDiscussione')}
              />
            )}
          </Impostazione>
          <Impostazione titolo="Arringhe" valore={nomeDeiSecondi(arringhe)}>
            {metti && (
              <Cursore
                ariaLabel="Arringhe"
                valori={SECONDI_ARRINGHE}
                valore={arringhe}
                etichetta={nomeDeiSecondi}
                voce={(s) => (s === 0 ? 'senza tempo' : nomeDeiSecondi(s))}
                onChange={metti('secondiArringhe')}
              />
            )}
          </Impostazione>
        </div>
        {onCambia && regoleCambiate(regole, IMPOSTAZIONI_LUPUS) > 0 && (
          <Button variant="plain" fullWidth onClick={() => onCambia(IMPOSTAZIONI_LUPUS)}>
            Ripristina le regole
          </Button>
        )}
      </div>
    </Sheet>
  )
}
