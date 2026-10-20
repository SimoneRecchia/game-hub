import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { CodicePosa, EsitoPosa } from '@shared/scarabeo'
import { JOLLY } from '@shared/scarabeo'
import { IconAnnulla, IconShuffle } from '@/components/Icons'
import { Sheet } from '@/components/Sheet'
import { Leggio, ScegliJolly } from './Leggio'
import { Tabellone } from './Tabellone'
import type { Composizione } from './useComposizione'

interface Props {
  /** La posa in corso: tabellone, leggio, cursore. */
  c: Composizione
  /** Le parole della posa che il dizionario non conosce; null se non si sa ancora. */
  sconosciute: string[] | null
  /** Sopra al tabellone: il punteggio. */
  testa: ReactNode
  /** A partita chiusa, al posto di leggio e comandi. */
  fine?: ReactNode
  /** Mentre si aspetta il server o l'avversario non si tocca niente. */
  bloccato: boolean
  /** Sul bottone grande al posto di "Gioca", mentre si aspetta: "Il computer pensa…". */
  attesa?: string | null
  /** Tessere rimaste nel sacchetto: senza, non si cambia. */
  restanti: number
  /** Le tessere si cambiano: non con i leggii gemelli, che sono nuovi a ogni turno, e il bottone non c'e'. */
  cambiabili?: boolean
  evidenziate?: ReadonlySet<number>
  /** Chi guarda in compagnia compone e suggerisce: niente cambio e niente passo, e il bottone lo dice. */
  suggerisci?: boolean
  /**
   * Sotto i comandi, dove c'e' posto: le ultime mosse, o come si gioca finché
   * non ce n'e' nessuna. Toccata, apre l'elenco intero.
   */
  ultime?: { voci: readonly VoceMossa[]; aiuto: string; onApri?: () => void }
  onGioca: () => void
  onPassa: () => void
  onCambia: (tessere: string[]) => void
}

/**
 * Il campo da gioco dello Scarabeo: tabellone, leggio e comandi.
 *
 * E' lo stesso nella classificata e nella libera — cambia solo cosa c'e' sopra
 * (il punteggio contro il traguardo del computer, o contro il computer che
 * gioca) e cosa succede quando si preme "Gioca". Il tabellone prende lo spazio
 * che resta, così leggio e bottoni stanno sempre sotto il pollice anche su un
 * telefono basso: sono le due cose che si toccano a ogni mossa.
 *
 * I comandi sono una riga sola, come nell'album: riprendere le tessere,
 * mischiarle, passare o cambiarle, e giocare. Passare e cambiare chiedono
 * conferma in un foglio: costano un turno, e un bottone accanto a "Gioca" si
 * preme per sbaglio.
 */
