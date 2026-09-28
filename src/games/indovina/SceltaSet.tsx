import { useEffect, useState } from 'react'
import { IconMatita, IconPlus } from '@/components/Icons'
import { immaginePredefinita, sfondoPredefinito, type SetPredefinito } from '@shared/indovina'
import { leggiImmagine, type SetProprio } from './archivio'
import { problemaDelSet } from './setFile'
import { Faccia } from './Tabellone'

export interface OpzioneSet {
  /** 'persone', 'animali', o l'id di un set proprio. */
  chiave: string
  nome: string
  quanti: number
  /** Le prime quattro facce, per riconoscerlo. */
  facce: { nome: string; url: string | null; sfondo?: string | null }[]
  proprio: boolean
  /** Un set proprio non ancora pronto: al posto del conto. */
  daCompletare?: boolean
}

const ANTEPRIMA: Record<SetPredefinito, string[]> = {
  persone: ['Anna', 'Paolo', 'Dalia', 'Vito'],
  animali: ['Volpe', 'Panda', 'Rana', 'Leone'],
}

export function opzionePredefinita(set: SetPredefinito, nome: string, quanti: number): OpzioneSet {
  return {
    chiave: set,
    nome,
    quanti,
    facce: ANTEPRIMA[set].map((n) => ({ nome: n, url: immaginePredefinita(set, n), sfondo: sfondoPredefinito(set, n) })),
    proprio: false,
  }
}

/** Le anteprime dei set propri: le prime quattro foto, dall'archivio del telefono. */
export function useOpzioniProprie(set: SetProprio[]): OpzioneSet[] {
  const [url, setUrl] = useState<ReadonlyMap<string, string>>(new Map())
  const chiave = set.map((s) => s.voci.slice(0, 4).map((v) => v.img).join(',')).join(';')
  useEffect(() => {
    let annullato = false
    const creati: string[] = []
    void (async () => {
      const trovate = new Map<string, string>()
      for (const s of set) {
        for (const v of s.voci.slice(0, 4)) {
          if (trovate.has(v.img)) continue
          const blob = await leggiImmagine(v.img)
          if (blob) {
            const u = URL.createObjectURL(blob)
            creati.push(u)
            trovate.set(v.img, u)
          }
        }
      }
      if (!annullato) setUrl(trovate)
    })()
    return () => {
      annullato = true
      for (const u of creati) URL.revokeObjectURL(u)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave])
  return set.map((s) => ({
    chiave: s.id,
    nome: s.nome,
    quanti: s.voci.length,
    facce: s.voci.slice(0, 4).map((v) => ({ nome: v.nome, url: url.get(v.img) ?? null })),
    proprio: true,
    daCompletare: problemaDelSet(s) !== null,
  }))
}

/**
 * La scelta dei personaggi: i set predefiniti e quelli propri, come carte con
 * quattro facce sopra — si riconoscono prima di leggere il nome — e in fondo
 * la carta per farne uno nuovo.
 */
export function SceltaSet({
  opzioni,
  scelta,
  onScegli,
  onModifica,
  onNuovo,
}: {
  opzioni: OpzioneSet[]
  scelta: string
  onScegli: (chiave: string) => void
  onModifica: (chiave: string) => void
  onNuovo: () => void
}) {
  return (
    <div className="ic-set-griglia" role="radiogroup" aria-label="Personaggi">
      {opzioni.map((o) => (
        <div key={o.chiave} className={`ic-set${scelta === o.chiave ? ' is-scelto' : ''}`}>
          <button
            type="button"
            role="radio"
            aria-checked={scelta === o.chiave}
            className="ic-set__scegli"
            onClick={() => onScegli(o.chiave)}
          >
            <span className="ic-set__mosaico" aria-hidden="true">
              {o.facce.map((f, i) => (
                <Faccia key={i} url={f.url} sfondo={f.sfondo} nome={f.nome} />
              ))}
            </span>
            <span className="ic-set__nome">{o.nome}</span>
            <span className={`ic-set__quanti${o.daCompletare ? ' is-da-completare' : ''}`}>
              {o.daCompletare ? 'Da completare' : `${o.quanti} personaggi`}
            </span>
          </button>
          {o.proprio && (
            <button
              type="button"
              className="ic-set__modifica"
              onClick={() => onModifica(o.chiave)}
              aria-label={`Modifica ${o.nome}`}
            >
              <IconMatita size={15} />
            </button>
          )}
        </div>
      ))}
      <button type="button" className="ic-set ic-set--nuovo" onClick={onNuovo}>
        <span className="ic-set__piu" aria-hidden="true">
          <IconPlus size={26} />
        </span>
        <span className="ic-set__nome">Nuovo set</span>
        <span className="ic-set__quanti">Con le tue foto</span>
      </button>
    </div>
  )
}
