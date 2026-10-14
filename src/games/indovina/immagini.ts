import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { coloreDelPersonaggio, immaginePredefinita, sfondoPredefinito, type Personaggi } from '@shared/indovina'
import { leggiImmagine, salvaImmagine } from './archivio'

export interface Immagini {
  /** L'immagine di un personaggio: un indirizzo, o null finché la foto non c'e'. */
  url: (k: number) => string | null
  /** Il fondo della carta: per le immagini trasparenti, e per i personaggi senza foto. */
  sfondo: (k: number) => string | null
  /** Le impronte delle foto che mancano in questo telefono. */
  mancanti: string[]
  /** Si sa gia' cosa manca: l'archivio e' stato letto. */
  pronto: boolean
  /** Una foto arrivata dall'altro telefono: si tiene, e compare sul tabellone. */
  aggiungi: (hash: string, blob: Blob) => void
}

/**
 * Le immagini di un set. Quelle dei set predefiniti sono indirizzi pubblici,
 * che il browser scarica e tiene in cache; quelle dei set propri stanno
 * nell'archivio del telefono, e si mostrano da un URL di oggetto.
 */
export function useImmagini(personaggi: Personaggi | null): Immagini {
  const [urlProprie, setUrlProprie] = useState<ReadonlyMap<string, string>>(new Map())
  const [lette, setLette] = useState<string | null>(null)
  const creati = useRef<string[]>([])

  const proprio = personaggi?.set === 'mio'
  const impronte = useMemo(
    () => (proprio ? personaggi!.voci.map((v) => v.img ?? '').filter(Boolean) : []),
    [proprio, personaggi],
  )
  const chiave = impronte.join(',')

  useEffect(() => {
    if (!proprio) return
    let annullato = false
    void (async () => {
      const trovate = new Map<string, string>()
      for (const h of impronte) {
        const blob = await leggiImmagine(h)
        if (blob) {
          const url = URL.createObjectURL(blob)
          creati.current.push(url)
          trovate.set(h, url)
        }
      }
      if (annullato) return
      setUrlProprie(trovate)
      setLette(chiave)
    })()
    return () => {
      annullato = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proprio, chiave])

  useEffect(
    () => () => {
      for (const u of creati.current) URL.revokeObjectURL(u)
    },
    [],
  )

  const aggiungi = useCallback((hash: string, blob: Blob) => {
    void salvaImmagine(hash, blob).catch(() => {})
    const url = URL.createObjectURL(blob)
    creati.current.push(url)
    setUrlProprie((prima) => new Map(prima).set(hash, url))
  }, [])

  const url = useCallback(
    (k: number): string | null => {
      const voce = personaggi?.voci[k]
      if (!voce || !personaggi) return null
      if (personaggi.set === 'mio') return voce.img ? (urlProprie.get(voce.img) ?? null) : null
      return immaginePredefinita(personaggi.set, voce.nome)
    },
    [personaggi, urlProprie],
  )

  const sfondo = useCallback(
    (k: number): string | null => {
      const voce = personaggi?.voci[k]
      if (!voce || !personaggi) return null
      // Una foto che deve ancora arrivare resta grigia, e pulsa: il colore e' per chi una foto non ce l'ha.
      if (personaggi.set === 'mio') return voce.img ? null : coloreDelPersonaggio(k)
      return sfondoPredefinito(personaggi.set, voce.nome)
    },
    [personaggi],
  )

  const pronto = !proprio || lette === chiave
  const mancanti = useMemo(
    () => (pronto ? impronte.filter((h) => !urlProprie.has(h)) : []),
    [pronto, impronte, urlProprie],
  )

  return { url, sfondo, mancanti, pronto, aggiungi }
}
