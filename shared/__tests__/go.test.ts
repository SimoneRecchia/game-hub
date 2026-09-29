import { describe, expect, it } from 'vitest'
import {
  KOMI,
  LATI,
  PASSO,
  catturate,
  chiaveRipetizione,
  esito,
  gioca,
  gruppo,
  legale,
  leggi,
  liberta,
  mossaDaTesto,
  mosseLegali,
  nomePunto,
  posizioneIniziale,
  punteggio,
  puntoDa,
  scrivi,
  testoMossa,
  type Colore,
  type Mossa,
  type Posizione,
} from '../go'

/**
 * Una posizione da un disegno: le righe dall'alto, X il Nero, O il Bianco, un
 * punto per il vuoto (gli spazi non contano). Passa da `leggi`, quindi un
 * disegno impossibile fa fallire il test subito.
 */
function disegno(righe: string[], tratto: Colore = 'nero'): Posizione {
  const punti = righe
    .map((r) => r.replace(/\s+/g, ''))
    .join('')
    .replace(/X/g, 'x')
    .replace(/O/g, 'o')
  const testo = `${righe.length}:${tratto === 'nero' ? 'n' : 'b'}:${punti}:k-:p0:c0,0`
  const p = leggi(testo)
  if (!p) throw new Error(`Disegno non valido: ${testo}`)
  return p
}

const pietra = (p: Posizione, nome: string): Mossa => ({ tipo: 'pietra', punto: puntoDa(nome, p.lato)! })

/** La posizione dopo le mosse, scritte come nel go ('D4', 'passo'), a turno. */
function dopo(p: Posizione, ...mosse: string[]): Posizione {
  for (const t of mosse) {
    const m = mossaDaTesto(p, t)
    if (!m) throw new Error(`Mossa ${t} non legale`)
    p = gioca(p, m)
  }
  return p
}

const k = (p: Posizione, nome: string) => puntoDa(nome, p.lato)!

/**
 * Un seki sul 9x9: in basso a sinistra il gruppo nero C2-D2-E2-D1 e quello
 * bianco da B1 a F1 non hanno occhi, e le loro sole libertà sono C1 ed E1, in
 * comune. Chi ci gioca per primo si mette in atari: non ci gioca nessuno, e
 * vivono tutti e due. Fuori, il Nero ha l'angolo in basso a destra e il
 * Bianco la parte alta.
 */
function seki(): Posizione {
  return disegno([
    '. . . . . . . . .',
    '. . . . . . . . .',
    '. . . . . . . . .',
    'O O O O O O O O O',
    'X X X X X X X X X',
    'X X X X X X X . .',
    'X O O O O O X . .',
    'X O X X X O X . .',
    'X O . X . O X . .',
  ])
}

