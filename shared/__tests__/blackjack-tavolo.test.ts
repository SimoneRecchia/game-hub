import { describe, expect, it } from 'vitest'
import type { Carta } from '../blackjack'
import {
  ASSENTE_MS,
  BozzaBJ,
  CARTA_MS,
  PUNTATE_MS,
  RegolaBJ,
  TURNO_MS,
  durataDistribuzione,
  durataFine,
  mosseDi,
  tavoloNuovo,
  type ContestoBJ,
  type MovimentoBJ,
  type TavoloBJ,
} from '../blackjack-tavolo'

/**
 * Un tavolo di prova: il mazzo lo decide la prova, l'orologio pure, e chi ha la
 * pagina aperta si dice a mano. Ogni passo lavora su una bozza nuova, come il
 * server a ogni richiesta, e tiene i movimenti di tutti i passi.
 */
function prova() {
  const mazzo: Carta[] = []
  const presenti = new Set<string>()
  let adesso = 1_000_000
  let t: TavoloBJ = tavoloNuovo()
  const movimenti: MovimentoBJ[] = []
  /** Chi e' andato altrove nell'app, e quando. */
  const altrove = new Map<string, number>()
  const contesto = (): ContestoBJ => ({
    adesso,
    pesca: () => {
      const c = mazzo.shift()
      if (!c) throw new Error('mazzo finito')
      return c
    },
    presente: (id) => presenti.has(id),
    altrove: (id, visto) => (altrove.get(id) ?? 0) > visto,
  })
  /** Un passo: le scadenze, il cambio, di nuovo le scadenze. Un errore delle regole non cambia niente. */
  const passo = (cambia?: (b: BozzaBJ) => void) => {
    const b = new BozzaBJ(t, contesto())
    b.avanza()
    cambia?.(b)
    b.avanza()
    t = b.t
    movimenti.push(...b.movimenti)
    return b
  }
  return {
    get t() {
      return t
    },
    movimenti,
    presenti,
    altrove,
    carte: (...c: Carta[]) => mazzo.push(...c),
    rimaste: () => mazzo.length,
    avanti: (ms: number) => {
      adesso += ms
    },
    get adesso() {
      return adesso
    },
    passo,
    siedi: (id: string) => passo((b) => b.siedi(id)),
    alzati: (id: string) => passo((b) => b.alzati(id)),
    punta: (id: string, puntata: number, saldo = 1000) => passo((b) => b.punta(id, t.giro, puntata, saldo, 7)),
    muovi: (id: string, azione: string, saldo = 1000) =>
      passo((b) => {
        const turno = t.turno!
        b.muovi(id, t.giro, turno.mano, t.posti[turno.posto]!.mani[turno.mano].carte.length, azione, saldo)
      }),
  }
}

const errore = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    if (e instanceof RegolaBJ) return e.codice
    throw e
  }
  return null
}

