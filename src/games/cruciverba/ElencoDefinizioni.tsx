import { useEffect, useRef } from 'react'
import { VUOTA } from '@shared/cruciverba'
import type { DefinizioneCruciverba } from '@shared/types'
import './ElencoDefinizioni.css'

interface Props {
  definizioni: readonly DefinizioneCruciverba[]
  lettere: string
  /** La soluzione, a partita chiusa: accanto a ogni definizione compare la risposta. */
  soluzione: string | null
  corrente: string | null
  onScegli: (d: DefinizioneCruciverba) => void
}

/** L'indirizzo della voce del Wikizionario da cui viene una definizione. */
export function paginaWikizionario(voce: string): string {
  return `https://it.wiktionary.org/wiki/${encodeURIComponent(voce.replace(/ /g, '_'))}`
}

/**
 * Le definizioni, divise in orizzontali e verticali come sulla carta.
 *
 * A partita chiusa ognuna porta la risposta e il collegamento alla voce del
 * Wikizionario: e' la licenza a chiedere di citare la fonte, ma e' anche il
 * modo di scoprire che cosa voleva dire quella parola che non si conosceva.
 */
export function ElencoDefinizioni({ definizioni, lettere, soluzione, corrente, onScegli }: Props) {
  const elenco = useRef<HTMLDivElement>(null)

  // La definizione su cui si sta scrivendo resta in vista: nell'elenco accanto
  // alla griglia, e nel foglio appena si apre.
  useEffect(() => {
    elenco.current
      ?.querySelector('.celenco__riga.is-corrente')
      ?.scrollIntoView({ block: 'nearest' })
  }, [corrente])

  const gruppi = [
    { titolo: 'Orizzontali', elenco: definizioni.filter((d) => d.direzione === 'o') },
    { titolo: 'Verticali', elenco: definizioni.filter((d) => d.direzione === 'v') },
  ]

  return (
    <div className="celenco" ref={elenco}>
      {gruppi.map(({ titolo, elenco }) => (
        <section className="celenco__gruppo" key={titolo}>
          <h3 className="celenco__titolo">{titolo}</h3>
          <ol className="celenco__lista">
            {elenco.map((d) => {
              const scritta = d.caselle.every((k) => lettere[k] !== VUOTA)
              const risposta = soluzione ? d.caselle.map((k) => soluzione[k]).join('') : null
              return (
                <li key={d.chiave} className="celenco__voce">
                  <button
                    type="button"
                    className={`celenco__riga${d.chiave === corrente ? ' is-corrente' : ''}${
                      scritta && !soluzione ? ' is-scritta' : ''
                    }`}
                    onClick={() => onScegli(d)}
                  >
                    <span className="celenco__numero u-tabnum">{d.numero}</span>
                    <span className="celenco__testo">
                      {d.testo}
                      {d.nota && <span className="celenco__nota">{d.nota}</span>}
                      {risposta && (
                        <span className="celenco__risposta">{risposta.toUpperCase()}</span>
                      )}
                    </span>
                  </button>
                  {soluzione && d.voce && (
                    <a
                      className="celenco__fonte"
                      href={paginaWikizionario(d.voce)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wikizionario: <strong>{d.voce}</strong>
                    </a>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
