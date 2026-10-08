import { useEffect, useRef, type CSSProperties } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconCheck, IconRefresh } from '@/components/Icons'
import { useRestante } from '@/games/tavolo/TempoMossa'
import { usePlayer } from '@/lib/auth'
import { formatCronometro } from '@/lib/format'
import { suona } from '@/lib/suoni'
import type { GiocoSfidaLibera } from '@shared/sfide-libere'
import type { LatoSfidaLibera, VistaSfidaLibera } from '@shared/types'
import { SFIDE_LIBERE, descriviLato, descriviOpzioni, unitaLato } from './giochi'
import type { SfidaLibera } from './useSfidaLibera'
import './Sfide.css'

/** I colori del gioco, per le parti della sfida che li prendono. */
export function coloriDi(gioco: GiocoSfidaLibera): CSSProperties {
  return { '--sfl-1': SFIDE_LIBERE[gioco].colore, '--sfl-2': SFIDE_LIBERE[gioco].colore2 } as CSSProperties
}

/**
 * In cima alla partita: io e l'altro, fin dove siamo arrivati. Il numero
 * dell'altro sobbalza quando cambia, e un pallino dice che sta giocando.
 */
export function BarraSfida({ v }: { v: VistaSfidaLibera }) {
  const player = usePlayer()
  return (
    <div className="sfl-barra" style={coloriDi(v.gioco)}>
      <Duellante
        gioco={v.gioco}
        lato={v.mie}
        nome="Tu"
        nickname={player.nickname}
        colore={player.avatarColor}
      />
      <span className="sfl-barra__contro" aria-hidden="true">
        vs
      </span>
      <Duellante
        gioco={v.gioco}
        lato={v.sue}
        nome={v.avversario?.displayName ?? 'L’altro'}
        nickname={v.avversario?.nickname ?? '?'}
        colore={v.avversario?.avatarColor}
        lui
        online={v.online}
      />
    </div>
  )
}

function Duellante({
  gioco,
  lato,
  nome,
  nickname,
  colore,
  lui = false,
  online = true,
}: {
  gioco: GiocoSfidaLibera
  lato: LatoSfidaLibera
  nome: string
  nickname: string
  colore?: string
  lui?: boolean
  online?: boolean
}) {
  const valore = descriviLato(gioco, lato)
  const gioca = lato.partito && !lato.finito
  return (
    <span className={`sfl-duellante${lui ? ' is-lui' : ''}${lato.finito ? ' is-finito' : ''}`}>
      <span className="sfl-duellante__avatar">
        <Avatar nickname={nickname} color={colore} size={34} />
        {lato.finito ? (
          <span className="sfl-duellante__segno" aria-hidden="true">
            <IconCheck size={10} />
          </span>
        ) : (
          gioca && online && <span className="sfl-duellante__vivo" aria-hidden="true" />
        )}
      </span>
      <span className="sfl-duellante__testo">
        <span className="sfl-duellante__nome">{nome}</span>
        <span className="sfl-duellante__valore u-tabnum" key={valore} aria-live={lui ? 'polite' : undefined}>
          {valore}
          <span className="u-visually-hidden"> {unitaLato(gioco, lato)}</span>
        </span>
      </span>
    </span>
  )
}

/** Il tre-due-uno: io e l'altro, le opzioni, e un secondo alla volta con il suo tic. */
export function ViaSfida({ v, via }: { v: VistaSfidaLibera; via: number }) {
  const player = usePlayer()
  const restante = useRestante(via) ?? 0
  const secondi = Math.max(1, Math.ceil(restante / 1000))
  const prima = useRef<number | null>(null)
  useEffect(() => {
    if (prima.current !== null && secondi !== prima.current) suona('tic')
    prima.current = secondi
  }, [secondi])
  useEffect(() => () => suona('via'), [])
  return (
    <div className="sfl-via" style={coloriDi(v.gioco)}>
      <div className="sfl-via__chi">
        <Avatar nickname={player.nickname} color={player.avatarColor} size={52} />
        <span className="sfl-via__contro">contro</span>
        <Avatar nickname={v.avversario?.nickname ?? '?'} color={v.avversario?.avatarColor} size={52} />
      </div>
      <span className="sfl-via__numero u-tabnum" key={secondi} aria-live="assertive">
        {secondi}
      </span>
      <p className="sfl-via__opzioni">{descriviOpzioni(v.gioco, v.impostazioni)}</p>
    </div>
  )
}

