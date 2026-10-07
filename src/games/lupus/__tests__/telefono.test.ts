import { describe, expect, it } from 'vitest'
import { partitaCon } from '@shared/__tests__/lupus-banco'
import { vistaPer } from '@shared/lupus-vista'
import type { IdPersonaggio } from '@shared/lupus-personaggi'
import {
  agisci,
  agisciEPassa,
  annunciaLaNotte,
  apri,
  chiHaIlTelefono,
  comincia,
  giroInCorso,
  leggiTelefono,
  passa,
  PREPARAZIONE_INIZIALE,
  problemaDellaPreparazione,
  salvaTelefono,
  sceltaDellaNotte,
  sistema,
  tempoPassato,
  type StatoTelefono,
} from '../telefono'

const ADESSO = 10_000

function telefonoCon(ruoli: IdPersonaggio[], regole: Parameters<typeof partitaCon>[1] = {}): StatoTelefono {
  return sistema({ partita: partitaCon(ruoli, regole), giro: null, notteAnnunciata: 0 }, ADESSO)
}

/** Tutti vedono il ruolo, uno dopo l'altro: il telefono passa a ognuno. */
function ruoliVisti(s: StatoTelefono): StatoTelefono {
  let t = s
  while (t.partita.fase === 'ruoli' || giroInCorso(t)?.perche === 'ruolo') {
    const chi = chiHaIlTelefono(t)!
    t = agisciEPassa(apri(t), { tipo: 'ruolo_visto', giocatore: chi }, ADESSO)
  }
  return t
}

/** Il giro della notte: chi ha un compito sceglie come scritto, chi non ne ha finge e passa. */
function giraLaNotte(s: StatoTelefono, scelte: Record<string, string>): { stato: StatoTelefono; visti: string[] } {
  let t = s
  const visti: string[] = []
  while (giroInCorso(t)?.perche === 'notte') {
    const chi = chiHaIlTelefono(t)!
    visti.push(chi)
    t = apri(t)
    if (t.giro!.fatto) {
      t = passa(t, ADESSO)
      continue
    }
    const r = vistaPer(t.partita, chi).richiesta
    const v = scelte[chi]
    if (t.partita.fase === 'notte' && v !== undefined) {
      const scelta = v === 'letto' ? ({ tipo: 'letto' } as const) : ({ tipo: 'indica', bersaglio: v } as const)
      t = sceltaDellaNotte(t, chi, scelta, ADESSO)
    } else {
      expect(['dormi', 'fantasma', 'aspetta']).toContain(r.tipo)
      t = passa(t, ADESSO)
    }
  }
  return { stato: t, visti }
}

