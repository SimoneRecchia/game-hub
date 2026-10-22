import { describe, expect, it } from 'vitest'
import { PASSO_FINALE, svolgiCatena, type CatenaDelGiorno, type MossaCatena } from '@shared/catena'
import { PREAMBOLO_RIPRESA_MS, daSalvare, dettaglioDi, leggiSalvata, nomeDi, partitaDa, type CatenaSalvata } from '../sospesa'

const CATENA: CatenaDelGiorno = {
  parole: ['alto', 'bordo', 'libro', 'aperto', 'cuore', 'leone', 'marino', 'elefante', 'bianco', 'sciopero', 'selvaggio'],
  espressioni: [
    "d'alto bordo",
    'libro di bordo',
    'libro aperto',
    'a cuore aperto',
    'Cuor di Leone',
    'leone marino',
    'elefante marino',
    'elefante bianco',
    'sciopero bianco',
    'sciopero selvaggio',
  ],
}

const salvata = (mosse: MossaCatena[], resta: number | null): CatenaSalvata => ({
  v: 1,
  nome: nomeDi(CATENA.parole),
  tempoParolaMs: 60_000,
  tempoFinaleMs: 90_000,
  mosse,
  resta,
})

/** Mosse a tempo finito finché non si arriva alla finale: ogni parola si mostra. */
function finoAllaFinale(): MossaCatena[] {
  const mosse: MossaCatena[] = []
  while (svolgiCatena(CATENA, mosse).passo < PASSO_FINALE) mosse.push({ k: 't' })
  return mosse
}

describe('la Catena libera in sospeso', () => {
  it('riprende dalla parola dov era, con il minuto che restava', () => {
    const s = salvata([{ k: 'p', w: 'bordo' }, { k: 'j' }], 25_000)
    const p = partitaDa(s, CATENA, 10_000)
    expect(p.mosse).toEqual(s.mosse)
    expect(p.parola).toEqual({ inizio: 10_000 + PREAMBOLO_RIPRESA_MS, scadenza: 10_000 + PREAMBOLO_RIPRESA_MS + 25_000 })
    expect(p.finale).toBeNull()
    expect(dettaglioDi(p)).toBe('Seconda parola')
    expect(daSalvare(p, 10_000)).toEqual(s)
    expect(daSalvare(p, 10_000 + PREAMBOLO_RIPRESA_MS + 5_000)?.resta).toBe(20_000)
    expect(leggiSalvata(JSON.stringify(s))).toEqual(s)
  })

  it('alla finale torna dentro il suo minuto, senza l annuncio', () => {
    const s = salvata(finoAllaFinale(), 40_000)
    const p = partitaDa(s, CATENA, 100_000)
    expect(p.parola).toBeNull()
    expect(p.finale).toEqual({ inizio: 50_000, scadenza: 140_000 })
    expect(dettaglioDi(p)).toBe('La parola finale')
    expect(daSalvare(p, 110_000)?.resta).toBe(30_000)
  })

  it('non salva una sfida, una partita non cominciata o finita', () => {
    const p = partitaDa(salvata([], null), CATENA, 0)
    expect(daSalvare({ ...p, nome: null }, 0)).toBeNull()
    expect(daSalvare({ ...p, iniziata: false }, 0)).toBeNull()
    expect(daSalvare({ ...p, finita: true }, 0)).toBeNull()
  })

  it('scarta un salvataggio rovinato', () => {
    expect(leggiSalvata('null')).toBeNull()
    expect(leggiSalvata(JSON.stringify({ ...salvata([], 1), mosse: [{ k: 'x' }] }))).toBeNull()
    expect(leggiSalvata(JSON.stringify({ ...salvata([], 1), resta: -1 }))).toBeNull()
  })
})
