import { describe, expect, it } from 'vitest'
import {
  ErroreLupus,
  IMPOSTAZIONI_LUPUS,
  applica,
  chiAspetta,
  compitiDellaNotte,
  nuovaPartita,
  type PartitaLupus,
} from '../lupus'
import { casoDa, mescola } from '../lupus-caso'
import { composizioneAutomatica } from '../lupus-composizione'
import { richiestaPer, vistaPer } from '../lupus-vista'
import { avanti, notte, partitaCon, ruoliVisti, tuttiVotano, viviIn, voti } from './lupus-banco'

describe('l’inizio della partita', () => {
  it('distribuisce i ruoli in base al seme, sempre allo stesso modo', () => {
    const iscritti = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, nome: `G${i}` }))
    const a = nuovaPartita(iscritti, composizioneAutomatica(9), IMPOSTAZIONI_LUPUS, 7, 0)
    const b = nuovaPartita(iscritti, composizioneAutomatica(9), IMPOSTAZIONI_LUPUS, 7, 0)
    expect(a.giocatori.map((g) => g.ruolo)).toEqual(b.giocatori.map((g) => g.ruolo))
    expect(a.giocatori.filter((g) => g.ruolo === 'lupo')).toHaveLength(2)
  })

  it('la prima notte comincia quando tutti hanno visto il ruolo', () => {
    const p = partitaCon(['lupo', 'veggente', 'villico', 'villico', 'villico'])
    expect(p.fase).toBe('ruoli')
    const p2 = ruoliVisti(p)
    expect(p2.fase).toBe('notte')
    expect(p2.notte).toBe(1)
  })
})

describe('la prima notte', () => {
  it('con "prima notte senza vittime" i lupi si riconoscono soltanto', () => {
    const p = ruoliVisti(partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico']))
    const compiti = compitiDellaNotte(p)
    expect(compiti.filter((c) => c.tipo === 'branco')).toHaveLength(2)
    expect(compiti.find((c) => c.giocatore === 'p2')?.tipo).toBe('scrutare')
    const richiesta = richiestaPer(p, 'p0')
    expect(richiesta.tipo).toBe('notizia')
    if (richiesta.tipo === 'notizia') expect(richiesta.giocatori).toEqual(['p1'])
    const p2 = notte(p, { p0: 'letto', p1: 'letto', p2: 'p0' })
    expect(p2.fase).toBe('alba')
    expect(p2.alba?.morti).toEqual([])
    expect(p2.alba?.nessunaVittima).toBe(true)
    // Il Veggente ha visto un lupo.
    expect(p2.segreti.p2).toEqual([{ notte: 1, tipo: 'sguardo', bersaglio: 'p0', malvagio: true }])
  })

  it('senza la variante i lupi sbranano subito', () => {
    const p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico'], { primaNotteSenzaVittime: false }),
    )
    const p2 = notte(p, { p0: 'p3', p1: 'p3', p2: 'p4' })
    expect(p2.alba?.morti).toEqual(['p3'])
    expect(p2.benvenuto).toBe('p3')
    expect(viviIn(p2)).not.toContain('p3')
  })

  it('la Guardia e il Medium non agiscono la prima notte, i Massoni sì', () => {
    const p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'guardia', 'medium', 'massone', 'massone', 'villico']),
    )
    const tipi = Object.fromEntries(compitiDellaNotte(p).map((c) => [c.giocatore, c.tipo]))
    expect(tipi.p3).toBeUndefined()
    expect(tipi.p4).toBeUndefined()
    expect(tipi.p5).toBe('loggia')
    expect(richiestaPer(p, 'p3').tipo).toBe('dormi')
  })
})