/**
 * Com'e' andata, dove la libera mette il suo totale: prima "aspetto l'altro",
 * con fin dove e' arrivato e quanto manca alla chiusura; poi chi ha vinto, la
 * serie e la rivincita.
 */
export function FineSfida({ s, v }: { s: SfidaLibera; v: VistaSfidaLibera }) {
  const player = usePlayer()
  const { vai } = useNavigazione()
  const nome = v.avversario?.displayName ?? 'L’altro'
  const chiude = useRestante(v.chiudeTraMs !== null ? Date.now() + v.chiudeTraMs : null)
  if (v.stato !== 'finita') {
    return (
      <div className="sfl-fine" style={coloriDi(v.gioco)} aria-live="polite">
        <p className="sfl-fine__esito">Hai finito</p>
        <div className="sfl-fine__attesa">
          <span className="sfl-onde" aria-hidden="true" />
          <p>
            Aspetto <strong>{nome}</strong>
            {v.sue.partito ? ` · ${descriviLato(v.gioco, v.sue)} ${unitaLato(v.gioco, v.sue)}` : '…'}
          </p>
        </div>
        {chiude !== null && chiude > 0 && (
          <p className="sfl-fine__nota u-tabnum">La sfida si chiude al più tardi fra {formatCronometro(chiude)}.</p>
        )}
      </div>
    )
  }
  const esito = v.vincitore === 'io' ? 'Hai vinto!' : v.vincitore === 'avversario' ? `Ha vinto ${nome}` : 'Pari'
  const chiesta = v.rivincita
  const righe = [
    { chi: 'Tu', nickname: player.nickname, colore: player.avatarColor, lato: v.mie, vince: v.vincitore === 'io' },
    {
      chi: nome,
      nickname: v.avversario?.nickname ?? '?',
      colore: v.avversario?.avatarColor,
      lato: v.sue,
      vince: v.vincitore === 'avversario',
    },
  ]
  return (
    <div className={`sfl-fine is-${v.vincitore ?? 'pari'}`} style={coloriDi(v.gioco)}>
      <p className="sfl-fine__esito">{esito}</p>
      {v.vincitore !== 'pari' && v.mie.punti === v.sue.punti && (
        <p className="sfl-fine__serie">A pari punti vince chi ha fatto prima.</p>
      )}
      {v.serie.partite > 1 && (
        <p className="sfl-fine__serie u-tabnum">
          La serie: tu {v.serie.mie}, {nome} {v.serie.sue}, su {v.serie.partite}
        </p>
      )}
      <ol className="sfl-fine__righe">
        {righe.map((r) => (
          <li key={r.chi} className={`sfl-fine__riga${r.vince ? ' is-vince' : ''}`}>
            <Avatar nickname={r.nickname} color={r.colore} size={32} />
            <span className="sfl-fine__nome">{r.chi}</span>
            <span className="sfl-fine__valore u-tabnum">
              {r.lato.partito || r.lato.finito ? descriviLato(v.gioco, r.lato) : '–'}
              <span className="sfl-fine__unita"> {unitaLato(v.gioco, r.lato)}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="sfl-fine__azioni">
        {chiesta?.stato === 'invito' && chiesta.mia ? (
          <p className="sfl-fine__nota">Aspetto la risposta di {nome}…</p>
        ) : (
          <Button size="lg" fullWidth onClick={s.rivincita} loading={s.occupato} disabled={!v.online}>
            <IconRefresh size={18} /> {chiesta?.stato === 'invito' ? `${nome} vuole la rivincita` : 'Rivincita'}
          </Button>
        )}
        <Button size="lg" variant="tinted" fullWidth onClick={() => vai(ROTTE.libera(v.gioco))}>
          Altre partite
        </Button>
      </div>
      {!v.online && !chiesta && <p className="sfl-fine__nota">{nome} non è più online.</p>}
      {s.errore && <p className="sfl-fine__nota">{s.errore}</p>}
    </div>
  )
}