describe('la posizione', () => {
  it('comincia vuota sui tre goban, con il Nero al tratto', () => {
    expect(LATI).toEqual([9, 13, 19])
    for (const lato of LATI) {
      const p = posizioneIniziale(lato)
      expect(p.punti).toHaveLength(lato * lato)
      expect(p.punti.every((x) => x === null)).toBe(true)
      expect(p.tratto).toBe('nero')
      expect(p.ko).toBeNull()
      expect(p.passi).toBe(0)
      expect(p.prigionieri).toEqual({ nero: 0, bianco: 0 })
      expect(scrivi(p)).toBe(`${lato}:n:${'.'.repeat(lato * lato)}:k-:p0:c0,0`)
      expect(mosseLegali(p)).toHaveLength(lato * lato + 1)
    }
    expect(() => posizioneIniziale(4)).toThrow()
    expect(() => posizioneIniziale(20)).toThrow()
    expect(() => posizioneIniziale(9.5)).toThrow()
  })

  it('il testo va e torna, anche con il ko, i passi e i prigionieri', () => {
    // Un ko nell'angolo in alto a sinistra: il Nero prende in B8 e il Bianco non puo' riprendere subito.
    const p = disegno([
      '. X O . . . . . .',
      'X O . O . . . . .',
      '. X O . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
    ])
    const ko = dopo(p, 'C8')
    expect(ko.ko).toBe(k(ko, 'B8'))
    expect(ko.prigionieri).toEqual({ nero: 1, bianco: 0 })
    const passata = dopo(ko, 'passo')
    for (const q of [p, ko, passata, dopo(passata, 'J1'), posizioneIniziale(19), posizioneIniziale(13)]) {
      const t = scrivi(q)
      expect(leggi(t)).toEqual(q)
      expect(scrivi(leggi(t)!)).toBe(t)
    }
    expect(scrivi(ko)).toMatch(/^9:b:.*:k10:p0:c1,0$/)
    expect(scrivi(passata)).toMatch(/^9:n:.*:k-:p1:c1,0$/)
  })

  it('rifiuta i testi che non sono una posizione', () => {
    const vuoto9 = '.'.repeat(81)
    expect(leggi(`9:n:${vuoto9}:k-:p0:c0,0`)).not.toBeNull()
    const rifiutati = [
      '',
      'ciao',
      `4:n:${'.'.repeat(16)}:k-:p0:c0,0`,
      `20:n:${'.'.repeat(400)}:k-:p0:c0,0`,
      `09:n:${vuoto9}:k-:p0:c0,0`,
      `9:n:${'.'.repeat(80)}:k-:p0:c0,0`,
      `9:n:${'.'.repeat(82)}:k-:p0:c0,0`,
      `9:n:${'X' + '.'.repeat(80)}:k-:p0:c0,0`,
      `9:n:${'z' + '.'.repeat(80)}:k-:p0:c0,0`,
      `9:x:${vuoto9}:k-:p0:c0,0`,
      `9:n:${vuoto9}:k-:p3:c0,0`,
      `9:n:${vuoto9}:k-:p0:c-1,0`,
      `9:n:${vuoto9}:k-:p0:c01,0`,
      `9:n:${vuoto9}:k-:p0`,
      `9:n:${vuoto9}:k-:p0:c0,0:altro`,
      // Un ko su un goban vuoto, o fuori dal goban.
      `9:n:${vuoto9}:k12:p0:c0,0`,
      `9:n:${vuoto9}:k81:p0:c0,0`,
      // Una pietra nell'angolo senza libertà.
      `9:n:${'xo' + '.'.repeat(7) + 'o' + '.'.repeat(71)}:k-:p0:c0,0`,
    ]
    for (const t of rifiutati) expect(leggi(t), t).toBeNull()
    // Il ko di una posizione vera, ma con i passi o il tratto sbagliati.
    const ko = scrivi(
      dopo(
        disegno([
          '. X O . . . . . .',
          'X O . O . . . . .',
          '. X O . . . . . .',
          ...Array(6).fill('. . . . . . . . .'),
        ]),
        'C8',
      ),
    )
    expect(leggi(ko)).not.toBeNull()
    expect(leggi(ko.replace(':p0:', ':p1:'))).toBeNull()
    expect(leggi(ko.replace(':b:', ':n:'))).toBeNull()
    expect(leggi(ko.replace(':k10:', ':k11:'))).toBeNull()
    expect(leggi(123 as unknown as string)).toBeNull()
  })
})

describe('le coordinate', () => {
  it('A1 e’ in basso a sinistra, J9 in alto a destra sul 9x9, e la I non c’e’', () => {
    expect(puntoDa('A1', 9)).toBe(72)
    expect(nomePunto(72, 9)).toBe('A1')
    expect(puntoDa('J9', 9)).toBe(8)
    expect(nomePunto(8, 9)).toBe('J9')
    expect(puntoDa('A9', 9)).toBe(0)
    expect(puntoDa('E5', 9)).toBe(40)
    expect(Array.from({ length: 9 }, (_, c) => nomePunto(c, 9)[0]).join('')).toBe('ABCDEFGHJ')
    expect(puntoDa('I5', 9)).toBeNull()
    expect(puntoDa('K1', 9)).toBeNull()
    expect(puntoDa('A10', 9)).toBeNull()
    expect(puntoDa('A0', 9)).toBeNull()
    expect(puntoDa('A01', 9)).toBeNull()
    expect(puntoDa('d4', 9)).toBe(puntoDa('D4', 9))
    expect(puntoDa('T19', 19)).toBe(18)
    expect(puntoDa('K10', 19)).toBe(9 * 19 + 9)
    expect(nomePunto(19 * 19 - 1, 19)).toBe('T1')
  })

  it('ogni punto va e torna, su ogni lato', () => {
    for (const lato of [5, 9, 13, 19]) {
      for (let punto = 0; punto < lato * lato; punto += 1) expect(puntoDa(nomePunto(punto, lato), lato)).toBe(punto)
    }
  })

  it('le mosse in testo: le coordinate o il passo, anche in minuscolo, e solo se legali', () => {
    const p = posizioneIniziale(9)
    expect(testoMossa(PASSO, 9)).toBe('passo')
    expect(testoMossa({ tipo: 'pietra', punto: 40 }, 9)).toBe('E5')
    expect(mossaDaTesto(p, 'e5')).toEqual({ tipo: 'pietra', punto: 40 })
    expect(mossaDaTesto(p, 'PASSO')).toEqual(PASSO)
    expect(mossaDaTesto(p, 'pass')).toEqual(PASSO)
    expect(mossaDaTesto(p, 'I5')).toBeNull()
    expect(mossaDaTesto(p, 'Z9')).toBeNull()
    expect(mossaDaTesto(p, '')).toBeNull()
    // Un punto occupato non e' una mossa.
    expect(mossaDaTesto(dopo(p, 'E5'), 'E5')).toBeNull()
    // A gioco fermo non si muove piu'.
    expect(mossaDaTesto(dopo(p, 'passo', 'passo'), 'E5')).toBeNull()
    expect(mossaDaTesto(dopo(p, 'passo', 'passo'), 'passo')).toBeNull()
  })
})