describe('la notte e l’alba', () => {
  const base = () => {
    // Due lupi, il Veggente, la Guardia, il Medium e quattro villici: nove.
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'guardia', 'medium', 'villico', 'villico', 'villico', 'villico']),
    )
    p = notte(p, { p0: 'letto', p1: 'letto', p2: 'p5' })
    // Il primo giorno: la discussione, le nomine (tutti su p8 e p7), il ballottaggio, e p8 linciato.
    p = avanti(p, 2)
    expect(p.fase).toBe('nomine')
    return p
  }

  it('la Guardia protegge: nessuno sbranato', () => {
    let p = base()
    p = tuttiVotano(p, 'p8', 'p7')
    expect(p.fase).toBe('arringhe')
    p = avanti(p)
    p = tuttiVotano(p, 'p8', 'p7')
    expect(p.fase).toBe('notte')
    expect(p.ultimoLinciato).toBe('p8')
    expect(viviIn(p)).not.toContain('p8')
    // La seconda notte: i lupi e la Guardia su p6, il Veggente su p3, il Medium legge.
    p = notte(p, { p0: 'p6', p1: 'p6', p3: 'p6', p2: 'p3', p4: 'letto' })
    expect(p.fase).toBe('alba')
    expect(p.alba?.morti).toEqual([])
    expect(p.alba?.nessunaVittima).toBe(true)
    expect(p.segreti.p4?.[0]).toEqual({ notte: 2, tipo: 'seduta', bersaglio: 'p8', mannaro: false })
  })

  it('la Guardia non può proteggere se stessa', () => {
    let p = base()
    p = tuttiVotano(p, 'p8', 'p7')
    p = avanti(p)
    p = tuttiVotano(p, 'p8', 'p7')
    expect(() => notte(p, { p3: 'p3' })).toThrow(ErroreLupus)
  })

  it('a pari voti fra i lupi decide il caso, con il seme fisso', () => {
    let p = base()
    p = tuttiVotano(p, 'p8', 'p7')
    p = avanti(p)
    p = tuttiVotano(p, 'p8', 'p7')
    p = notte(p, { p0: 'p6', p1: 'p5', p3: 'p2', p2: 'p3', p4: 'letto' })
    expect(p.alba?.morti).toHaveLength(1)
    expect(['p5', 'p6']).toContain(p.alba?.morti[0])
  })
})

describe('le votazioni del giorno', () => {
  it('i fantasmi votano le nomine ma non il ballottaggio', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico', 'villico'], {
        primaNotteSenzaVittime: false,
      }),
    )
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p4' })
    expect(viviIn(p)).not.toContain('p3')
    p = avanti(p, 2)
    expect(p.fase).toBe('nomine')
    // p3 e' morto e vota lo stesso, e l'ordine parte da chi sta a sinistra del "Benvenuto" (p3).
    expect(p.ordineDiVoto[0]).toBe('p4')
    expect(p.ordineDiVoto).toContain('p3')
    p = voti(p, { p4: 'p0', p5: 'p0', p6: 'p1', p0: 'p6', p1: 'p6', p2: 'p0', p3: 'p1' })
    expect(p.fase).toBe('arringhe')
    // p0 ha tre voti, p1 e p6 due a testa: in senso orario da p3 (p4, p5, p6, p0, p1, p2) viene prima p6.
    expect(p.indiziati).toEqual(['p0', 'p6'])
    p = avanti(p)
    expect(p.fase).toBe('ballottaggio')
    // Ne' gli indiziati ne' il fantasma.
    expect([...chiAspetta(p)].sort()).toEqual(['p1', 'p2', 'p4', 'p5'])
    expect(() => voti(p, { p3: 'p0' })).toThrow(ErroreLupus)
  })

  it('senza fantasmi votanti, i morti restano fuori', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico', 'villico'], {
        primaNotteSenzaVittime: false,
        fantasmiVotano: false,
      }),
    )
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p4' })
    p = avanti(p, 2)
    expect(p.ordineDiVoto).not.toContain('p3')
  })

  it('il ballottaggio lincia il più votato; a parità il più vicino al Benvenuto', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico', 'villico', 'villico'], {
        primaNotteSenzaVittime: false,
      }),
    )
    p = notte(p, { p0: 'p7', p1: 'p7', p2: 'p4' })
    p = avanti(p, 2)
    p = voti(p, { p0: 'p2', p1: 'p2', p2: 'p0', p3: 'p0', p4: 'p2', p5: 'p0', p6: 'p1', p7: 'p1' })
    expect([...p.indiziati].sort()).toEqual(['p0', 'p2'])
    p = avanti(p)
    // Votano p1, p3, p4, p5 e p6: due voti a testa e un astenuto. Al pareggio passa il piu' vicino a p7 in
    // senso orario: p0.
    p = voti(p, { p1: 'p0', p3: 'p2', p4: 'p0', p5: 'p2', p6: null })
    expect(p.esitoBallottaggio?.linciato).toBe('p0')
    expect(p.fase).toBe('notte')
    expect(p.notte).toBe(2)
  })

  it('il gufato entra d’ufficio fra gli indiziati', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'gufo', 'villico', 'villico', 'villico', 'villico']),
    )
    p = notte(p, { p0: 'letto', p1: 'letto', p2: 'p4', p3: 'p5' })
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p0' ? 'p1' : 'p0'])))
    expect(p.indiziati).toEqual(['p5', 'p0'])
  })

  it('chi conduce può chiudere una votazione a cui manca qualcuno', () => {
    let p = ruoliVisti(partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico']))
    p = notte(p, { p0: 'letto', p1: 'letto', p2: 'p3' })
    p = avanti(p, 2)
    p = voti(p, { p3: 'p0', p4: 'p1' })
    // Chiude le nomine.
    p = avanti(p)
    expect(p.fase).toBe('arringhe')
    expect([...p.indiziati].sort()).toEqual(['p0', 'p1'])
    p = avanti(p)
    // Nessun voto, nessun linciato.
    p = avanti(p)
    expect(p.fase).toBe('notte')
    expect(p.ultimoLinciato).toBeNull()
  })
})