describe('il tavolo da soli', () => {
  it('ci si siede al centro, si punta e le carte arrivano subito', () => {
    const p = prova()
    p.siedi('anna')
    expect(p.t.posti.map((x) => x?.id ?? null)).toEqual([null, null, 'anna', null, null])
    p.carte('9c', '5q', '7f')
    p.punta('anna', 50)
    expect(p.t.fase).toBe('gioco')
    // Prima la carta di chi gioca, poi quella del banco, poi la seconda.
    expect(p.t.posti[2]!.mani).toEqual([{ id: 0, carte: ['9c', '7f'], puntata: 50 }])
    expect(p.t.banco).toEqual(['5q'])
    expect(p.t.turno).toEqual({ posto: 2, mano: 0 })
    expect(mosseDi(p.t, 2)).toEqual(['carta', 'stai', 'raddoppia'])
    expect(p.movimenti).toContainEqual({ tipo: 'punta', id: 'anna', giro: 1, giorno: 7, puntata: 50 })
  })

  it('da soli si pensa quanto si vuole', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('9c', '5q', '7f')
    p.punta('anna', 50)
    p.avanti(10 * 60_000)
    p.passo()
    expect(p.t.turno).toEqual({ posto: 2, mano: 0 })
    expect(p.t.posti[2]!.mani[0].ferma).toBeUndefined()
  })

  it('il banco pesca fino a 17, si paga, e dopo la fine si riparte con lo stesso posto', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('9c', '6q', '7f')
    p.punta('anna', 50)
    p.carte('Tc', '8p')
    p.muovi('anna', 'stai')
    // Il banco: 6, poi 10 e 8 fanno 24, sballato.
    expect(p.t.banco).toEqual(['6q', 'Tc', '8p'])
    expect(p.t.fase).toBe('fine')
    expect(p.t.posti[2]!.delta).toBe(50)
    // Le carte del banco restano in vista quanto serve a girarle, dopo l'ultima mossa.
    expect(p.t.scadenza).toBe(p.adesso + CARTA_MS + durataFine(p.t.banco))
    expect(p.movimenti.at(-1)).toMatchObject({ tipo: 'chiude', id: 'anna', giro: 1, delta: 50 })
    p.avanti(CARTA_MS + durataFine(p.t.banco) - 1)
    p.passo()
    expect(p.t.fase).toBe('fine')
    p.avanti(1)
    p.passo()
    expect(p.t).toMatchObject({ giro: 2, fase: 'puntate', banco: [], turno: null, scadenza: null })
    expect(p.t.posti[2]).toMatchObject({ id: 'anna', puntata: 0, mani: [], delta: null })
  })

  it('prima della fine non si punta il giro dopo', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('Tc', '6q', '7f', 'Kp')
    p.punta('anna', 20)
    p.muovi('anna', 'carta')
    expect(p.t.fase).toBe('fine')
    expect(errore(() => p.punta('anna', 20))).toBe('NON_ORA')
  })

  it('chi sballa perde, e il banco non pesca se non resta nessuno in piedi', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('Tc', '6q', '7f', 'Kp')
    p.punta('anna', 20)
    p.muovi('anna', 'carta')
    expect(p.t.banco).toEqual(['6q'])
    expect(p.t.posti[2]!.delta).toBe(-20)
    expect(p.rimaste()).toBe(0)
  })

  it('con un blackjack il banco pesca una carta sola: per vedere se ce l’ha anche lui', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('Ac', 'Tq', 'Kf', '9p')
    p.punta('anna', 30)
    expect(p.t.fase).toBe('fine')
    expect(p.t.banco).toEqual(['Tq', '9p'])
    // Il blackjack paga alla pari.
    expect(p.t.posti[2]!.delta).toBe(30)
  })

  it('il blackjack del banco si prende anche il raddoppio', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('5c', 'Aq', '6f')
    p.punta('anna', 30)
    p.carte('9p', 'Kc')
    p.muovi('anna', 'raddoppia')
    expect(p.t.banco).toEqual(['Aq', 'Kc'])
    expect(p.t.posti[2]!.delta).toBe(-60)
    expect(p.movimenti).toContainEqual({ tipo: 'aggiunge', id: 'anna', giro: 1, giorno: 7, quanto: 30 })
  })

  it('dividere fa due mani, che si giocano una dopo l’altra', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('8c', '6q', '8f')
    p.punta('anna', 10)
    p.carte('3p', 'Kf')
    p.muovi('anna', 'dividi')
    expect(p.t.posti[2]!.mani.map((m) => m.carte)).toEqual([
      ['8c', '3p'],
      ['8f', 'Kf'],
    ])
    expect(p.t.posti[2]!.puntata).toBe(20)
    expect(p.t.posti[2]!.mani.map((m) => m.id)).toEqual([0, 1])
    expect(p.t.turno).toEqual({ posto: 2, mano: 0 })
    p.carte('9c')
    p.muovi('anna', 'raddoppia')
    expect(p.t.turno).toEqual({ posto: 2, mano: 1 })
    p.carte('Tq', '2c')
    p.muovi('anna', 'stai')
    // Il banco: 6, 10, 2 = 18. La prima mano fa 20 e vince il doppio, la seconda 18 e pareggia.
    expect(p.t.banco).toEqual(['6q', 'Tq', '2c'])
    expect(p.t.posti[2]!.delta).toBe(20)
  })

  it('gli assi divisi prendono una carta ciascuno, e il banco gioca subito', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('Ac', '6q', 'Af')
    p.punta('anna', 10)
    expect(mosseDi(p.t, 2)).toEqual(['carta', 'stai', 'raddoppia', 'dividi'])
    p.carte('Kp', 'Ac', 'Tq', '8c')
    p.muovi('anna', 'dividi')
    // Asso e re fanno 21 e non blackjack; il secondo asso ne prende un altro, e non si divide ancora.
    expect(p.t.posti[2]!.mani).toMatchObject([
      { carte: ['Ac', 'Kp'], assi: true, ferma: true },
      { carte: ['Af', 'Ac'], assi: true, ferma: true },
    ])
    // Il banco: 6, 10, 8 = 24, sballato. Le due mani vincono alla pari.
    expect(p.t.fase).toBe('fine')
    expect(p.t.banco).toEqual(['6q', 'Tq', '8c'])
    expect(p.t.posti[2]!.delta).toBe(20)
  })

  it('lo split si rifa’ fino a quattro mani, che si giocano una alla volta, anche raddoppiando', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('8c', '6q', '8f')
    p.punta('anna', 10)
    p.carte('8p', '2c')
    p.muovi('anna', 'dividi')
    p.carte('8q', '3c')
    p.muovi('anna', 'dividi')
    p.carte('8c', 'Tf')
    p.muovi('anna', 'dividi')
    const mani = p.t.posti[2]!.mani
    expect(mani.map((m) => m.carte)).toEqual([
      ['8c', '8c'],
      ['8q', 'Tf'],
      ['8p', '3c'],
      ['8f', '2c'],
    ])
    // I nomi delle mani restano quelli: le carte gia' viste non si rimescolano.
    expect(mani.map((m) => m.id)).toEqual([0, 3, 2, 1])
    // Con quattro mani non si divide piu', nemmeno una coppia.
    expect(mosseDi(p.t, 2)).toEqual(['carta', 'stai', 'raddoppia'])
    p.carte('5p')
    p.muovi('anna', 'raddoppia')
    expect(p.t.turno).toEqual({ posto: 2, mano: 1 })
    p.muovi('anna', 'stai')
    expect(p.t.turno).toEqual({ posto: 2, mano: 2 })
    p.carte('Kc')
    p.muovi('anna', 'raddoppia')
    p.carte('9c')
    p.muovi('anna', 'carta')
    expect(p.t.turno).toEqual({ posto: 2, mano: 3 })
    p.carte('Tq', '3p')
    p.muovi('anna', 'stai')
    // Il banco fa 19: 21 raddoppiato, 18, 21 raddoppiato e 19 fanno +20, −10, +20 e pari.
    expect(p.t.banco).toEqual(['6q', 'Tq', '3p'])
    expect(p.t.posti[2]!.puntata).toBe(60)
    expect(p.t.posti[2]!.delta).toBe(30)
    // Tre split e due raddoppi: cinque volte la puntata in piu'.
    expect(p.movimenti.flatMap((m) => (m.tipo === 'aggiunge' ? [m.quanto] : []))).toEqual([10, 10, 10, 10, 10])
  })

  it('raddoppiare e dividere chiedono il saldo per un’altra puntata', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('8c', '6q', '8f')
    p.punta('anna', 50, 60)
    expect(errore(() => p.muovi('anna', 'raddoppia', 10))).toBe('POCHI_PUNTI')
    expect(errore(() => p.muovi('anna', 'dividi', 10))).toBe('POCHI_PUNTI')
    expect(p.t.posti[2]!.mani).toHaveLength(1)
  })

  it('un doppio tocco non chiede due carte, e non punta sul giro dopo', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('2c', '6q', '3f')
    p.punta('anna', 10)
    const vecchia = { giro: p.t.giro, mano: 0, carte: 2 }
    p.carte('4p')
    p.muovi('anna', 'carta')
    const doppio = () =>
      p.passo((b) => b.muovi('anna', vecchia.giro, vecchia.mano, vecchia.carte, 'carta', 1000))
    expect(errore(doppio)).toBe('MOSSA_VECCHIA')
    expect(errore(() => p.passo((b) => b.punta('anna', 99, 10, 1000, 7)))).toBe('NON_ORA')
  })

  it('si punta da dieci al saldo', () => {
    const p = prova()
    p.siedi('anna')
    expect(errore(() => p.punta('anna', 5))).toBe('PUNTATA')
    expect(errore(() => p.punta('anna', 61, 60))).toBe('PUNTATA')
    expect(errore(() => p.punta('anna', 9, 9))).toBe('POCHI_PUNTI')
    expect(errore(() => p.passo((b) => b.punta('anna', 1, 12.5, 100, 7)))).toBe('PUNTATA')
    expect(errore(() => p.passo((b) => b.punta('bruno', 1, 10, 100, 7)))).toBe('NON_SEDUTO')
  })
})