describe('le catture', () => {
  it('una pietra sola, in mezzo al goban', () => {
    const p = disegno([
      '. . . . .',
      '. . X . .',
      '. X O X .',
      '. . . . .',
      '. . . . .',
    ])
    expect(liberta(p, k(p, 'C3'))).toBe(1)
    expect(catturate(p, pietra(p, 'C2'))).toEqual([k(p, 'C3')])
    const q = gioca(p, pietra(p, 'C2'))
    expect(q.punti[k(p, 'C3')]).toBeNull()
    expect(q.prigionieri).toEqual({ nero: 1, bianco: 0 })
    expect(q.tratto).toBe('bianco')
    // Una pietra sola presa da una con altre libertà non e' un ko.
    expect(q.ko).toBeNull()
  })

  it('un gruppo intero, sul bordo e nell’angolo', () => {
    // Tre pietre bianche sul bordo in alto, chiuse dal Nero: l'ultima libertà e' D5.
    const bordo = disegno([
      'X O O O .',
      '. X X X .',
      '. . . . .',
      '. . . . .',
      '. . . . .',
    ])
    expect(gruppo(bordo, k(bordo, 'B5'))).toEqual([1, 2, 3])
    expect(liberta(bordo, k(bordo, 'C5'))).toBe(1)
    expect(catturate(bordo, pietra(bordo, 'E5'))).toEqual([1, 2, 3])
    const presa = gioca(bordo, pietra(bordo, 'E5'))
    expect(presa.punti.slice(1, 4)).toEqual([null, null, null])
    expect(presa.prigionieri.nero).toBe(3)
    // Una pietra nell'angolo ha due libertà sole.
    const angolo = disegno([
      'O X . . .',
      '. . . . .',
      '. . . . .',
      '. . . . .',
      '. . . . .',
    ])
    expect(liberta(angolo, 0)).toBe(1)
    expect(catturate(angolo, pietra(angolo, 'A4'))).toEqual([0])
  })

  it('una mossa sola che prende due gruppi', () => {
    // Il punto C3 e' l'ultima libertà di due pietre bianche separate, in C4 e in C2.
    const p = disegno([
      '. . X . .',
      '. X O X .',
      '. X . X .',
      '. X O X .',
      '. . X . .',
    ])
    expect(catturate(p, pietra(p, 'C3'))).toEqual([k(p, 'C4'), k(p, 'C2')])
    const q = gioca(p, pietra(p, 'C3'))
    expect(q.prigionieri.nero).toBe(2)
    expect(q.ko).toBeNull()
  })

  it('una mossa che sembra un suicidio ma prende e’ legale; il suicidio vero no', () => {
    // A5 per il Bianco: non ha libertà, ma lascia senza libertà la pietra nera in B5.
    const p = disegno(
      [
        '. X O . .',
        'X O . . .',
        'O . . . .',
        '. . . . .',
        '. . . . .',
      ],
      'bianco',
    )
    expect(legale(p, pietra(p, 'A5'))).toBe(true)
    expect(catturate(p, pietra(p, 'A5'))).toEqual([k(p, 'B5'), k(p, 'A4')].sort((a, b) => a - b))
    // Il Nero in A5 invece si suiciderebbe: le due pietre intorno sono bianche e hanno altre libertà.
    const suicidio = disegno([
      '. O . . .',
      'O . . . .',
      '. . . . .',
      '. . . . .',
      '. . . . .',
    ])
    expect(legale(suicidio, pietra(suicidio, 'A5'))).toBe(false)
    expect(mosseLegali(suicidio).some((m) => m.tipo === 'pietra' && m.punto === 0)).toBe(false)
    expect(() => gioca(suicidio, pietra(suicidio, 'A5'))).toThrow()
    // Il suicidio di un gruppo: la pietra in C3 toglierebbe l'ultima libertà alle due nere.
    const gruppoSuicida = disegno([
      '. O O . .',
      'O X X O .',
      '. O . O .',
      '. . O . .',
      '. . . . .',
    ])
    expect(legale(gruppoSuicida, pietra(gruppoSuicida, 'C3'))).toBe(false)
    expect(legale(gruppoSuicida, pietra(gruppoSuicida, 'A3'))).toBe(true)
  })
})

