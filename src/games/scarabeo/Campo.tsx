import { useCallback, useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { IconShuffle } from '@/components/Icons'
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
  evidenziate?: ReadonlySet<number>
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
 */
export function Campo({
  c,
  sconosciute,
  testa,
  fine,
  bloccato,
  attesa,
  restanti,
  evidenziate,
  onGioca,
  onPassa,
  onCambia,
}: Props) {
  const [cambio, setCambio] = useState(false)
  const [selezione, setSelezione] = useState<Set<number>>(new Set())

  const esciDalCambio = useCallback(() => {
    setCambio(false)
    setSelezione(new Set())
  }, [])

  const tocca = useCallback(
    (indice: number) => {
      if (!cambio) {
        c.usaTessera(indice)
        return
      }
      setSelezione((prima) => {
        const dopo = new Set(prima)
        if (dopo.has(indice)) dopo.delete(indice)
        else dopo.add(indice)
        return dopo
      })
    },
    [c, cambio],
  )

  const confermaCambio = () => {
    const tessere = [...selezione].map((i) => c.mano[i])
    esciDalCambio()
    onCambia(tessere)
  }

  const anteprima = c.anteprima
  const sbagliata = (sconosciute?.length ?? 0) > 0
  const etichetta = attesa
    ? attesa
    : sbagliata
      ? `${sconosciute!.map((p) => p.toUpperCase()).join(', ')} non esiste`
      : anteprima && !anteprima.ok
        ? 'Posa non valida'
        : anteprima?.ok
          ? `Gioca · +${anteprima.punti}${anteprima.scarabeo ? ' scarabeo!' : ''}`
          : 'Gioca'

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
            cambio={cambio}
            selezione={selezione}
            bloccato={bloccato}
            onUsa={tocca}
          />

          {cambio ? (
            <div className="scr__comandi">
              <Button variant="plain" onClick={esciDalCambio}>
                Annulla
              </Button>
              <Button variant="tinted" disabled={selezione.size === 0 || bloccato} onClick={confermaCambio}>
                {selezione.size > 0 ? `Cambia ${selezione.size}` : 'Scegli le tessere'}
              </Button>
            </div>
          ) : c.sospese.length > 0 ? (
            <div className="scr__comandi">
              <Button variant="plain" onClick={c.annulla}>
                Rimetti in mano
              </Button>
            </div>
          ) : (
            <div className="scr__comandi">
              <Button variant="plain" onClick={c.mischia} disabled={bloccato} aria-label="Mischia il leggio">
                <IconShuffle size={17} /> Mischia
              </Button>
              <Button
                variant="plain"
                onClick={() => setCambio(true)}
                disabled={bloccato || restanti === 0 || c.mano.length === 0}
              >
                Cambia
              </Button>
              <Button variant="plain" onClick={onPassa} disabled={bloccato}>
                Passa
              </Button>
            </div>
          )}

          <div className="scr__gioca">
            <Button
              size="lg"
              fullWidth
              variant={sbagliata ? 'destructive' : 'filled'}
              onClick={onGioca}
              disabled={c.sospese.length === 0 || bloccato || cambio}
              loading={!!attesa}
            >
              {etichetta}
            </Button>
          </div>
        </div>
      )}

      <ScegliJolly aperto={c.jollyAperto !== null} onScegli={c.scegliJolly} onChiudi={c.chiudiJolly} />
    </div>
  )
}

/**
 * Il punteggio sopra il tabellone: due lati, uno per chi gioca.
 *
 * Nella classificata il lato destro e' il computer come traguardo — ha giocato
 * le stesse tessere, prima di tutti — nella libera e' l'avversario vero, e il
 * lato di chi deve muovere si accende.
 */
export function Tabellino({
  io,
  altro,
  nomeAltro,
  notaAltro,
  turno,
  sotto,
  avviso = null,
  avanzamento,
  onApri,
  iconaIo,
  iconaAltro,
}: {
  io: number
  altro: number
  nomeAltro: string
  /** L'avatar di chi gioca e l'icona dell'avversario, accanto ai nomi. */
  iconaIo?: ReactNode
  iconaAltro?: ReactNode
  notaAltro?: string
  turno?: 'io' | 'altro' | null
  sotto: ReactNode
  /**
   * Un messaggio del momento — la posa non valida, la mossa del computer — al
   * posto della riga di mezzo. Prima era una pillola sopra il tabellone, e
   * copriva le caselle che si stavano guardando.
   */
  avviso?: string | null
  /** Da 0 a 1: quanto manca a pareggiare il traguardo. */
  avanzamento?: number
  onApri?: () => void
}) {
  return (
    <button type="button" className="scr-tab" onClick={onApri} aria-label="Le mosse della partita">
      <span className={`scr-tab__lato${turno === 'io' ? ' is-turno' : ''}`}>
        <span className="scr-tab__nome">
          {iconaIo}
          Tu
        </span>
        <span className="scr-tab__punti u-tabnum">{io}</span>
      </span>
      <span className="scr-tab__mezzo">
        {avviso ? (
          <span key={avviso} className="scr-tab__avviso" aria-live="polite">
            {avviso}
          </span>
        ) : (
          <span className="scr-tab__sotto">{sotto}</span>
        )}
        {avanzamento !== undefined && !avviso && (
          <span className="scr-tab__barra" aria-hidden="true">
            <span className="scr-tab__pieno" style={{ transform: `scaleX(${Math.min(1, Math.max(0, avanzamento))})` }} />
          </span>
        )}
      </span>
      <span className={`scr-tab__lato scr-tab__lato--altro${turno === 'altro' ? ' is-turno' : ''}`}>
        <span className="scr-tab__nome">
          {nomeAltro}
          {iconaAltro}
        </span>
        <span className="scr-tab__punti u-tabnum">{altro}</span>
        {notaAltro && <span className="scr-tab__nota">{notaAltro}</span>}
      </span>
    </button>
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