describe('la fine della partita', () => {
  it('vince il villaggio quando i lupi sono tutti morti', () => {
    let p = ruoliVisti(partitaCon(['lupo', 'veggente', 'villico', 'villico', 'villico']))
    p = notte(p, { p0: 'letto', p1: 'p0' })
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p0' ? 'p1' : 'p0'])))
    p = avanti(p)
    p = voti(p, Object.fromEntries(chiAspetta(p).map((v) => [v, 'p0'])))
    expect(p.fase).toBe('finita')
    expect(p.esito?.vincitore).toBe('villaggio')
    expect(p.esito?.vincitori.slice().sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('vincono i lupi quando sono tanti quanti gli altri', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'indemoniato'], {
        primaNotteSenzaVittime: false,
      }),
    )
    // Due lupi contro tre umani.
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p4' })
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p4' ? 'p5' : 'p4'])))
    p = avanti(p)
    // Due lupi contro due.
    p = voti(p, Object.fromEntries(chiAspetta(p).map((v) => [v, 'p4'])))
    expect(p.fase).toBe('finita')
    expect(p.esito?.vincitore).toBe('lupi')
    // L'Indemoniato vince con i lupi.
    expect(p.esito?.vincitori.slice().sort()).toEqual(['p0', 'p1', 'p5'])
  })

  it('il Criceto vince solo se è vivo alla fine: se lo guarda il Veggente muore, e vincono i lupi', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'criceto'], { primaNotteSenzaVittime: false }),
    )
    // Due lupi contro il Veggente e il Criceto: e' finita.
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p4' })
    expect(p.fase).toBe('finita')
    // Il Veggente ha guardato il Criceto, che muore insieme allo sbranato.
    expect(viviIn(p)).not.toContain('p4')
    expect(p.esito?.vincitore).toBe('lupi')
  })

  it('il Criceto sopravvissuto è l’unico vincitore', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'criceto'], { primaNotteSenzaVittime: false }),
    )
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p0' })
    expect(p.fase).toBe('finita')
    expect(p.esito?.vincitore).toBe('criceto')
    expect(p.esito?.vincitori).toEqual(['p4'])
  })

  it('i lupi non possono sbranare il Criceto', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'criceto'], { primaNotteSenzaVittime: false }),
    )
    p = notte(p, { p0: 'p5', p1: 'p5', p2: 'p3' })
    expect(p.alba?.morti).toEqual([])
    expect(p.alba?.nessunaVittima).toBe(true)
  })
})