describe('il ko', () => {
  // Il Nero prende in C8 la pietra bianca in B8: e' la forma del ko.
  const p = disegno([
    '. X O . . . . . .',
    'X O . O . . . . .',
    '. X O . . . . . .',
    '. . . . . . . . .',
    '. . . . . . . . .',
    '. . . . . . . . .',
    '. . . . . . . . .',
    '. . . . . . . . .',
    '. . . . . . . . .',
  ])

  it('la ripresa subito e’ vietata, dopo una mossa altrove si puo’', () => {
    const ko = dopo(p, 'C8')
    expect(ko.ko).toBe(k(p, 'B8'))
    expect(legale(ko, pietra(ko, 'B8'))).toBe(false)
    expect(mossaDaTesto(ko, 'B8')).toBeNull()
    expect(mosseLegali(ko).some((m) => m.tipo === 'pietra' && m.punto === k(p, 'B8'))).toBe(false)
    // Il Bianco gioca altrove, il Nero risponde altrove: adesso la ripresa e' legale.
    const altrove = dopo(ko, 'J1', 'J2')
    expect(altrove.ko).toBeNull()
    expect(legale(altrove, pietra(altrove, 'B8'))).toBe(true)
    const ripresa = dopo(altrove, 'B8')
    expect(ripresa.punti[k(p, 'C8')]).toBeNull()
    expect(ripresa.ko).toBe(k(p, 'C8'))
    // Anche un passo scioglie il divieto: il Bianco passa, il Nero gioca altrove, e la ripresa si puo'.
    expect(dopo(ko, 'passo').ko).toBeNull()
    const dopoIlPasso = dopo(ko, 'passo', 'J1')
    expect(legale(dopoIlPasso, pietra(dopoIlPasso, 'B8'))).toBe(true)
  })

  it('riprendere piu’ pietre subito non e’ un ko (lo snapback)', () => {
    // Il Bianco (A2, B2) ha due libertà, A1 e B1. Il Nero butta dentro in A1, il Bianco
    // prende in B1 e resta con una libertà sola: A1, dove il Nero riprende tre pietre.
    const s = disegno([
      '. . . . .',
      '. . . . .',
      'X X . . .',
      'O O X . .',
      '. . X . .',
    ])
    const presa = dopo(s, 'A1', 'B1')
    expect(presa.punti[k(s, 'A1')]).toBeNull()
    expect(presa.prigionieri.bianco).toBe(1)
    expect(presa.ko).toBeNull()
    expect(liberta(presa, k(s, 'B1'))).toBe(1)
    expect(catturate(presa, pietra(presa, 'A1'))).toEqual([k(s, 'A2'), k(s, 'B2'), k(s, 'B1')])
    const ripresa = dopo(presa, 'A1')
    expect(ripresa.ko).toBeNull()
    expect(ripresa.prigionieri.nero).toBe(3)
  })
})

