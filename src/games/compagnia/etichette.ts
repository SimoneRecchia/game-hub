import type { DefinizioneCruciverba, SuggerimentoCompagnia } from '@shared/types'

/** Un suggerimento nel cruciverba: la parola, e dove va. */
export function etichettaCruciverba(s: SuggerimentoCompagnia, definizioni: readonly DefinizioneCruciverba[]) {
  if (s.proposta.gioco !== 'cruciverba') return { parola: '', nota: '' }
  const { definizione, parola } = s.proposta
  const d = definizioni.find((x) => x.chiave === definizione)
  return {
    parola: parola.toUpperCase(),
    nota: d ? `${d.numero} ${d.direzione === 'o' ? 'orizz.' : 'vert.'}` : '',
  }
}

/** Un suggerimento nello Scarabeo: la parola piu' lunga della posa, che e' quella voluta, e quanto vale. */
export function etichettaScarabeo(s: SuggerimentoCompagnia) {
  if (s.proposta.gioco !== 'scarabeo') return { parola: '', nota: '' }
  const parola = [...s.proposta.parole].sort((a, b) => b.length - a.length)[0] ?? ''
  return { parola: parola.toUpperCase(), nota: `+${s.proposta.punti}` }
}
