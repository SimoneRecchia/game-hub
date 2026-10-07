import { useEffect, useState, type CSSProperties } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconChevronLeft, IconChevronRight } from '@/components/Icons'
import { api } from '@/lib/api'
import {
  decodificaOps,
  type AlbumScarabocchi,
  type CatenaAlbum,
  type DisegnoGalleria,
  type IscrittoStanzaScarabocchi,
  type OpTratto,
  type VistaStanzaScarabocchi,
  type VistaTelefono,
} from '@shared/scarabocchi'
import { Lavagna } from './Lavagna'
import { foglioIntero, useStanzaScarabocchi } from './useStanza'

type Stanza = ReturnType<typeof useStanzaScarabocchi>

/** Quanto passa fra un foglio e l'altro quando una catena si apre: si scopre a poco a poco, come al tavolo. */
const PASSO_ALBUM_MS = 900

/**
 * L'album del telefono senza fili: una catena alla volta, dalla frase di chi
 * l'ha cominciata all'ultimo foglio, ognuno con chi l'ha fatto. I fogli
 * compaiono uno dopo l'altro; le frecce passano alle altre catene.
 */
export function AlbumTelefono({
  v,
  pv,
  s,
  volti,
}: {
  v: VistaStanzaScarabocchi
  pv: VistaTelefono
  s: Stanza
  volti: Map<string, IscrittoStanzaScarabocchi>
}) {
  const [catena, setCatena] = useState(0)
  const [dati, setDati] = useState<Map<number, CatenaAlbum>>(new Map())
  const [errore, setErrore] = useState(false)
  const quante = pv.passi
  const corrente = dati.get(catena)

  useEffect(() => {
    if (dati.has(catena)) return
    let vivo = true
    setErrore(false)
    api<AlbumScarabocchi>(`/scarabocchi/stanze/${v.codice}/album?catena=${catena}`)
      .then((a) => {
        if (!vivo || a.modo !== 'telefono') return
        setDati((prima) => new Map(prima).set(catena, a.catene[0]))
      })
      .catch(() => vivo && setErrore(true))
    return () => {
      vivo = false
    }
  }, [catena, dati, v.codice])

  const primo = corrente?.fogli[0]?.autore
  return (
    <div className="scr-album">
      <div className="scr-album__testa">
        <Button
          variant="plain"
          aria-label="La catena prima"
          disabled={catena === 0}
          onClick={() => setCatena((c) => Math.max(0, c - 1))}
        >
          <IconChevronLeft size={20} />
        </Button>
        <p className="scr-album__titolo">
          {primo ? `La catena di ${primo.nome}` : 'L’album'}
          <span className="scr-album__quale u-tabnum">
            {catena + 1} di {quante}
          </span>
        </p>
        <Button
          variant="plain"
          aria-label="La catena dopo"
          disabled={catena >= quante - 1}
          onClick={() => setCatena((c) => Math.min(quante - 1, c + 1))}
        >
          <IconChevronRight size={20} />
        </Button>
      </div>
      {errore ? (
        <p className="scr-nota">L’album non si è aperto: riprova fra poco.</p>
      ) : !corrente ? (
        <div className="scr-lavagna scr-lavagna--attesa" aria-hidden="true" />
      ) : (
        <ol key={catena} className="scr-album__fogli">
          {corrente.fogli.map((f, i) => {
            const volto = volti.get(f.autore.id)
            return (
              <li
                key={f.passo}
                className={`scr-foglio scr-foglio--${f.tipo}`}
                style={{ '--ritardo': `${i * PASSO_ALBUM_MS}ms` } as CSSProperties}
              >
                <span className="scr-foglio__chi">
                  <Avatar nickname={volto?.nickname ?? f.autore.nome} color={volto?.avatarColor} size={28} />
                  {f.autore.nome}
                  <span className="scr-foglio__cosa">
                    {f.tipo === 'scrivi' ? 'ha scritto' : f.tipo === 'disegna' ? 'ha disegnato' : 'ci ha visto'}
                  </span>
                </span>
                {f.tipo === 'disegna' ? (
                  f.tratti ? (
                    <div className="scr-tela">
                      <Lavagna ops={decodificaOps(f.tratti)} etichetta={`Il disegno di ${f.autore.nome}`} />
                    </div>
                  ) : (
                    <p className="scr-foglio__vuoto">Non ha disegnato niente.</p>
                  )
                ) : f.testo ? (
                  <p className="scr-foglio__testo">«{f.testo}»</p>
                ) : (
                  <p className="scr-foglio__vuoto">Non ha scritto niente.</p>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <div className="scr-album__piede">
        {v.conduco ? (
          <Button size="lg" fullWidth onClick={() => void s.ancora()} loading={s.occupato === 'ancora'}>
            Un’altra partita
          </Button>
        ) : (
          <p className="scr-nota">Chi ha aperto la stanza può cominciarne un’altra.</p>
        )}
      </div>
    </div>
  )
}

/** I disegni di una partita di Indovina il disegno, con la parola: ognuno si chiede quando compare. */
export function Galleria({ codice }: { codice: string }) {
  const [disegni, setDisegni] = useState<DisegnoGalleria[] | null>(null)
  useEffect(() => {
    let vivo = true
    api<AlbumScarabocchi>(`/scarabocchi/stanze/${codice}/album`)
      .then((a) => vivo && setDisegni(a.modo === 'indovina' ? a.disegni : []))
      .catch(() => vivo && setDisegni([]))
    return () => {
      vivo = false
    }
  }, [codice])
  if (!disegni) return <div className="scr-lavagna scr-lavagna--attesa" aria-hidden="true" />
  if (disegni.length === 0) return <p className="scr-nota">Nessun disegno in questa partita.</p>
  return (
    <ul className="scr-galleria">
      {disegni.map((d) => (
        <li key={d.turno} className="scr-galleria__disegno">
          <DisegnoChiesto codice={codice} foglio={d.foglio} etichetta={`${d.parola}, di ${d.disegnatore.nome}`} />
          <p className="scr-galleria__parola">{d.parola.toUpperCase()}</p>
          <p className="scr-nota">
            di {d.disegnatore.nome} · {d.indovinati === 1 ? '1 l’ha indovinata' : `${d.indovinati} l’hanno indovinata`}
          </p>
        </li>
      ))}
    </ul>
  )
}

function DisegnoChiesto({ codice, foglio, etichetta }: { codice: string; foglio: string; etichetta: string }) {
  const [ops, setOps] = useState<OpTratto[] | null>(null)
  useEffect(() => {
    let vivo = true
    foglioIntero(codice, foglio)
      .then((f) => vivo && setOps(f.ops))
      .catch(() => vivo && setOps([]))
    return () => {
      vivo = false
    }
  }, [codice, foglio])
  return (
    <div className="scr-tela">
      {ops ? <Lavagna ops={ops} etichetta={etichetta} /> : <div className="scr-lavagna scr-lavagna--attesa" />}
    </div>
  )
}