describe('la fine', () => {
  it('due passi chiudono il gioco; un passo e poi una pietra no', () => {
    const p = posizioneIniziale(9)
    expect(esito(p, [])).toBeNull()
    const uno = dopo(p, 'passo')
    expect(uno.passi).toBe(1)
    expect(esito(uno, [chiaveRipetizione(p)])).toBeNull()
    expect(esito(dopo(uno, 'passo'), [])).toBe('passi')
    const ripreso = dopo(uno, 'E5')
    expect(ripreso.passi).toBe(0)
    expect(esito(ripreso, [])).toBeNull()
    expect(esito(dopo(ripreso, 'passo'), [])).toBeNull()
    expect(mosseLegali(dopo(uno, 'passo'))).toEqual([])
  })

  it('la terza volta della stessa posizione e’ patta', () => {
    // Due ko in angoli opposti: in alto il Nero puo' prendere in C8, in basso il Bianco in G2.
    // Prendono a turno, e con un passo per parte la posizione torna uguale ogni sei mosse.
    const p = disegno([
      '. X O . . . . . .',
      'X O . O . . . . .',
      '. X O . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . X O .',
      '. . . . . X . X O',
      '. . . . . . X O .',
    ])
    const giro = ['C8', 'G2', 'passo', 'B8', 'H2', 'passo']
    let q = p
    const chiavi: string[] = []
    const esiti: (string | null)[] = []
    for (let i = 0; i < 12; i += 1) {
      chiavi.push(chiaveRipetizione(q))
      q = dopo(q, giro[i % 6])
      esiti.push(esito(q, chiavi))
    }
    expect(chiaveRipetizione(q)).toBe(chiaveRipetizione(p))
    expect(q.prigionieri).toEqual({ nero: 4, bianco: 4 })
    // Dopo sei mosse la posizione di partenza e' tornata per la seconda volta: si gioca ancora.
    expect(esiti.slice(0, 11)).toEqual(Array(11).fill(null))
    expect(esiti[11]).toBe('ripetizione')
  })

  it('la chiave e’ corta, dipende da pietre e tratto e non dal ko ne’ dai passi', () => {
    const p = dopo(posizioneIniziale(19), 'D4', 'Q16', 'Q4')
    const c = chiaveRipetizione(p)
    expect(c).toMatch(/^[0-9a-z]{1,11}$/)
    expect(chiaveRipetizione({ ...p, passi: 1, ko: null })).toBe(c)
    expect(chiaveRipetizione({ ...p, tratto: 'nero' })).not.toBe(c)
    expect(chiaveRipetizione(dopo(p, 'D16'))).not.toBe(c)
    // Quattrocento chiavi, come in una partita lunga a 19, stanno in pochi kB.
    let q = posizioneIniziale(19)
    const chiavi: string[] = []
    for (let i = 0; i < 400; i += 1) {
      chiavi.push(chiaveRipetizione(q))
      const legali = mosseLegali(q)
      q = gioca(q, legali[(i * 7919) % (legali.length - 1)])
    }
    expect(new Set(chiavi).size).toBe(chiavi.length)
    expect(JSON.stringify(chiavi).length).toBeLessThan(6000)
  })
})