describe('i personaggi speciali', () => {
  it('il Mitomane che indica un lupo diventa lupo dalla notte dopo', () => {
    let p = ruoliVisti(
      partitaCon([
        'lupo',
        'lupo',
        'veggente',
        'mitomane',
        'villico',
        'villico',
        'villico',
        'villico',
        'villico',
        'villico',
      ]),
    )
    expect(compitiDellaNotte(p).find((c) => c.giocatore === 'p3')).toBeUndefined()
    p = notte(p, { p0: 'letto', p1: 'letto', p2: 'p4' })
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p7' ? 'p6' : 'p7'])))
    p = avanti(p)
    p = voti(p, Object.fromEntries(chiAspetta(p).map((v) => [v, 'p7'])))
    expect(p.notte).toBe(2)
    expect(compitiDellaNotte(p).find((c) => c.giocatore === 'p3')?.tipo).toBe('imitare')
    p = notte(p, { p0: 'p6', p1: 'p6', p2: 'p5', p3: 'p0' })
    expect(p.giocatori[3].ruoloAssunto).toBe('lupo')
    expect(p.segreti.p3?.[0]).toEqual({ notte: 2, tipo: 'imitazione', bersaglio: 'p0', diventato: 'lupo' })
    // Adesso e' nel branco: lui vede i lupi, e i lupi vedono lui.
    p = avanti(p, 2)
    const v = vistaPer(p, 'p3')
    expect(v.tu.fazione).toBe('lupi')
    expect([...v.tu.compagni].sort()).toEqual(['p0', 'p1'])
    expect([...vistaPer(p, 'p0').tu.compagni].sort()).toEqual(['p1', 'p3'])
  })

  it('Lara può sbranare un altro lupo: nessun villico muore', () => {
    let p = ruoliVisti(
      partitaCon(['lara', 'lupo', 'veggente', 'villico', 'villico', 'villico', 'villico'], {
        primaNotteSenzaVittime: false,
      }),
    )
    p = notte(p, { p0: 'p1', p1: 'p3', p2: 'p4' })
    expect(p.alba?.morti).toEqual(['p1'])
    expect(p.alba?.nessunaVittima).toBe(true)
  })

  it('la Mucca vede i lupi la prima notte e vince con loro', () => {
    const p = ruoliVisti(partitaCon(['lupo', 'lupo', 'mucca', 'veggente', 'villico', 'villico']))
    const r = richiestaPer(p, 'p2')
    expect(r.tipo).toBe('notizia')
    if (r.tipo === 'notizia') expect(r.giocatori?.slice().sort()).toEqual(['p0', 'p1'])
    // I lupi non vedono la Mucca.
    expect(vistaPer(p, 'p0').tu.compagni).toEqual(['p1'])
    expect(vistaPer(p, 'p2').tu.fazione).toBe('lupi')
  })

  it('Darius vince da solo se resta vivo con al massimo un altro', () => {
    let p = ruoliVisti(partitaCon(['lupo', 'darius', 'veggente', 'villico'], { primaNotteSenzaVittime: false }))
    // Restano il lupo, Darius e il villico: un lupo contro due, si continua.
    p = notte(p, { p0: 'p2', p1: 'p3', p2: 'p1' })
    expect(p.fase).toBe('alba')
    p = avanti(p, 2)
    p = voti(p, { p0: 'p3', p1: 'p3', p3: 'p0', p2: 'p0' })
    p = avanti(p)
    p = voti(p, { p1: 'p3' })
    expect(p.fase).toBe('finita')
    expect(p.esito?.vincitore).toBe('darius')
  })

  it('il dottor Jekyll uccide una volta sola, e la trasformazione si annuncia', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'jekyll', 'villico', 'villico', 'villico', 'villico']),
    )
    p = notte(p, { p0: 'letto', p1: 'letto', p2: 'p4' })
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p7' ? 'p6' : 'p7'])))
    p = avanti(p)
    p = voti(p, Object.fromEntries(chiAspetta(p).map((v) => [v, 'p7'])))
    expect(compitiDellaNotte(p).find((c) => c.giocatore === 'p3')?.tipo).toBe('pozione')
    p = notte(p, { p0: 'p6', p1: 'p6', p2: 'p5', p3: 'p0' })
    expect(p.alba?.jekyll).toBe(true)
    expect(p.alba?.morti.slice().sort()).toEqual(['p0', 'p6'])
    expect(p.pozioneBevuta).toBe(true)
  })

  it('il Baron Samedi riporta in vita chi ha il Benvenuto, anche da fantasma', () => {
    let p = ruoliVisti(
      partitaCon(
        ['lupo', 'lupo', 'veggente', 'baron', 'villico', 'villico', 'villico', 'villico', 'villico', 'villico'],
        { primaNotteSenzaVittime: false },
      ),
    )
    // Muore il Baron.
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p4' })
    expect(viviIn(p)).not.toContain('p3')
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p7' ? 'p6' : 'p7'])))
    p = avanti(p)
    p = voti(p, Object.fromEntries(chiAspetta(p).map((v) => [v, 'p7'])))
    // La seconda notte il Benvenuto e' p3, il Baron stesso: su di se' il potere non vale.
    expect(compitiDellaNotte(p).find((c) => c.giocatore === 'p3')).toBeUndefined()
    p = notte(p, { p0: 'p6', p1: 'p6', p2: 'p5' })
    expect(p.benvenuto).toBe('p6')
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p5' ? 'p4' : 'p5'])))
    p = avanti(p)
    p = voti(p, Object.fromEntries(chiAspetta(p).map((v) => [v, 'p5'])))
    // La terza notte il Baron, da fantasma, puo' riportare in vita p6.
    expect(compitiDellaNotte(p).find((c) => c.giocatore === 'p3')?.tipo).toBe('resuscitare')
    p = notte(p, { p0: 'p4', p1: 'p4', p2: 'p0', p3: true })
    expect(p.alba?.risorto).toBe('p6')
    expect(viviIn(p)).toContain('p6')
    expect(p.baronUsato).toBe(true)
  })

  it('il Mortovivo ucciso si rivela e continua a votare', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'mortovivo', 'villico', 'villico', 'villico', 'villico'], {
        primaNotteSenzaVittime: false,
      }),
    )
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p4' })
    const mortovivo = p.giocatori[3]
    expect(mortovivo.vivo).toBe(false)
    expect(mortovivo.nonMorto).toBe(true)
    expect(mortovivo.rivelato).toBe(true)
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p7' ? 'p6' : 'p7'])))
    p = avanti(p)
    // Vota anche il ballottaggio.
    expect(chiAspetta(p)).toContain('p3')
    expect(vistaPer(p, 'p0').giocatori[3].ruolo).toBe('mortovivo')
  })

  it('Miss Purple conta i malvagi vivi', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'purple', 'criceto', 'villico', 'villico', 'villico']),
    )
    p = notte(p, { p0: 'letto', p1: 'letto', p2: 'p5' })
    p = avanti(p, 2)
    p = voti(p, Object.fromEntries(p.ordineDiVoto.map((v) => [v, v === 'p7' ? 'p6' : 'p7'])))
    p = avanti(p)
    p = voti(p, Object.fromEntries(chiAspetta(p).map((v) => [v, 'p7'])))
    const r = richiestaPer(p, 'p3')
    expect(r.tipo).toBe('notizia')
    if (r.tipo === 'notizia') expect(r.testo).toContain('3 malvagi')
  })

  it('il Gufo letale uccide il gufato se non è mannaro', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'gufo', 'villico', 'villico', 'villico', 'villico'], {
        gufoLetale: 'si',
        primaNotteSenzaVittime: false,
      }),
    )
    p = notte(p, { p0: 'p4', p1: 'p4', p2: 'p5', p3: 'p6' })
    expect(p.alba?.morti.slice().sort()).toEqual(['p4', 'p6'])
    expect(p.gufato).toBeNull()
  })
})

