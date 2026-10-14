import { describe, expect, it } from 'vitest'
import {
  ANIMALI,
  PERSONE,
  VOCI_MASSIME,
  VOCI_MINIME,
  coloreDelPersonaggio,
  domandaInSospeso,
  immaginePredefinita,
  leggiAbbassate,
  leggiPersonaggi,
  personaggiPredefiniti,
  pulisciDomanda,
  sfondoPredefinito,
  type Mossa,
} from '../indovina'

/**
 * I valori che DiceBear accetta per lo stile avataaars (dal suo schema, versione
 * 9): un tratto scritto male non darebbe errore, darebbe un tratto a caso, e
 * le domande non tornerebbero piu'.
 */
const DICEBEAR: Record<string, readonly string[]> = {
  top: ['hat', 'hijab', 'turban', 'winterHat1', 'winterHat02', 'winterHat03', 'winterHat04', 'bob', 'bun', 'curly', 'curvy', 'dreads', 'frida', 'fro', 'froBand', 'longButNotTooLong', 'miaWallace', 'shavedSides', 'straight02', 'straight01', 'straightAndStrand', 'dreads01', 'dreads02', 'frizzle', 'shaggy', 'shaggyMullet', 'shortCurly', 'shortFlat', 'shortRound', 'shortWaved', 'sides', 'theCaesar', 'theCaesarAndSidePart', 'bigHair'],
  accessories: ['kurt', 'prescription01', 'prescription02', 'round', 'sunglasses', 'wayfarers', 'eyepatch'],
  facialHair: ['beardLight', 'beardMajestic', 'beardMedium', 'moustacheFancy', 'moustacheMagnum'],
  clothing: ['blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'graphicShirt', 'hoodie', 'overall', 'shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck'],
  clothingGraphic: ['bat', 'bear', 'cumbia', 'deer', 'diamond', 'hola', 'pizza', 'resist', 'skull', 'skullOutline'],
  eyes: ['closed', 'cry', 'default', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'winkWacky', 'wink', 'xDizzy'],
  eyebrows: ['angryNatural', 'defaultNatural', 'flatNatural', 'frownNatural', 'raisedExcitedNatural', 'sadConcernedNatural', 'unibrowNatural', 'upDownNatural', 'angry', 'default', 'raisedExcited', 'sadConcerned', 'upDown'],
  mouth: ['concerned', 'default', 'disbelief', 'eating', 'grimace', 'sad', 'screamOpen', 'serious', 'smile', 'tongue', 'twinkle', 'vomit'],
  skinColor: ['614335', 'd08b5b', 'ae5d29', 'edb98a', 'ffdbb4', 'fd9841', 'f8d25c'],
}

describe('i set predefiniti', () => {
  it('hanno ventiquattro personaggi con nomi tutti diversi', () => {
    for (const voci of [PERSONE, ANIMALI]) {
      expect(voci).toHaveLength(24)
      expect(new Set(voci.map((v) => v.nome.toLowerCase())).size).toBe(voci.length)
    }
  })

  it('le persone usano solo tratti che DiceBear conosce', () => {
    for (const p of PERSONE) {
      for (const [chiave, ammessi] of Object.entries(DICEBEAR)) {
        const valore = p.parametri[chiave]
        if (valore !== undefined) expect(ammessi, `${p.nome}: ${chiave}=${valore}`).toContain(valore)
      }
      // Occhiali e barba solo quando si vogliono: la probabilita' e' scritta, non lasciata al seme.
      expect(p.parametri.accessoriesProbability).toBe(p.parametri.accessories ? '100' : '0')
      expect(p.parametri.facialHairProbability).toBe(p.parametri.facialHair ? '100' : '0')
    }
  })

  it('ogni domanda classica divide le persone, invece di escluderle tutte o nessuna', () => {
    const quante = (f: (p: (typeof PERSONE)[number]) => boolean) => PERSONE.filter(f).length
    const tratti = {
      occhiali: quante((p) => Boolean(p.parametri.accessories)),
      barba: quante((p) => Boolean(p.parametri.facialHair)),
      cappello: quante((p) => ['hat', 'hijab', 'turban', 'winterHat1', 'winterHat02'].includes(p.parametri.top ?? '')),
      calvo: quante((p) => p.parametri.topProbability === '0' || p.parametri.top === 'sides'),
    }
    for (const [tratto, n] of Object.entries(tratti)) {
      expect(n, tratto).toBeGreaterThan(0)
      expect(n, tratto).toBeLessThan(PERSONE.length / 2)
    }
  })

  it('le immagini hanno indirizzi fissi, e gli animali un fondo', () => {
    expect(immaginePredefinita('persone', 'Anna')).toMatch(/^https:\/\/api\.dicebear\.com\/9\.x\/avataaars\/svg\?seed=Anna&/)
    expect(immaginePredefinita('animali', 'Orso polare')).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/gh\/microsoft\/fluentui-emoji@[0-9a-f]{40}\/assets\/Polar%20bear\/Flat\/polar_bear_flat\.svg$/,
    )
    expect(immaginePredefinita('persone', 'Nessuno')).toBeNull()
    expect(sfondoPredefinito('animali', 'Cane')).toMatch(/^#[0-9a-f]{6}$/)
    expect(sfondoPredefinito('persone', 'Anna')).toBeNull()
  })
})

describe('i personaggi scelti da chi invita', () => {
  const voci = Array.from({ length: VOCI_MINIME }, (_, i) => ({ nome: `Collega ${i}`, img: `${i}`.repeat(32) }))

  it('un set predefinito si ricostruisce dal nome, qualunque cosa porti con se', () => {
    expect(leggiPersonaggi({ set: 'animali', voci: [{ nome: 'Intruso' }] })).toEqual(personaggiPredefiniti('animali'))
  })

  it('un set proprio: da sei a trenta, nomi diversi e ripuliti, un’impronta per foto', () => {
    expect(leggiPersonaggi({ set: 'mio', nome: '  Ufficio  ', voci })).toMatchObject({ set: 'mio', nome: 'Ufficio' })
    expect(leggiPersonaggi({ set: 'mio', nome: 'X', voci: voci.map((v) => ({ ...v, nome: `  ${v.nome}   bis ` })) })?.voci[0].nome).toBe(
      'Collega 0 bis',
    )
    const troppi = Array.from({ length: VOCI_MASSIME + 1 }, (_, i) => ({ nome: `P${i}`, img: 'a'.repeat(32) }))
    expect(leggiPersonaggi({ set: 'mio', nome: 'Troppi', voci: troppi })).toBeNull()
    expect(leggiPersonaggi({ set: 'mio', nome: 'Pochi', voci: voci.slice(1) })).toBeNull()
    expect(leggiPersonaggi({ set: 'mio', nome: '', voci })).toBeNull()
    expect(leggiPersonaggi({ set: 'mio', nome: 'Doppi', voci: [...voci.slice(1), { ...voci[1], nome: 'COLLEGA 1' }] })).toBeNull()
    expect(leggiPersonaggi({ set: 'mio', nome: 'Foto', voci: voci.map((v) => ({ ...v, img: 'data:image/png' })) })).toBeNull()
    expect(leggiPersonaggi(null)).toBeNull()
  })

  it('un set proprio puo’ essere di soli nomi, o avere la foto solo di alcuni', () => {
    const soliNomi = voci.map(({ nome }) => ({ nome }))
    expect(leggiPersonaggi({ set: 'mio', nome: 'Calcetto', voci: soliNomi })?.voci).toEqual(soliNomi)
    const misto = voci.map((v, i) => (i % 2 === 0 ? v : { nome: v.nome, img: null }))
    expect(leggiPersonaggi({ set: 'mio', nome: 'Misto', voci: misto })?.voci).toEqual(
      voci.map((v, i) => (i % 2 === 0 ? v : { nome: v.nome })),
    )
    // Senza foto si gioca con i nomi, ma un'impronta che c'e' deve essere un'impronta.
    expect(leggiPersonaggi({ set: 'mio', nome: 'X', voci: [...soliNomi.slice(1), { nome: 'Strano', img: 42 }] })).toBeNull()
  })

  it('una carta senza foto ha un colore suo, mai lo stesso della carta accanto', () => {
    const colori = Array.from({ length: VOCI_MASSIME }, (_, k) => coloreDelPersonaggio(k))
    for (const c of colori) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    for (let k = 1; k < colori.length; k += 1) expect(colori[k]).not.toBe(colori[k - 1])
    // Anche sotto: in un tabellone a quattro, sei o otto colonne.
    for (const colonne of [3, 4, 6, 8]) {
      for (let k = colonne; k < colori.length; k += 1) expect(colori[k], `${colonne} colonne`).not.toBe(colori[k - colonne])
    }
  })
})

describe('la partita', () => {
  it('le facce abbassate sono indici diversi dentro il set', () => {
    expect(leggiAbbassate([5, 1, 5], 24)).toEqual([1, 5])
    expect(leggiAbbassate([24], 24)).toBeNull()
    expect(leggiAbbassate([1.5], 24)).toBeNull()
    expect(leggiAbbassate('1,2', 24)).toBeNull()
  })

  it('una domanda e’ in sospeso finché non arriva la sua risposta', () => {
    const d: Mossa = { t: 'd', da: 'a', testo: 'Ha la barba?', at: '' }
    expect(domandaInSospeso([d])).toEqual(d)
    expect(domandaInSospeso([d, { t: 'r', da: 'b', r: 'si', at: '' }])).toBeNull()
    expect(domandaInSospeso([])).toBeNull()
  })

  it('una domanda e’ una riga sola, non troppo lunga', () => {
    expect(pulisciDomanda('  Ha\n gli   occhiali? ')).toBe('Ha gli occhiali?')
    expect(pulisciDomanda('x'.repeat(500))).toHaveLength(120)
    expect(pulisciDomanda(42)).toBe('')
  })
})
