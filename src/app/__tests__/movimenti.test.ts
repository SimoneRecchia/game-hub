import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOPO_LA_NAVIGAZIONE_MS, entrataDi, scorrimentoDopo, type Direzione, type Navigazione } from '../movimenti'

const ADESSO = 10_000

/** Una navigazione dell'app partita poco fa: avanti e indietro, di solito, con la loro View Transition. */
function appena(direzione: Direzione, transizione = direzione === 'avanti' || direzione === 'indietro'): Navigazione {
  return { direzione, transizione, quando: ADESSO - 120 }
}

const entrata = (ultima: Navigazione | null, tipo: 'POP' | 'PUSH' | 'REPLACE' = 'PUSH', ridotto = false) =>
  entrataDi({ prima: false, tipo, ultima, adesso: ADESSO, ridotto })

describe('come entra una schermata', () => {
  it('la prima dell’app entra da sé, con il contenuto a cascata', () => {
    expect(entrataDi({ prima: true, tipo: 'POP', ultima: null, adesso: ADESSO, ridotto: false })).toEqual({
      cascata: true,
      daSola: true,
    })
    expect(entrataDi({ prima: true, tipo: 'POP', ultima: null, adesso: ADESSO, ridotto: true }).daSola).toBe(false)
  })

  it('avanti il contenuto arriva a cascata, e la schermata entra da sé solo senza View Transition', () => {
    expect(entrata(appena('avanti'))).toEqual({ cascata: true, daSola: false })
    expect(entrata(appena('avanti', false))).toEqual({ cascata: true, daSola: true })
    expect(entrata(appena('avanti', false), 'PUSH', true)).toEqual({ cascata: true, daSola: false })
  })

  it('una schermata ritrovata, indietro o da una scheda, è già al suo posto', () => {
    expect(entrata(appena('indietro'), 'POP')).toEqual({ cascata: false, daSola: false })
    expect(entrata(appena('indietro', false), 'POP')).toEqual({ cascata: false, daSola: true })
    expect(entrata(appena('scheda'))).toEqual({ cascata: false, daSola: false })
    expect(entrata(appena('nessuna'), 'REPLACE')).toEqual({ cascata: false, daSola: false })
  })

  it('un gesto del browser non è l’ultima navigazione dell’app', () => {
    // Indietro col gesto subito dopo un avanti: la schermata di prima c'era gia'.
    expect(entrata(appena('avanti'), 'POP')).toEqual({ cascata: false, daSola: false })
    // Molto dopo l'ultima navigazione dell'app, o senza nessuna.
    const vecchia = { ...appena('avanti', false), quando: ADESSO - DOPO_LA_NAVIGAZIONE_MS - 1 }
    expect(entrata(vecchia)).toEqual({ cascata: false, daSola: false })
    expect(entrata(null, 'POP')).toEqual({ cascata: false, daSola: false })
  })
})

describe('lo scorrimento dopo una navigazione', () => {
  it('una schermata nuova comincia dall’alto, anche cambiando scheda', () => {
    expect(scorrimentoDopo('PUSH', '/libere', '/', undefined)).toBe(0)
    expect(scorrimentoDopo('PUSH', '/libere', '/', 480)).toBe(0)
    expect(scorrimentoDopo('REPLACE', '/wordle', '/wordle/classificata', 300)).toBe(0)
  })

  it('tornando indietro si ritrova la schermata dove la si era lasciata', () => {
    expect(scorrimentoDopo('POP', '/classifica', '/', 292)).toBe(292)
    expect(scorrimentoDopo('POP', '/classifica', '/', undefined)).toBe(0)
  })

  it('una sostituzione nella stessa schermata lascia lo scorrimento dov’è', () => {
    expect(scorrimentoDopo('REPLACE', '/classifica/wordle', '/classifica/wordle', 640)).toBeNull()
  })
})

/** Tutti i file sotto una cartella, con l'estensione data. */
function file(cartella: string, estensione: string): string[] {
  return readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome)
    if (statSync(percorso).isDirectory()) return nome === '__tests__' ? [] : file(percorso, estensione)
    return percorso.endsWith(estensione) ? [percorso] : []
  })
}

const SRC = join(__dirname, '..', '..')
/** Un foglio di stile senza i commenti, che raccontano anche le regole di prima. */
const regole = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const CSS = file(SRC, '.css').map((f) => ({ f, testo: regole(f) }))
const leggi = (relativo: string) => regole(join(SRC, relativo))

describe('le transizioni nei fogli di stile', () => {
  it('nessuna regola dipende dall’assenza della transizione: tornerebbe a valere quando finisce', () => {
    for (const { f, testo } of CSS) expect(testo, f).not.toMatch(/:not\(\[data-transizione/)
    expect(leggi('components/Pagina.css')).toMatch(/\.pagina--entra \{\n {2}animation: pagina-entra /)
  })

  it('fra le schede non c’è transizione', () => {
    for (const { f, testo } of CSS) expect(testo, f).not.toContain("data-transizione='scheda'")
  })

  it('si fotografano a parte solo la barra in basso e quella laterale', () => {
    const nomi = CSS.flatMap(({ testo }) => [...testo.matchAll(/view-transition-name:\s*([\w-]+)/g)].map((m) => m[1]))
    expect(nomi.sort()).toEqual(['laterale', 'tabbar'])
    for (const f of file(SRC, '.tsx')) expect(readFileSync(f, 'utf8'), f).not.toContain('viewTransitionName')
  })

  it('mentre la si fotografa, la barra in basso non è sfocata', () => {
    const regola = leggi('components/Shell.css').match(/html\[data-transizione\] \.tabbar \{[^}]*\}/)?.[0] ?? ''
    expect(regola).toContain('backdrop-filter: none;')
    expect(regola).toContain('-webkit-backdrop-filter: none;')
    expect(regola).toContain('background: var(--glass-pieno);')
  })

  it('in una schermata ritrovata le entrate delle schede non ripartono', () => {
    expect(leggi('styles/base.css')).toMatch(/\.pagina--ferma \.entra \{\n {2}animation: none;/)
    expect(leggi('components/Vetrina.css')).toMatch(/\.pagina--ferma \.eroe \{\n {2}animation: none;/)
    expect(leggi('pages/Giornaliere.css')).toMatch(/\.pagina--ferma \.podietto__posto \{\n {2}animation: none;/)
    expect(leggi('pages/Libere.css')).toMatch(/\.pagina--ferma \.chi-ce__amici > li \{\n {2}animation: none;/)
  })
})