describe('l’assicurazione al tavolo', () => {
  /** Anna da sola, con 50 sul tavolo e un asso al banco: `carte` sono la sua prima e la sua seconda. */
  function controLAsso(prima: Carta, seconda: Carta, saldo = 1000) {
    const p = prova()
    p.siedi('anna')
    p.carte(prima, 'Aq', seconda)
    p.punta('anna', 50, saldo)
    return p
  }

  it('si offre al turno, quando il banco mostra un asso, e solo prima di ogni altra mossa', () => {
    const p = controLAsso('9c', '7f')
    expect(p.t.turno).toEqual({ posto: 2, mano: 0 })
    expect(mosseDi(p.t, 2)).toEqual(['carta', 'stai', 'raddoppia', 'assicurazione'])
    p.carte('2p')
    p.muovi('anna', 'carta')
    expect(mosseDi(p.t, 2)).toEqual(['carta', 'stai'])
    expect(errore(() => p.muovi('anna', 'assicurazione'))).toBe('MOSSA')
  })

  it('costa la meta’ della puntata, resta il turno, e paga 2 a 1 se il banco fa blackjack', () => {
    const p = controLAsso('Tc', '9f')
    p.muovi('anna', 'assicurazione')
    expect(p.t.posti[2]).toMatchObject({ puntata: 50, assicurazione: 25 })
    expect(p.movimenti).toContainEqual({ tipo: 'aggiunge', id: 'anna', giro: 1, giorno: 7, quanto: 25 })
    // La mano si gioca ancora, ma l'assicurazione non torna.
    expect(p.t.turno).toEqual({ posto: 2, mano: 0 })
    expect(mosseDi(p.t, 2)).toEqual(['carta', 'stai', 'raddoppia'])
    p.carte('Kp')
    p.muovi('anna', 'stai')
    // Il blackjack del banco si prende i 50 della mano, l'assicurazione ne paga 50: pari.
    expect(p.t.banco).toEqual(['Aq', 'Kp'])
    expect(p.t.posti[2]!.delta).toBe(0)
    expect(p.movimenti.at(-1)).toMatchObject({ tipo: 'chiude', delta: 0, assicurazione: 25 })
  })

  it('si perde se la seconda carta del banco non fa blackjack', () => {
    const p = controLAsso('Tc', '9f')
    p.muovi('anna', 'assicurazione')
    p.carte('6p')
    p.muovi('anna', 'stai')
    // Asso e 6 fanno 17, e il banco sta: 19 vince 50, l'assicurazione ne perde 25.
    expect(p.t.banco).toEqual(['Aq', '6p'])
    expect(p.t.posti[2]!.delta).toBe(25)
    expect(p.movimenti.at(-1)).toMatchObject({ tipo: 'chiude', delta: 25, assicurazione: 25 })
  })

  it('il blackjack contro l’asso aspetta il suo turno, e assicurato sta: mezza puntata o una intera', () => {
    const p = controLAsso('Ac', 'Kf')
    expect(p.t.fase).toBe('gioco')
    expect(mosseDi(p.t, 2)).toEqual(['stai', 'assicurazione'])
    p.carte('Jp')
    p.muovi('anna', 'assicurazione')
    // Il banco pesca una carta sola, e fa blackjack: la mano e' pari, l'assicurazione paga 50.
    expect(p.t.fase).toBe('fine')
    expect(p.t.banco).toEqual(['Aq', 'Jp'])
    expect(p.t.posti[2]!.delta).toBe(50)

    const q = controLAsso('Ac', 'Kf')
    q.carte('7p')
    q.muovi('anna', 'assicurazione')
    expect(q.t.banco).toEqual(['Aq', '7p'])
    expect(q.t.posti[2]!.delta).toBe(25)
  })

  it('il blackjack che non si assicura sta, e paga 1 a 1 se il banco non lo pareggia', () => {
    const p = controLAsso('Ac', 'Kf')
    p.carte('7p')
    p.muovi('anna', 'stai')
    expect(p.t.banco).toEqual(['Aq', '7p'])
    expect(p.t.posti[2]).toMatchObject({ delta: 50 })
    expect(p.t.posti[2]!.assicurazione).toBeUndefined()
  })

  it('un doppio tocco non assicura due volte', () => {
    const p = controLAsso('9c', '7f')
    const vecchia = { giro: p.t.giro, mano: 0, carte: 2 }
    p.muovi('anna', 'assicurazione')
    const doppio = () =>
      p.passo((b) => b.muovi('anna', vecchia.giro, vecchia.mano, vecchia.carte, 'assicurazione', 1000))
    expect(errore(doppio)).toBe('GIA_ASSICURATO')
    expect(p.t.posti[2]!.assicurazione).toBe(25)
    expect(p.movimenti.filter((m) => m.tipo === 'aggiunge')).toHaveLength(1)
  })

  it('chiede il saldo, come il raddoppio', () => {
    const p = controLAsso('9c', '7f', 60)
    expect(errore(() => p.muovi('anna', 'assicurazione', 24))).toBe('POCHI_PUNTI')
    expect(p.t.posti[2]!.assicurazione).toBeUndefined()
    p.muovi('anna', 'assicurazione', 25)
    expect(p.t.posti[2]!.assicurazione).toBe(25)
  })

  it('dopo l’assicurazione si fa split e si raddoppia, e l’assicurazione resta quella', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('8c', 'Aq', '8f')
    p.punta('anna', 20)
    p.muovi('anna', 'assicurazione')
    p.carte('3p', '9c')
    p.muovi('anna', 'dividi')
    expect(mosseDi(p.t, 2)).toEqual(['carta', 'stai', 'raddoppia'])
    p.carte('Kp')
    p.muovi('anna', 'raddoppia')
    p.carte('Tq')
    p.muovi('anna', 'stai')
    // Il banco fa blackjack: le mani perdono 40 e 20, l'assicurazione paga 20.
    expect(p.t.banco).toEqual(['Aq', 'Tq'])
    expect(p.t.posti[2]).toMatchObject({ puntata: 60, assicurazione: 10, delta: -40 })
  })

  it('se tutte le mani sballano il banco pesca lo stesso la seconda carta, per l’assicurazione', () => {
    const p = controLAsso('Tc', '6f')
    p.muovi('anna', 'assicurazione')
    p.carte('Kp', 'Jc')
    p.muovi('anna', 'carta')
    expect(p.t.banco).toEqual(['Aq', 'Jc'])
    // Sballato: −50; l'assicurazione: +50.
    expect(p.t.posti[2]!.delta).toBe(0)
    expect(p.rimaste()).toBe(0)
    // Il giro dopo comincia senza.
    p.avanti(p.t.scadenza! - p.adesso)
    p.passo()
    expect(p.t.fase).toBe('puntate')
    expect(p.t.posti[2]).not.toHaveProperty('assicurazione')
  })
})