describe('la vista di un giocatore', () => {
  it('non rivela i ruoli altrui finché la partita non finisce', () => {
    const p = ruoliVisti(partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico']))
    const v = vistaPer(p, 'p3')
    expect(v.tu.ruolo).toBe('villico')
    expect(v.giocatori.every((g) => g.ruolo === undefined)).toBe(true)
    expect(v.tu.compagni).toEqual([])
    expect(vistaPer(p, 'p0').tu.compagni).toEqual(['p1'])
  })

  it('non dice perché e’ morto qualcuno prima della fine: il Criceto guardato dal Veggente direbbe due ruoli', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico', 'criceto'], {
        primaNotteSenzaVittime: false,
      }),
    )
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p6' })
    expect(p.fase).toBe('alba')
    expect(p.alba?.cause).toEqual({ p3: 'lupi', p6: 'sguardo' })
    for (const id of ['p2', 'p4']) {
      const v = vistaPer(p, id)
      expect(v.alba?.morti.slice().sort()).toEqual(['p3', 'p6'])
      expect(v.alba?.cause).toEqual({})
      const morti = v.cronaca.filter((e) => e.t === 'morte')
      expect(morti).toHaveLength(2)
      for (const e of morti) expect(e.t === 'morte' && e.causa).toBeFalsy()
    }
    // Lo sguardo lo sa solo il Veggente, nei suoi segreti.
    expect(JSON.stringify(vistaPer(p, 'p4'))).not.toContain('sguardo')
  })

  it('rifiuta le azioni fuori fase', () => {
    const p = partitaCon(['lupo', 'veggente', 'villico', 'villico'])
    expect(() => applica(p, { tipo: 'voto', giocatore: 'p0', bersaglio: 'p1' }, 0)).toThrow(ErroreLupus)
  })

  it('a chi non e’ lupo non arriva mai il ruolo di un lupo, finché la partita non finisce', () => {
    const lupi = ['p0', 'p1']
    const altri = ['p2', 'p3', 'p4', 'p5', 'p6']
    // La vista intera, com'e' mandata al telefono: niente stato della partita, e niente "lupo".
    const guarda = (p: PartitaLupus) => {
      for (const id of altri) {
        const v = vistaPer(p, id)
        const json = JSON.stringify(v)
        expect(json, `${p.fase}, vista di ${id}`).not.toContain('"lupo"')
        for (const chiave of ['scelte', 'voti', 'statoCaso', 'seme', 'decisione']) expect(v).not.toHaveProperty(chiave)
        if (p.fase === 'notte') expect(v.aspetta).toEqual([])
        if (p.fase === 'ballottaggio') expect(v.votiNomine).toEqual({})
      }
      return p
    }
    let p = guarda(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico', 'amleto'], {
        primaNotteSenzaVittime: false,
      }),
    )
    for (const g of p.giocatori) p = guarda(applica(p, { tipo: 'ruolo_visto', giocatore: g.id }, 1000))
    // La prima notte: i lupi su p4, il Veggente guarda un lupo, Amleto da' il teschio a p5.
    for (const [id, bersaglio] of [['p0', 'p4'], ['p1', 'p4'], ['p2', 'p0'], ['p6', 'p5']]) {
      p = guarda(notte(p, { [id]: bersaglio }))
    }
    expect(p.fase).toBe('decisione')
    p = guarda(applica(p, { tipo: 'benvenuto', giocatore: 'p4' }, 2000))
    p = guarda(avanti(p))
    p = guarda(avanti(p))
    // Le nomine si vedono man mano: p0 e p1 indiziati, e il ballottaggio, segreto, lincia p0.
    for (const id of chiAspetta(p)) p = guarda(voti(p, { [id]: id === 'p0' ? 'p1' : 'p0' }))
    p = guarda(avanti(p))
    for (const id of chiAspetta(p)) p = guarda(voti(p, { [id]: 'p0' }))
    expect(p.esitoBallottaggio?.linciato).toBe('p0')
    p = guarda(applica(p, { tipo: 'benvenuto', giocatore: 'p0' }, 3000))
    // La seconda notte: p5 passa il teschio a p3, l'altro lupo sbrana il Veggente, che guarda lui.
    for (const [id, bersaglio] of [['p5', 'p3'], ['p1', 'p2'], ['p2', 'p1']]) {
      p = guarda(notte(p, { [id]: bersaglio }))
    }
    p = guarda(applica(p, { tipo: 'benvenuto', giocatore: 'p2' }, 4000))
    p = guarda(avanti(p, 2))
    for (const id of chiAspetta(p)) p = guarda(voti(p, { [id]: id === 'p1' ? 'p3' : 'p1' }))
    p = guarda(avanti(p))
    for (const id of chiAspetta(p)) p = guarda(voti(p, { [id]: 'p1' }))
    // L'ultimo lupo e' linciato: alla fine i ruoli sono di tutti.
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p1' }, 5000)
    expect(p.fase).toBe('finita')
    expect(p.esito?.vincitore).toBe('villaggio')
    const fine = vistaPer(p, 'p3')
    expect(JSON.stringify(fine)).toContain('"lupo"')
    expect(lupi.map((id) => fine.esito?.ruoli[id])).toEqual(['lupo', 'lupo'])
  })

  it('con il ruolo rivelato alla morte, si vede solo quello del lupo morto', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico', 'villico'], {
        rivelaRuoloAllaMorte: true,
      }),
    )
    p = notte(p, { p0: 'letto', p1: 'letto', p2: 'p3' })
    p = avanti(p, 2)
    p = tuttiVotano(p, 'p0', 'p1')
    p = avanti(p)
    p = tuttiVotano(p, 'p0', 'p1')
    expect(p.fase).toBe('notte')
    const v = vistaPer(p, 'p4')
    expect(v.giocatori[0].ruolo).toBe('lupo')
    expect(v.giocatori[1].ruolo).toBeUndefined()
  })
})

