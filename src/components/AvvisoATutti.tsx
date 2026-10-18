import { useState } from 'react'
import { IconBolt, IconClose, IconInfo, IconSparkle } from '@/components/Icons'
import type { AnnuncioVisibile } from '@shared/admin'
import './AvvisoATutti.css'

/** Gli annunci chiusi su questo telefono: chi l'ha letto non lo rivede. */
const CHIAVE = 'annunci-chiusi'

function chiusi(): string[] {
  try {
    const valore: unknown = JSON.parse(localStorage.getItem(CHIAVE) ?? '[]')
    return Array.isArray(valore) ? valore.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function chiudi(id: string) {
  try {
    // Gli ultimi venti bastano: gli annunci vecchi non tornano accesi.
    localStorage.setItem(CHIAVE, JSON.stringify([...chiusi().filter((x) => x !== id), id].slice(-20)))
  } catch {
    // Senza memoria si chiude per questa volta, e basta.
  }
}

const ICONE = { info: IconInfo, avviso: IconBolt, festa: IconSparkle } as const

/**
 * L'annuncio a tutti, in cima alle Giornaliere: lo scrive il pannello di
 * amministrazione, e arriva con /api/oggi. Si chiude con la crocetta, e il
 * telefono se lo ricorda.
 */
export function AvvisoATutti({ annuncio }: { annuncio: AnnuncioVisibile | null | undefined }) {
  const [nascosti, setNascosti] = useState(chiusi)
  if (!annuncio || nascosti.includes(annuncio.id)) return null
  const Icona = ICONE[annuncio.tono] ?? IconInfo
  return (
    <aside className={`avviso-tutti is-${annuncio.tono}`} role="status">
      <span className="avviso-tutti__icona" aria-hidden="true">
        <Icona size={18} />
      </span>
      <p className="avviso-tutti__testo">{annuncio.testo}</p>
      <button
        type="button"
        className="avviso-tutti__chiudi"
        aria-label="Chiudi l’avviso"
        onClick={() => {
          chiudi(annuncio.id)
          setNascosti(chiusi())
        }}
      >
        <IconClose size={16} />
      </button>
    </aside>
  )
}
