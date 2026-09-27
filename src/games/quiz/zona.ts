/**
 * La zona di una partita sulla cartina: da dove parte la vista, quali paesi
 * restano accesi e cosa si puo' toccare. E la traduzione di una risposta in un
 * posto della cartina, per mostrarla a risposta data.
 *
 * Il mondo c'e' sempre tutto: fuori dalla zona le terre si spengono e non si
 * toccano, ma restano, perché senza l'Europa da sola non si capirebbe dove sta.
 */

import { OCEANI, type CittaQuiz } from '@shared/quiz-dati'
import {
  VISTA_DEL_CONTINENTE,
  VISTE,
  idPaeseCartina,
  type Continente,
  type Riquadro,
  type VistaCartina,
} from '@shared/quiz'
import { acqueAccettate, type AreaQuiz, type DomandaQuiz, type IndiceQuiz, type LuogoQuiz, type StratoCartina } from '@shared/quiz-domande'
import type { RispostaQuiz } from '@shared/types'

export interface ZonaCartina {
  inquadra: Riquadro
  /** Il paese da inquadrare, per una partita su un paese solo. */
  fuoco?: string
  /** I paesi della zona: fuori si attenuano. Null e' tutto il mondo. */
  zona: Set<string> | null
  /** Cosa si puo' toccare; null e' tutto. */
  toccabili: Set<string> | null
}

function paesiDellArea(ix: IndiceQuiz, area: AreaQuiz): string[] | null {
  if (area === 'mondo') return null
  if (area.startsWith('paese:')) return [area.slice(6)]
  return ix.dati.paesi.filter((p) => p.k.includes(area as Continente)).map((p) => p.id)
}

/**
 * La zona di una partita. `vista` e' quella delle domande, per le giornate di
 * una volta che la avevano per domanda: vale solo come inquadratura iniziale.
 */
export function zonaDellaPartita(
  ix: IndiceQuiz,
  area: AreaQuiz,
  strato: StratoCartina | null,
  soloZona: boolean,
  citta: readonly CittaQuiz[] | null,
  vista?: VistaCartina,
): ZonaCartina {
  const iso = paesiDellArea(ix, area)
  const unPaese = area.startsWith('paese:') ? ix.paesi.get(area.slice(6)) : undefined
  const continente = unPaese?.k[0] ?? (area !== 'mondo' && !area.startsWith('paese:') ? (area as Continente) : null)
  const inquadra = VISTE[vista ?? (continente ? VISTA_DEL_CONTINENTE[continente] : 'mondo')]
  const fuoco = unPaese?.num ? idPaeseCartina(unPaese.num) : undefined
  if (!iso) return { inquadra, fuoco, zona: null, toccabili: null }

  const dentro = new Set(iso)
  const zona = new Set(
    iso.map((id) => ix.paesi.get(id)?.num).filter((n): n is string => !!n).map(idPaeseCartina),
  )
  if (!soloZona || !strato) return { inquadra, fuoco, zona, toccabili: null }

  const tocca = (ids: string[]) => ({ inquadra, fuoco, zona, toccabili: new Set(ids) })
  switch (strato) {
    case 'paesi':
      return tocca([...zona])
    case 'capitali':
      return tocca(iso.filter((id) => ix.paesi.get(id)?.cc).map((id) => `c:${id}`))
    case 'citta':
      return tocca((citta ?? []).filter((c) => dentro.has(c.p)).map((c) => `u:${c.id}`))
    case 'fiumi':
      return tocca(ix.dati.fiumi.filter((f) => f.p.some((id) => dentro.has(id))).map((f) => `f:${f.id}`))
    case 'laghi':
      return tocca(ix.dati.laghi.filter((l) => l.p.some((id) => dentro.has(id))).map((l) => `l:${l.id}`))
    case 'acque': {
      // Un'acqua e' della zona se bagna uno dei suoi paesi; un oceano, con i suoi golfi.
      const bagnate = new Set(iso.flatMap((id) => ix.paesi.get(id)?.bagna ?? []))
      const ids = ix.dati.acque
        .filter((a) => bagnate.has(a.id))
        .flatMap((a) => (OCEANI.includes(a.id) ? acqueAccettate(ix, a) : [a.id]))
      return tocca([...new Set(ids)])
    }
  }
}

/**
 * Dove sta un'opzione sulla cartina: un paese, una capitale, un mare, un fiume,
 * un lago, una città. Il trabocchetto delle capitali (la città piu' grande) non
 * ha un posto: non sappiamo dove sia.
 */
export function postoDellOpzione(ix: IndiceQuiz, id: string | null): string | null {
  if (!id) return null
  if (/^[A-Z]{2}$/.test(id)) {
    const num = ix.paesi.get(id)?.num
    return num ? idPaeseCartina(num) : null
  }
  if (id.startsWith('cap:')) return ix.paesi.get(id.slice(4))?.cc ? `c:${id.slice(4)}` : null
  if (id.startsWith('u:')) return id
  if (/^Q\d+$/.test(id)) {
    if (ix.acque.has(id)) return id
    const fiume = ix.dati.fiumi.find((f) => f.id === id)
    if (fiume) return fiume.g ? `f:${id}` : null
    const lago = ix.dati.laghi.find((l) => l.id === id)
    if (lago) return lago.g || lago.pt ? `l:${id}` : null
  }
  return null
}

/**
 * Dove guardare a risposta data. Le giornate nuove lo dicono loro; per quelle
 * di una volta si mostra la risposta giusta, se ha un posto.
 */
export function luogoDellaRisposta(ix: IndiceQuiz, d: DomandaQuiz, r: RispostaQuiz): LuogoQuiz | undefined {
  if (r.luogo) return r.luogo
  if (d.cartina) return { giusti: r.accettate?.length ? [r.corretta] : [r.corretta] }
  const giusto = postoDellOpzione(ix, r.corretta)
  return giusto ? { giusti: [giusto] } : undefined
}