describe('il conteggio ad area', () => {
  // Il Nero ha le prime quattro colonne, il Bianco le altre cinque: i muri sono in D e in E.
  const diviso = disegno([
    '. . . X O . . . .',
    '. . . X O . . . .',
    '. . . X O . . . .',
    '. . . X O . . . .',
    '. . . X O . . . .',
    '. . . X O . . . .',
    '. . . X O . . . .',
    '. . . X O . . . .',
    '. . . X O . . . .',
  ])

  it('pietre e territorio, e il komi al Bianco', () => {
    const c = punteggio(diviso, [])
    expect(c.nero).toBe(36)
    expect(c.bianco).toBe(45 + KOMI)
    expect(c.vincitore).toBe('bianco')
    for (let r = 0; r < 9; r += 1) {
      for (let col = 0; col < 9; col += 1) expect(c.proprietario[r * 9 + col]).toBe(col <= 3 ? 'nero' : 'bianco')
    }
  })

  it('le pietre morte si tolgono, e il loro punto va a chi le circonda', () => {
    // Una pietra bianca morta nel territorio nero, in B5.
    const righe = diviso.punti.map((x) => (x === null ? '.' : x === 'nero' ? 'X' : 'O'))
    righe[4 * 9 + 1] = 'O'
    const conMorta = disegno(Array.from({ length: 9 }, (_, r) => righe.slice(r * 9, r * 9 + 9).join('')))
    // Senza toglierla la zona nera tocca anche il Bianco, e non e' di nessuno.
    const senza = punteggio(conMorta, [])
    expect(senza.nero).toBe(9)
    expect(senza.bianco).toBe(46 + KOMI)
    expect(senza.proprietario[0]).toBeNull()
    // Tolta, il territorio torna al Nero con il punto della pietra.
    const con = punteggio(conMorta, gruppo(conMorta, 4 * 9 + 1))
    expect(con.nero).toBe(36)
    expect(con.bianco).toBe(45 + KOMI)
    expect(con.proprietario[4 * 9 + 1]).toBe('nero')
    // Punti fuori dal goban o vuoti nell'elenco non cambiano niente.
    expect(punteggio(conMorta, [...gruppo(conMorta, 4 * 9 + 1), 0, -3, 999, 1.5])).toEqual(con)
  })

  it('le dame non sono di nessuno', () => {
    // I muri sono in D e in F: la colonna E, fra i due, e' tutta dama.
    const p = disegno(
      Array(9).fill('. . . X . O . . .'),
    )
    const c = punteggio(p, [])
    expect(c.nero).toBe(36)
    expect(c.bianco).toBe(36 + KOMI)
    for (let r = 0; r < 9; r += 1) expect(c.proprietario[r * 9 + 4]).toBeNull()
    // Riempita una dama, e' di chi l'ha riempita.
    const riempita = punteggio(dopo(p, 'E5'), [])
    expect(riempita.nero).toBe(37)
    expect(riempita.proprietario[4 * 9 + 4]).toBe('nero')
  })

  it('in un seki le pietre sono vive e le libertà in comune di nessuno', () => {
    const p = seki()
    const c = punteggio(p, [])
    // Le pietre del seki contano per chi le ha; C1 ed E1, che toccano tutti e due, no.
    for (const nome of ['C2', 'D2', 'E2', 'D1']) expect(c.proprietario[k(p, nome)]).toBe('nero')
    for (const nome of ['B1', 'B3', 'D3', 'F1']) expect(c.proprietario[k(p, nome)]).toBe('bianco')
    expect(c.proprietario[k(p, 'C1')]).toBeNull()
    expect(c.proprietario[k(p, 'E1')]).toBeNull()
    // Il Nero: 26 pietre e le 8 dell'angolo; il Bianco: 18 pietre e 27 punti in alto.
    expect(c.nero).toBe(34)
    expect(c.bianco).toBe(45 + KOMI)
    // Nessuno dei due puo' riempire una libertà in comune senza mettersi in atari.
    expect(liberta(dopo(p, 'C1'), k(p, 'D2'))).toBe(1)
    expect(liberta(dopo(p, 'passo', 'C1'), k(p, 'B1'))).toBe(1)
  })

  it('il vincitore e’ chi ha piu’ punti: il komi decide le partite pari', () => {
    // Goban vuoto: nessuno ha niente, e vince il Bianco con il komi.
    const vuoto = punteggio(posizioneIniziale(9), [])
    expect(vuoto).toMatchObject({ nero: 0, bianco: KOMI, vincitore: 'bianco' })
    // Il Nero con 45 punti contro 36 vince di un punto e mezzo.
    const p = disegno(Array(9).fill('. . . . X O . . .'))
    expect(punteggio(p, [])).toMatchObject({ nero: 45, bianco: 36 + KOMI, vincitore: 'nero' })
  })
})

describe('il server', () => {
  it('controlla una mossa sul 19x19 e conta la partita ben sotto il millisecondo', () => {
    // Una partita di trecento mosse, con le chiavi di tutte le posizioni.
    let p = posizioneIniziale(19)
    const chiavi: string[] = []
    for (let i = 0; i < 300; i += 1) {
      chiavi.push(chiaveRipetizione(p))
      const legali = mosseLegali(p).filter((m) => m.tipo === 'pietra')
      p = gioca(p, legali[(i * 104729) % legali.length])
    }
    const testo = scrivi(p)
    const mossa = testoMossa(mosseLegali(p)[0], 19)
    const giri = 500
    let t = performance.now()
    for (let i = 0; i < giri; i += 1) {
      const q = leggi(testo)!
      const m = mossaDaTesto(q, mossa)!
      const nuova = gioca(q, m)
      esito(nuova, [...chiavi, chiaveRipetizione(q)])
      chiaveRipetizione(nuova)
      scrivi(nuova)
    }
    const perMossa = (performance.now() - t) / giri
    t = performance.now()
    for (let i = 0; i < giri; i += 1) punteggio(p, [])
    const perConteggio = (performance.now() - t) / giri
    expect(perMossa).toBeLessThan(1)
    expect(perConteggio).toBeLessThan(1)
  })
})