describe('il telefono che passa di mano', () => {
  it('i ruoli passano a tutti nell’ordine dei posti, poi comincia il giro della notte', () => {
    let t = telefonoCon(['villico', 'lupo', 'veggente', 'villico', 'villico'])
    expect(giroInCorso(t)?.elenco).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
    expect(chiHaIlTelefono(t)).toBe('p0')
    // Senza dire chi e', la schermata privata non si apre.
    expect(t.giro!.aperto).toBe(false)
    t = ruoliVisti(t)
    expect(t.partita.fase).toBe('notte')
    expect(giroInCorso(t)).toMatchObject({ perche: 'notte', elenco: ['p0', 'p1', 'p2', 'p3', 'p4'], indice: 0 })
  })

  it('di notte il telefono passa a tutti, e l’alba arriva solo dopo l’ultimo', () => {
    const regole = { primaNotteSenzaVittime: false }
    let t = ruoliVisti(telefonoCon(['veggente', 'lupo', 'villico', 'villico', 'villico'], regole))
    // Il lupo e' il secondo: con la sua scelta la notte e' risolta, ma il telefono continua a girare.
    t = sceltaDellaNotte(apri(t), 'p0', { tipo: 'indica', bersaglio: 'p2' }, ADESSO)
    expect(t.giro!.fatto).toBe(true)
    t = passa(t, ADESSO)
    t = sceltaDellaNotte(apri(t), 'p1', { tipo: 'indica', bersaglio: 'p3' }, ADESSO)
    expect(t.partita.fase).toBe('alba')
    expect(chiHaIlTelefono(t)).toBe('p2')
    // Chi finge sceglie fra i vivi di quando e' cominciata la notte: c'e' anche lo sbranato.
    expect(t.giro!.vivi).toContain('p3')
    const { stato, visti } = giraLaNotte(t, {})
    expect(visti).toEqual(['p2', 'p3', 'p4'])
    expect(giroInCorso(stato)).toBeNull()
    expect(stato.partita.fase).toBe('alba')
    expect(stato.partita.alba?.morti).toEqual(['p3'])
  })

  it('chi ha agito legge l’esito prima di passare, e quel che ha letto per scegliere non si ripete', () => {
    let t = ruoliVisti(telefonoCon(['veggente', 'lupo', 'villico', 'villico', 'villico']))
    t = sceltaDellaNotte(apri(t), 'p0', { tipo: 'indica', bersaglio: 'p1' }, ADESSO)
    expect(chiHaIlTelefono(t)).toBe('p0')
    expect(t.giro!.fatto).toBe(true)
    expect(vistaPer(t.partita, 'p0').segreti.at(-1)).toMatchObject({ tipo: 'sguardo', bersaglio: 'p1', malvagio: true })
    t = passa(t, ADESSO)
    // Il lupo, la prima notte, legge il branco e passa.
    expect(vistaPer(t.partita, 'p1').richiesta.tipo).toBe('notizia')
    t = sceltaDellaNotte(apri(t), 'p1', { tipo: 'letto' }, ADESSO)
    expect(chiHaIlTelefono(t)).toBe('p2')
    expect(t.giro!.fatto).toBe(false)
  })

  it('con il Baron Samedi in gioco il telefono passa anche ai fantasmi', () => {
    const regole = { primaNotteSenzaVittime: false }
    let t = ruoliVisti(telefonoCon(['lupo', 'baron', 'villico', 'villico', 'villico', 'villico', 'villico'], regole))
    t = giraLaNotte(t, { p0: 'p2' }).stato
    expect(t.partita.fase).toBe('alba')
    t = agisci(t, { tipo: 'avanti' }, ADESSO)
    t = agisci(t, { tipo: 'avanti' }, ADESSO)
    expect(t.partita.fase).toBe('nomine')
    for (const id of t.partita.ordineDiVoto) {
      t = agisci(t, { tipo: 'voto', giocatore: id, bersaglio: id === 'p6' ? 'p5' : 'p6' }, ADESSO)
    }
    t = agisci(t, { tipo: 'avanti' }, ADESSO)
    expect(t.partita.fase).toBe('ballottaggio')
    while (giroInCorso(t)) {
      const chi = chiHaIlTelefono(t)!
      const r = vistaPer(t.partita, chi).richiesta
      const bersaglio = r.tipo === 'vota' && r.bersagli.includes('p6') ? 'p6' : null
      t = agisciEPassa(apri(t), { tipo: 'voto', giocatore: chi, bersaglio }, ADESSO)
    }
    // Prima della seconda notte il tavolo vede com'e' andato il giorno; poi il telefono gira.
    expect(t.partita.fase).toBe('notte')
    expect(giroInCorso(t)).toBeNull()
    t = annunciaLaNotte(t, ADESSO)
    expect(giroInCorso(t)?.elenco).toEqual(['p0', 'p1', 'p3', 'p4', 'p5', 'p2', 'p6'])
  })

  it('il ballottaggio comincia a sinistra di chi ha il Benvenuto, e lo vota solo chi può', () => {
    const regole = { primaNotteSenzaVittime: false }
    let t = ruoliVisti(telefonoCon(['lupo', 'villico', 'villico', 'villico', 'villico', 'villico'], regole))
    t = giraLaNotte(t, { p0: 'p2' }).stato
    expect(t.partita.benvenuto).toBe('p2')
    t = agisci(agisci(t, { tipo: 'avanti' }, ADESSO), { tipo: 'avanti' }, ADESSO)
    for (const id of t.partita.ordineDiVoto) {
      t = agisci(t, { tipo: 'voto', giocatore: id, bersaglio: id === 'p5' ? 'p4' : 'p5' }, ADESSO)
    }
    t = agisci(t, { tipo: 'avanti' }, ADESSO)
    // Gli indiziati p5 e p4 non votano, lo sbranato p2 nemmeno: si parte da p3.
    expect(giroInCorso(t)?.elenco).toEqual(['p3', 'p0', 'p1'])
  })

  it('chi ha il teschio lo passa e poi resta sul telefono per il suo compito', () => {
    const ruoli: IdPersonaggio[] = ['amleto', 'veggente', 'lupo', 'villico', 'villico', 'villico', 'villico']
    let t = ruoliVisti(telefonoCon(ruoli))
    t = giraLaNotte(t, { p0: 'p1', p1: 'p3', p2: 'letto' }).stato
    expect(t.partita.teschio).toBe('p1')
    t = agisci(agisci(t, { tipo: 'avanti' }, ADESSO), { tipo: 'avanti' }, ADESSO)
    for (const id of t.partita.ordineDiVoto) {
      t = agisci(t, { tipo: 'voto', giocatore: id, bersaglio: id === 'p6' ? 'p5' : 'p6' }, ADESSO)
    }
    t = agisci(t, { tipo: 'avanti' }, ADESSO)
    while (giroInCorso(t)?.perche === 'voto') {
      const chi = chiHaIlTelefono(t)!
      t = agisciEPassa(apri(t), { tipo: 'voto', giocatore: chi, bersaglio: chi === 'p6' ? null : 'p6' }, ADESSO)
    }
    // Con Amleto in gioco il linciato riceve il Benvenuto, da solo, prima della notte.
    expect(giroInCorso(t)).toMatchObject({ perche: 'notizia', elenco: ['p6'] })
    t = agisciEPassa(apri(t), { tipo: 'benvenuto', giocatore: 'p6' }, ADESSO)
    t = annunciaLaNotte(t, ADESSO)
    t = passa(apri(t), ADESSO)
    expect(chiHaIlTelefono(t)).toBe('p1')
    t = sceltaDellaNotte(apri(t), 'p1', { tipo: 'indica', bersaglio: 'p3' }, ADESSO)
    // Il teschio e' passato: resta il compito del Veggente, sulla stessa schermata.
    expect(chiHaIlTelefono(t)).toBe('p1')
    expect(t.giro!.aperto).toBe(true)
    expect(vistaPer(t.partita, 'p1').richiesta).toMatchObject({ tipo: 'indica', compito: 'scrutare' })
  })

  it('se il telefono è passato a tutti e la fase aspetta ancora, la chiude il telefono', () => {
    let t = ruoliVisti(telefonoCon(['lupo', 'veggente', 'villico', 'villico', 'villico']))
    // Nessuno sceglie niente: dopo l'ultimo la notte si chiude con quel che c'e'.
    while (giroInCorso(t)) t = passa(apri(t), ADESSO)
    expect(t.partita.fase).toBe('alba')
    expect(t.partita.alba?.nessunaVittima).toBe(true)
  })

  it('la discussione finita da sola porta alle nomine, dal momento in cui è finita', () => {
    let t = ruoliVisti(telefonoCon(['lupo', 'veggente', 'villico', 'villico', 'villico']))
    t = giraLaNotte(t, { p0: 'letto', p1: 'p2' }).stato
    t = agisci(t, { tipo: 'avanti' }, ADESSO)
    expect(t.partita.fase).toBe('discussione')
    const fine = t.partita.fineFase!
    expect(tempoPassato(t, fine - 1).partita.fase).toBe('discussione')
    const dopo = tempoPassato(t, fine + 5_000)
    expect(dopo.partita.fase).toBe('nomine')
    expect(dopo.partita.inizioFase).toBe(fine)
  })

  it('una partita nuova ha i nomi scritti, nell’ordine, e si prepara solo con nomi diversi', () => {
    const prep = { ...PREPARAZIONE_INIZIALE, nomi: ['Anna', ' ', 'Bruno', 'Carla', 'Dario', 'Elena'] }
    expect(problemaDellaPreparazione(prep)).toBeNull()
    const t = comincia(prep, 7, ADESSO)
    expect(t.partita.giocatori.map((g) => g.nome)).toEqual(['Anna', 'Bruno', 'Carla', 'Dario', 'Elena'])
    expect(giroInCorso(t)?.perche).toBe('ruolo')
    expect(problemaDellaPreparazione({ ...prep, nomi: ['Anna', 'Bruno', 'anna', 'Carla'] })).toMatch(/si chiamano/)
    expect(problemaDellaPreparazione({ ...prep, nomi: ['Anna', 'Bruno', 'Carla'] })).toMatch(/almeno 4/)
    expect(problemaDellaPreparazione({ ...prep, composizione: { lupo: 2, villico: 2 } })).toMatch(/Mancano|troppo/)
  })

  it('riaperta, la partita riprende da chi ha il telefono, ma la schermata privata non si apre da sola', () => {
    const memoria = new Map<string, string>()
    const finto = {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
      removeItem: (k: string) => void memoria.delete(k),
    }
    const prima = (globalThis as { localStorage?: unknown }).localStorage
    ;(globalThis as { localStorage?: unknown }).localStorage = finto
    try {
      let t = telefonoCon(['lupo', 'veggente', 'villico', 'villico', 'villico'])
      t = apri(passa(apri(t), ADESSO))
      salvaTelefono(t)
      const ripresa = leggiTelefono()!
      expect(chiHaIlTelefono(ripresa)).toBe('p1')
      expect(ripresa.giro!.aperto).toBe(false)
      salvaTelefono(null)
      expect(leggiTelefono()).toBeNull()
    } finally {
      ;(globalThis as { localStorage?: unknown }).localStorage = prima
    }
  })
})
