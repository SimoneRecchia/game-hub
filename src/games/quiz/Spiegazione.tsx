import { urlVoce } from '@shared/quiz-cultura'
import type { SpiegazioneQuiz } from '@shared/quiz-domande'
import { Quadro } from './Quadro'

/**
 * La scheda che insegna, a risposta data: per le materie senza cartina e' quel
 * che la cartina e' per la geografia. Di cosa si parlava, in una riga; i dati,
 * uno per riga, come sul cartellino di un museo; due frasi da Wikipedia, e la
 * voce intera per chi vuole leggere di piu'. Con il quadro, se c'era.
 */
export function SchedaSpiegazione({ s }: { s: SpiegazioneQuiz }) {
  return (
    <article className="quiz-scheda">
      <header className={`quiz-scheda__testa${s.immagine ? ' con-quadro' : ''}`}>
        {s.immagine && (
          <span className="quiz-scheda__quadro">
            <Quadro img={s.immagine} alt={s.titolo} sizes="(min-width: 700px) 220px, 40vw" />
          </span>
        )}
        <div className="quiz-scheda__titoli">
          <h3 className="quiz-scheda__titolo">{s.titolo}</h3>
          {s.sotto && <p className="quiz-scheda__sotto">{s.sotto}</p>}
        </div>
      </header>
      {s.righe && s.righe.length > 0 && (
        <dl className="quiz-scheda__righe">
          {s.righe.map(([chiave, valore]) => (
            <div key={chiave} className="quiz-scheda__riga">
              <dt>{chiave}</dt>
              <dd>{valore}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.testo && <p className="quiz-scheda__testo">{s.testo}</p>}
      {s.voce && (
        <a className="quiz-scheda__voce" href={urlVoce(s.voce)} target="_blank" rel="noopener noreferrer">
          Leggi di più su Wikipedia
        </a>
      )}
    </article>
  )
}