describe('il caso', () => {
  it('riprendere da stato() dà la stessa sequenza di chi ha continuato', () => {
    for (const seme of [0, 1, 42, 0xffffffff, 123456789]) {
      const continua = casoDa(seme)
      for (let i = 0; i < 17; i += 1) continua.prossimo()
      const ripresa = casoDa(continua.stato())
      const dopo = Array.from({ length: 50 }, () => continua.prossimo())
      expect(Array.from({ length: 50 }, () => ripresa.prossimo())).toEqual(dopo)
      expect(ripresa.stato()).toBe(continua.stato())
    }
    expect(mescola([1, 2, 3, 4, 5], casoDa(9))).toEqual(mescola([1, 2, 3, 4, 5], casoDa(9)))
  })

  it('lo stesso seme dà gli stessi ruoli e gli stessi pareggi del motore di prima', () => {
    // I valori vengono dal motore da cui questo e' stato portato: cambiarli vorrebbe dire che lo stesso seme
    // non da' piu' la stessa partita.
    const iscritti = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, nome: `G${i}` }))
    const p = nuovaPartita(iscritti, composizioneAutomatica(16), IMPOSTAZIONI_LUPUS, 2026, 0)
    expect(p.giocatori.map((g) => g.ruolo)).toEqual([
      'criceto',
      'massone',
      'lupo',
      'gufo',
      'villico',
      'massone',
      'villico',
      'guardia',
      'mitomane',
      'lupo',
      'villico',
      'villico',
      'medium',
      'indemoniato',
      'lupo',
      'veggente',
    ])
    expect(p.statoCaso).toBe(1703685445)

    let q = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'guardia', 'medium', 'villico', 'villico', 'villico', 'villico']),
    )
    q = notte(q, { p0: 'letto', p1: 'letto', p2: 'p5' })
    q = avanti(q, 2)
    q = tuttiVotano(q, 'p8', 'p7')
    q = avanti(q)
    q = tuttiVotano(q, 'p8', 'p7')
    q = notte(q, { p0: 'p6', p1: 'p5', p3: 'p2', p2: 'p3', p4: 'letto' })
    expect(q.alba?.morti).toEqual(['p5'])
    expect(q.statoCaso).toBe(3599190471)
  })
})
