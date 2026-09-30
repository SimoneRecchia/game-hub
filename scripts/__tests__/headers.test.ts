import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RADICE = join(__dirname, '..', '..')

/** Le regole di `_headers`: il percorso, e le intestazioni sotto. */
function regole(): Array<{ percorso: string; intestazioni: string[] }> {
  const fuori: Array<{ percorso: string; intestazioni: string[] }> = []
  for (const riga of readFileSync(join(RADICE, 'public', '_headers'), 'utf8').split('\n')) {
    if (!riga.trim() || riga.trimStart().startsWith('#')) continue
    if (/^\s/.test(riga)) fuori.at(-1)?.intestazioni.push(riga.trim())
    else fuori.push({ percorso: riga.trim(), intestazioni: [] })
  }
  return fuori
}

/** Un percorso di `_headers` come espressione: `*` prende tutto, `:nome` un pezzo. */
function comeEspressione(percorso: string): RegExp {
  const pezzi = percorso
    .split(/(\*|:[a-z]+)/i)
    .map((p) => (p === '*' ? '.*' : p.startsWith(':') ? '[^/]+' : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
  return new RegExp(`^${pezzi.join('')}$`)
}

/**
 * Le pagine dell'app, dalle rotte di `App.tsx`, con un valore qualunque al
 * posto dei parametri. Quelle dei tavolieri si scrivono con un modello: per
 * provarle basta un gioco.
 */
function pagine(): string[] {
  const app = readFileSync(join(RADICE, 'src', 'App.tsx'), 'utf8')
  const scritte = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
  const tavolieri = ['/scacchi', '/scacchi/computer', '/scacchi/partita/:id', '/scacchi/invito/:codice']
  return [...scritte, ...tavolieri].map((p) => p.replace(/:[a-zA-Z]+/g, 'x'))
}

/**
 * Le Pages servono le pagine dell'app con index.html, allo stesso indirizzo:
 * una regola di cache "per sempre" che prende un indirizzo di una pagina tiene
 * in cache per un anno l'app di quel giorno. Era successo con `/scarabeo/*`,
 * che doveva prendere il dizionario e prendeva anche /scarabeo/classificata.
 */
describe('le regole di cache di _headers', () => {
  const perSempre = regole().filter((r) => r.intestazioni.some((i) => /immutable|max-age=[1-9]\d{4,}/.test(i)))

  it('ci sono quelle dei file con l’impronta', () => {
    const percorsi = perSempre.map((r) => r.percorso)
    expect(percorsi).toContain('/assets/*')
    expect(percorsi).toContain('/dati/*')
    expect(percorsi).toContain('/scarabeo/dizionario.dawg')
  })

  it('le pagine dell’app ci sono tutte', () => {
    expect(pagine()).toEqual(expect.arrayContaining(['/scarabeo/classificata', '/quiz/libera', '/scacchi/computer']))
  })

  for (const r of perSempre) {
    it(`${r.percorso} non prende nessuna pagina dell’app`, () => {
      const re = comeEspressione(r.percorso)
      expect(pagine().filter((p) => re.test(p))).toEqual([])
    })
  }
})