describe('il tavolo in compagnia', () => {
  /** Anna e Bruno seduti, con la pagina aperta. */
  function inDue() {
    const p = prova()
    p.presenti.add('anna').add('bruno')
    p.siedi('anna')
    p.siedi('bruno')
    return p
  }

  it('i posti si occupano dal centro, e piu’ di cinque non ci stanno', () => {
    const p = prova()
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      p.presenti.add(id)
      p.siedi(id)
    }
    expect(p.t.posti.map((x) => x!.id)).toEqual(['d', 'b', 'a', 'c', 'e'])
    expect(errore(() => p.siedi('f'))).toBe('PIENO')
  })

  it('la prima puntata apre il tempo degli altri, e quando hanno puntato tutti si distribuisce', () => {
    const p = inDue()
    p.punta('anna', 10)
    expect(p.t.fase).toBe('puntate')
    expect(p.t.scadenza).toBe(p.adesso + PUNTATE_MS)
    p.avanti(3_000)
    // Una carta a testa da sinistra — Bruno sta a sinistra di Anna — poi il banco, poi la seconda.
    p.carte('2c', '3c', '4c', '5c', '6c')
    p.punta('bruno', 20)
    expect(p.t.fase).toBe('gioco')
    expect(p.t.posti[1]!.mani[0].carte).toEqual(['2c', '5c'])
    expect(p.t.posti[2]!.mani[0].carte).toEqual(['3c', '6c'])
    expect(p.t.banco).toEqual(['4c'])
    expect(p.t.turno).toEqual({ posto: 1, mano: 0 })
    expect(p.t.scadenza).toBe(p.adesso + durataDistribuzione(2) + TURNO_MS)
  })

  it('chi non punta in tempo guarda il giro', () => {
    const p = inDue()
    p.punta('anna', 10)
    p.avanti(PUNTATE_MS + 1)
    p.carte('9c', '5q', '7f')
    p.passo()
    expect(p.t.fase).toBe('gioco')
    expect(p.t.posti[1]).toMatchObject({ id: 'bruno', puntata: 0, mani: [] })
    expect(p.t.turno).toEqual({ posto: 2, mano: 0 })
  })

  it('con qualcuno che aspetta il turno scade e la mano sta; il turno dopo parte da quella scadenza', () => {
    const p = inDue()
    p.punta('anna', 10)
    p.carte('9c', 'Tc', '6q', '7f', '8f')
    p.punta('bruno', 10)
    const primo = p.t.scadenza!
    // Nessuno guarda per un po': il turno di Bruno scade, e anche quello di Anna, che parte dalla scadenza di Bruno.
    p.avanti(primo - p.adesso + TURNO_MS + 1)
    p.carte('Tp', '2p')
    p.passo()
    expect(p.t.posti[1]!.mani[0]).toMatchObject({ carte: ['9c', '7f'], ferma: true })
    expect(p.t.posti[2]!.mani[0]).toMatchObject({ carte: ['Tc', '8f'], ferma: true })
    // Il banco: 6, 10, 2 = 18. Bruno ha 16 e perde, Anna 18 e pareggia.
    expect(p.t.fase).toBe('fine')
    expect(p.t.scadenza).toBe(primo + TURNO_MS + durataFine(p.t.banco))
    expect([p.t.posti[1]!.delta, p.t.posti[2]!.delta]).toEqual([-10, 0])
  })

  it('l’assicurazione si offre a ognuno al suo turno, e chi non decide in tempo sta senza', () => {
    const p = inDue()
    p.punta('anna', 10)
    p.carte('9c', 'Tc', 'Aq', '7f', '8f')
    p.punta('bruno', 10)
    expect(mosseDi(p.t, 1)).toEqual(['carta', 'stai', 'raddoppia', 'assicurazione'])
    expect(mosseDi(p.t, 2)).toEqual([])
    p.muovi('bruno', 'assicurazione')
    p.muovi('bruno', 'stai')
    expect(mosseDi(p.t, 2)).toEqual(['carta', 'stai', 'raddoppia', 'assicurazione'])
    // Anna non decide in tempo: la sua mano sta, senza assicurazione.
    p.avanti(p.t.scadenza! - p.adesso + 1)
    p.carte('Kp')
    p.passo()
    expect(p.t.fase).toBe('fine')
    expect(p.t.posti[2]!.assicurazione).toBeUndefined()
    // Il blackjack del banco: Bruno perde 10 e l'assicurazione gliene rende 10, Anna perde 10.
    expect([p.t.posti[1]!.delta, p.t.posti[2]!.delta]).toEqual([0, -10])
  })

  it('chi si siede mentre un altro pensa da solo gli lascia il tempo di un turno intero', () => {
    const p = prova()
    p.presenti.add('anna').add('bruno')
    p.siedi('anna')
    p.carte('9c', '5q', '7f')
    p.punta('anna', 50)
    p.avanti(10 * 60_000)
    p.siedi('bruno')
    expect(p.t.scadenza).toBe(p.adesso + TURNO_MS)
    expect(p.t.turno).toEqual({ posto: 2, mano: 0 })
    // Bruno guarda: e' arrivato a giro in corso.
    expect(p.t.posti[1]).toMatchObject({ id: 'bruno', puntata: 0 })
  })

  it('alzarsi durante le puntate restituisce la puntata', () => {
    const p = inDue()
    p.punta('anna', 40)
    p.alzati('anna')
    expect(p.t.posti[2]).toBeNull()
    expect(p.movimenti).toContainEqual({ tipo: 'rimborsa', id: 'anna', giro: 1, giorno: 7 })
    expect(p.movimenti).toContainEqual({ tipo: 'alza', id: 'anna' })
    expect(p.t.scadenza).toBeNull()
  })

  it('alzarsi a giro in corso lascia le mani, che stanno e si pagano; il posto si libera alla fine', () => {
    const p = inDue()
    p.punta('anna', 10)
    p.carte('9c', 'Tc', '6q', '7f', '9f')
    p.punta('bruno', 10)
    // Tocca a Bruno, che se ne va: la sua mano sta subito, e tocca ad Anna.
    p.alzati('bruno')
    expect(p.t.posti[1]).toMatchObject({ id: 'bruno', via: true })
    expect(p.t.posti[1]!.mani[0].ferma).toBe(true)
    expect(p.t.turno).toEqual({ posto: 2, mano: 0 })
    expect(p.movimenti.filter((m) => m.tipo === 'alza')).toEqual([{ tipo: 'alza', id: 'bruno' }])
    p.carte('Tp', '3p')
    p.muovi('anna', 'stai')
    // Il banco: 6, 10, 3 = 19. Bruno ha 16 e perde, Anna 19 e pareggia.
    expect([p.t.posti[1]!.delta, p.t.posti[2]!.delta]).toEqual([-10, 0])
    p.avanti(p.t.scadenza! - p.adesso)
    p.passo()
    expect(p.t.posti[1]).toBeNull()
    expect(p.movimenti.filter((m) => m.tipo === 'alza')).toHaveLength(1)
  })

  it('chi non c’e’ piu’ e non ha puntato lascia il posto, e non lo si aspetta', () => {
    const p = inDue()
    p.presenti.delete('bruno')
    p.avanti(ASSENTE_MS)
    p.carte('9c', '5q', '7f')
    p.punta('anna', 10)
    expect(p.t.posti[1]).toBeNull()
    expect(p.t.fase).toBe('gioco')
    expect(p.movimenti).toContainEqual({ tipo: 'alza', id: 'bruno' })
  })

  it('chi va in un’altra schermata dopo l’ultima mossa non si aspetta, anche se e’ ancora online', () => {
    const p = inDue()
    p.avanti(1_000)
    p.presenti.delete('bruno')
    p.altrove.set('bruno', p.adesso)
    p.carte('9c', '5q', '7f')
    p.punta('anna', 10)
    expect(p.t.posti[1]).toBeNull()
    expect(p.t.fase).toBe('gioco')
  })

  it('una presenza altrove di prima dell’ultima mossa non conta: chi si siede arriva da un’altra schermata', () => {
    const p = prova()
    p.presenti.add('anna')
    p.altrove.set('bruno', p.adesso - 1)
    p.siedi('anna')
    p.siedi('bruno')
    p.punta('anna', 10)
    expect(p.t.posti[1]).toMatchObject({ id: 'bruno' })
    expect(p.t.fase).toBe('puntate')
  })

  it('l’ultimo che se ne va a giro in corso chiude il giro: il tavolo resta vuoto', () => {
    const p = prova()
    p.siedi('anna')
    p.carte('9c', '5q', '7f')
    p.punta('anna', 10)
    // Il banco: 5, 10, 8 = 23, sballato.
    p.carte('Tp', '8p')
    const b = p.alzati('anna')
    expect(p.t.fase).toBe('fine')
    expect(p.t.posti[2]!.delta).toBe(10)
    expect(b.vuoto()).toBe(true)
  })
})