export function Campo({
  c,
  sconosciute,
  testa,
  fine,
  bloccato,
  attesa,
  restanti,
  cambiabili = true,
  evidenziate,
  suggerisci = false,
  ultime,
  onGioca,
  onPassa,
  onCambia,
}: Props) {
  const [foglio, setFoglio] = useState<'cambio' | 'passa' | null>(null)
  const [selezione, setSelezione] = useState<Set<number>>(new Set())
  const [mescolata, setMescolata] = useState(0)

  const chiudiFoglio = useCallback(() => {
    setFoglio(null)
    setSelezione(new Set())
  }, [])

  // Il leggio mischiato si scuote: le tessere cambiano posto, e si deve vedere.
  useEffect(() => {
    if (!mescolata) return
    const t = window.setTimeout(() => setMescolata(0), 420)
    return () => window.clearTimeout(t)
  }, [mescolata])

  const scegli = (indice: number) =>
    setSelezione((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(indice)) dopo.delete(indice)
      else dopo.add(indice)
      return dopo
    })

  const confermaCambio = () => {
    const tessere = [...selezione].map((i) => c.mano[i])
    chiudiFoglio()
    onCambia(tessere)
  }

  const anteprima = c.anteprima
  const sbagliata = (sconosciute?.length ?? 0) > 0
  const valida = !!anteprima?.ok && !sbagliata
  const verbo = suggerisci ? 'Suggerisci' : 'Gioca'
  const etichetta = attesa
    ? attesa
    : sbagliata
      ? sconosciute!.length === 1
        ? 'Non esiste'
        : 'Non esistono'
      : valida
        ? `${anteprima!.scarabeo ? 'Scarabeo' : verbo} · ${anteprima!.punti}`
        : verbo
  const giocaSpento = c.sospese.length === 0 || bloccato || foglio !== null

  return (
    <div className="scr">
      {testa}

      <div className="scr__campo">
        <Tabellone
          tabellone={c.tabellone}
          sospese={c.sospese}
          cursore={c.cursore}
          bloccato={bloccato || !!fine}
          onTocca={c.tocca}
          evidenziate={evidenziate}
          sbagliata={sbagliata}
        />
      </div>

      {fine ?? (
        <div className="scr__mano">
          <Leggio
            mano={c.mano}
            impegnate={c.impegnate}
            cambio={false}
            selezione={NESSUNA}
            mescolata={mescolata}
            bloccato={bloccato}
            onUsa={c.usaTessera}
            onSposta={c.sposta}
            onPosa={c.posaSu}
          />

          <div className="scr__comandi">
            <button
              type="button"
              className="scr-tasto scr-tasto--tondo"
              onClick={c.annulla}
              disabled={c.sospese.length === 0}
              aria-label="Rimetti in mano"
            >
              <IconAnnulla size={23} />
            </button>
            <button
              type="button"
              className="scr-tasto scr-tasto--tondo"
              onClick={() => {
                c.mischia()
                setMescolata((n) => n + 1)
              }}
              disabled={bloccato || c.sospese.length > 0 || c.mano.length < 2}
              aria-label="Mischia il leggio"
            >
              <IconShuffle size={23} />
            </button>
            {!suggerisci &&
              (cambiabili ? (
                <button
                  type="button"
                  className="scr-tasto"
                  onClick={() => {
                    c.annulla()
                    setFoglio('cambio')
                  }}
                  disabled={bloccato}
                >
                  <IconaCambia /> Cambia
                </button>
              ) : (
                <button type="button" className="scr-tasto" onClick={() => setFoglio('passa')} disabled={bloccato}>
                  <IconaPassa /> Passa
                </button>
              ))}
            <button
              type="button"
              className={`scr-tasto scr-tasto--gioca${valida && !giocaSpento ? ' is-pronto' : ''}${
                sbagliata ? ' is-sbagliata' : ''
              }`}
              onClick={onGioca}
              disabled={giocaSpento}
              aria-busy={!!attesa || undefined}
            >
              {attesa && <span className="scr-tasto__attesa" aria-hidden="true" />}
              <span className="scr-tasto__testo">{etichetta}</span>
            </button>
          </div>

          {ultime && <UltimeMosse {...ultime} />}
        </div>
      )}

      <ScegliJolly aperto={c.jollyAperto !== null} onScegli={c.scegliJolly} onChiudi={c.chiudiJolly} />

      <Sheet open={foglio === 'cambio'} onClose={chiudiFoglio} title="Cambia le tessere">
        <p className="scr-conferma__lede">
          {restanti > 0
            ? `Scegli le tessere da rimettere nel sacchetto: ne restano ${restanti}.`
            : 'Il sacchetto è vuoto: puoi solo passare.'}
        </p>
        <div className="scr-cambio" role="group" aria-label="Le tessere da cambiare">
          {c.mano.map((t, i) => (
            <button
              type="button"
              key={`${t}-${i}`}
              className={`tessera scr-cambio__tessera${selezione.has(i) ? ' is-scelta' : ''}`}
              aria-pressed={selezione.has(i)}
              aria-label={t === JOLLY ? 'Jolly' : t.toUpperCase()}
              disabled={restanti === 0}
              onClick={() => scegli(i)}
            >
              <span className="tessera__lettera">
                {t === JOLLY ? (
                  <svg className="tessera__stella" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" />
                  </svg>
                ) : (
                  t.toUpperCase()
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="scr-conferma__azioni">
          <button
            type="button"
            className="scr-tasto scr-tasto--largo scr-tasto--giallo"
            disabled={selezione.size === 0 || restanti === 0 || bloccato}
            onClick={confermaCambio}
          >
            {selezione.size === 0
              ? 'Scegli le tessere'
              : selezione.size === 1
                ? 'Cambia una tessera'
                : `Cambia ${selezione.size} tessere`}
          </button>
          <button
            type="button"
            className="scr-tasto scr-tasto--largo"
            disabled={bloccato}
            onClick={() => {
              chiudiFoglio()
              onPassa()
            }}
          >
            Passa il turno
          </button>
        </div>
      </Sheet>

      <Sheet open={foglio === 'passa'} onClose={chiudiFoglio} title="Passi il turno?">
        <p className="scr-conferma__lede">La mossa conta, e il turno passa all’altro.</p>
        <div className="scr-conferma__azioni">
          <button
            type="button"
            className="scr-tasto scr-tasto--largo scr-tasto--giallo"
            disabled={bloccato}
            onClick={() => {
              chiudiFoglio()
              c.annulla()
              onPassa()
            }}
          >
            Passa
          </button>
          <button type="button" className="scr-tasto scr-tasto--largo" onClick={chiudiFoglio}>
            Gioco ancora
          </button>
        </div>
      </Sheet>
    </div>
  )
}

const NESSUNA: Set<number> = new Set()

/** Passare: il triangolo che salta fino alla sbarra, come il tasto "avanti" di un lettore. */
function IconaPassa() {
  return (
    <svg className="scr-tasto__icona" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6.5v11l8-5.5Z" />
      <path d="M17.5 6.5v11" />
    </svg>
  )
}

/** Cambiare: due frecce che si scambiano il posto. */
function IconaCambia() {
  return (
    <svg className="scr-tasto__icona" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 9h14M15 5.5 18.5 9 15 12.5" />
      <path d="M19.5 15h-14M9 11.5 5.5 15 9 18.5" />
    </svg>
  )
}

/**
 * Le ultime tre mosse sotto i comandi, l'ultima in cima: chi l'ha fatta, le
 * parole, i punti. Prima della prima mossa, come si gioca in due righe.
 */
function UltimeMosse({ voci, aiuto, onApri }: { voci: readonly VoceMossa[]; aiuto: string; onApri?: () => void }) {
  const ultime = voci.slice(-3).reverse()
  const contenuto = (
    <>
      <span className="scr-ultime__titolo">{ultime.length ? 'Le ultime mosse' : 'Come si gioca'}</span>
      {ultime.length === 0 ? (
        <span className="scr-ultime__aiuto">{aiuto}</span>
      ) : (
        ultime.map((m) => {
          const altro = m.mia === false
          return (
            <span key={m.numero} className="scr-ultime__voce">
              <span className={`scr-ultime__chi${altro ? ' is-altro' : ''}`} role="img" aria-label={m.autore ?? 'Tu'}>
                <span aria-hidden="true">{(m.autore ?? 'Tu').slice(0, 1).toUpperCase()}</span>
              </span>
              <span className="scr-ultime__parole">
                {m.tipo === 'posa'
                  ? m.parole.map((p) => p.toUpperCase()).join(' · ') || 'Una parola'
                  : m.tipo === 'passo'
                    ? altro
                      ? 'Ha passato'
                      : 'Hai passato'
                    : altro
                      ? 'Ha cambiato le tessere'
                      : 'Hai cambiato le tessere'}
              </span>
              <span className="scr-ultime__punti u-tabnum">{m.punti > 0 ? `+${m.punti}` : '—'}</span>
            </span>
          )
        })
      )}
    </>
  )
  return onApri ? (
    <button type="button" className="scr-ultime" onClick={onApri} aria-label="Tutte le mosse">
      {contenuto}
    </button>
  ) : (
    <section className="scr-ultime" aria-label="Le ultime mosse">
      {contenuto}
    </section>
  )
}

/**
 * Il punteggio sopra il tabellone: due lati, uno per chi gioca, e in mezzo
 * quel che legge il gioco.
 *
 * Nella classificata il lato destro e' il computer del giorno, nella libera
 * l'avversario vero, e il lato di chi deve muovere si accende di giallo. In
 * mezzo, sopra, a che punto si e' ("Mossa 2 di 5", "Sacchetto 85"); sotto, la
 * posa in corso con le sue parole, o perché non va, o il messaggio del momento.
 */
export function Tabellino({
  io,
  altro,
  nomeIo = 'Tu',
  nomeAltro,
  notaAltro,
  turno,
  stato,
  sotto,
  attesa = null,
  avviso = null,
  posa = null,
  sconosciute = null,
  avanzamento,
  onApri,
  onRisultato,
  iconaIo,
  iconaAltro,
}: {
  io: number
  altro: number
  /** Chi gioca a sinistra: "Tu", o l'host per chi guarda in compagnia. */
  nomeIo?: string
  nomeAltro: string
  /** L'avatar di chi gioca e dell'avversario, accanto ai nomi, nelle partite fra persone. */
  iconaIo?: ReactNode
  iconaAltro?: ReactNode
  notaAltro?: string
  turno?: 'io' | 'altro' | null
  /** In cima alla riga di mezzo, in maiuscoletto: "Mossa 2 di 5", "Sacchetto 85". */
  stato?: string
  sotto: ReactNode
  /** Si aspetta qualcuno: la frase con i puntini che saltano, al posto della riga di mezzo. */
  attesa?: string | null
  /**
   * Un messaggio del momento — la posa non valida, la mossa del computer — al
   * posto della riga di mezzo. Prima era una pillola sopra il tabellone, e
   * copriva le caselle che si stavano guardando.
   */
  avviso?: string | null
  /**
   * La posa in corso, al posto della riga di mezzo: le parole che si formano,
   * o perché non va. E' qui che si vede quale parola il gioco sta leggendo.
   */
  posa?: EsitoPosa | null
  /** Le parole della posa che il dizionario non conosce, da segnare. */
  sconosciute?: readonly string[] | null
  /** Da 0 a 1: quanto manca a pareggiare il traguardo. */
  avanzamento?: number
  onApri?: () => void
  /** A partita finita: il bottone che riapre il risultato. */
  onRisultato?: () => void
}) {
  const mezzo = avviso ? (
    <span key={avviso} className="scr-tab__riga scr-tab__riga--avviso" aria-live="polite">
      {avviso}
    </span>
  ) : posa ? (
    <RigaDellaPosa esito={posa} sconosciute={sconosciute} />
  ) : attesa ? (
    <span key={attesa} className="scr-tab__riga" role="status">
      {attesa}
      <span className="scr-tab__puntini" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  ) : onRisultato ? null : (
    <span className="scr-tab__riga">{sotto}</span>
  )
  return (
    <div className="scr-tab">
      {onApri && <button type="button" className="scr-tab__apri" onClick={onApri} aria-label="Le mosse della partita" />}
      <span className={`scr-tab__lato${turno === 'io' ? ' is-turno' : ''}`}>
        <span className="scr-tab__nome">
          {iconaIo}
          <span className="scr-tab__chi">{nomeIo}</span>
        </span>
        <span className="scr-tab__punti u-tabnum">{io}</span>
      </span>
      <span className="scr-tab__mezzo">
        {stato && <span className="scr-tab__stato">{stato}</span>}
        {mezzo}
        {onRisultato && !avviso && !posa && (
          <button type="button" className="scr-tab__risultato" onClick={onRisultato}>
            Il risultato
          </button>
        )}
        {avanzamento !== undefined && !avviso && !posa && !attesa && !onRisultato && (
          <span className="scr-tab__barra" aria-hidden="true">
            <span className="scr-tab__pieno" style={{ transform: `scaleX(${Math.min(1, Math.max(0, avanzamento))})` }} />
          </span>
        )}
      </span>
      <span className={`scr-tab__lato${turno === 'altro' ? ' is-turno' : ''}`}>
        <span className="scr-tab__nome">
          {iconaAltro}
          <span className="scr-tab__chi">{nomeAltro}</span>
        </span>
        <span className="scr-tab__punti u-tabnum">{altro}</span>
        {notaAltro && <span className="scr-tab__nota">{notaAltro}</span>}
      </span>
    </div>
  )
}

/** Perché una posa non va, in poche parole: la frase intera la dice il bottone, se lo si preme. */
const PERCHE_NO: Partial<Record<CodicePosa, string>> = {
  NON_ALLINEATA: 'Tutte su una riga o una colonna',
  CON_BUCHI: 'Niente caselle vuote in mezzo',
  SENZA_CENTRO: 'La prima parola passa dalla stella',
  STACCATA: 'Attaccala alle tessere sul tabellone',
  PAROLA_CORTA: 'Servono due lettere in fila',
}

/** Le parole che forma la posa in corso, con i loro punti: la prima e' quella con tutte le tessere. */
function RigaDellaPosa({ esito, sconosciute }: { esito: EsitoPosa; sconosciute: readonly string[] | null }) {
  if (!esito.ok) {
    return (
      <span className="scr-tab__riga scr-tab__riga--no" aria-live="polite">
        {PERCHE_NO[esito.codice] ?? esito.errore}
      </span>
    )
  }
  return (
    <span className="scr-tab__parole" aria-live="polite">
      {esito.parole.map((p, i) => (
        <span
          key={`${p.parola}-${p.celle[0].r}-${p.celle[0].c}-${i}`}
          className={`scr-tab__parola${sconosciute?.includes(p.parola) ? ' is-sconosciuta' : ''}`}
        >
          {p.parola.toUpperCase()} <b className="u-tabnum">{p.punti}</b>
        </span>
      ))}
    </span>
  )
}

/** Una mossa nell'elenco, con chi l'ha giocata quando serve dirlo. */
export interface VoceMossa {
  numero: number
  tipo: 'posa' | 'passo' | 'cambio'
  parole: string[]
  punti: number
  scarabeo: boolean
  /** Solo nelle partite a due: "Tu", "Computer". */
  autore?: string
  mia?: boolean
}

/** Le mosse di una partita, una riga ciascuna, con il totale in fondo. */
export function ElencoMosse({ mosse, totale, vuoto }: { mosse: VoceMossa[]; totale?: number; vuoto: string }) {
  if (mosse.length === 0) return <p className="scr-storia__vuota">{vuoto}</p>
  return (
    <ol className="scr-storia">
      {mosse.map((m) => (
        <li className={`scr-storia__riga${m.mia === false ? ' is-altro' : ''}`} key={m.numero}>
          <span className="scr-storia__numero u-tabnum">{m.numero}</span>
          <span className="scr-storia__parole">
            {m.autore && <span className="scr-storia__autore">{m.autore}</span>}
            <span className="scr-storia__testo">
              {m.tipo === 'posa'
                ? m.parole.map((p) => p.toUpperCase()).join(' · ')
                : m.tipo === 'passo'
                  ? 'passa'
                  : 'cambia le tessere'}
            </span>
            {m.scarabeo && <span className="scr-storia__scarabeo">scarabeo</span>}
          </span>
          <span className="scr-storia__punti u-tabnum">{m.punti > 0 ? `+${m.punti}` : '—'}</span>
        </li>
      ))}
      {totale !== undefined && (
        <li className="scr-storia__riga scr-storia__riga--totale">
          <span className="scr-storia__numero" />
          <span className="scr-storia__parole">Totale</span>
          <span className="scr-storia__punti u-tabnum">{totale}</span>
        </li>
      )}
    </ol>
  )
}
