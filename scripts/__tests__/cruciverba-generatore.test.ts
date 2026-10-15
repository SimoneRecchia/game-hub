import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { EPOCH_DATE, GAME_TIMEZONE } from '../../shared/config'
import { LIVELLI_CRUCIVERBA as LIVELLI_GIOCO, NERA, sequenzeDelloSchema } from '../../shared/cruciverba'
import { addDays, mulberry32 as mulberryCondiviso, puzzleNumberFor } from '../../shared/daily'
import {
  DA_ENIGMISTA,
  LIVELLI_CRUCIVERBA,
  LIVELLO_DEL_GIORNO,
  TRATTO_MASSIMO,
  correggiDefinizioni,
  definizioniDaEnigmista,
  definizioneChiara,
  definizioniDellaSoluzione,
  disegnaSchema,
  dizionarioDelLivello,
  generaCruciverba,
  istruzioneRifai,
  istruzioneSql,
  leggiDefinizioni,
  mulberry32,
  paroleDellaSoluzione,
  preparaDizionario,
  scegliDefinizioni,
  semeDelGiorno,
  sequenzeDi,
  // @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
} from '../cruciverba/generatore.mjs'
// @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
import { EPOCA, FUSO, numeroDelGiorno } from '../cruciverba/giorno.mjs'

const DATI = join(__dirname, '..', 'data', 'cruciverba-definizioni.tsv.gz')
const voci = leggiDefinizioni(gunzipSync(readFileSync(DATI)).toString('utf8'))
const indici = preparaDizionario(voci)

function tratti(nere: boolean[], righe: number, colonne: number): number[] {
  const lunghezze: number[] = []
  const leggi = (celle: boolean[]) => {
    let n = 0
    for (const nera of [...celle, true]) {
      if (nera) {
        if (n > 0) lunghezze.push(n)
        n = 0
      } else n += 1
    }
  }
  for (let r = 0; r < righe; r += 1) leggi(nere.slice(r * colonne, (r + 1) * colonne))
  for (let c = 0; c < colonne; c += 1) leggi(Array.from({ length: righe }, (_, r) => nere[r * colonne + c]))
  return lunghezze
}

describe('il generatore e il gioco parlano la stessa lingua', () => {
  it('lo stesso PRNG di shared/daily.ts', () => {
    const a = mulberry32(12345)
    const b = mulberryCondiviso(12345)
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b())
  })

  it('lo stesso calendario: lo schema del giorno 40 e\' quello che il Worker serve il giorno 40', () => {
    expect(EPOCA).toBe(EPOCH_DATE)
    expect(FUSO).toBe(GAME_TIMEZONE)
    for (const delta of [0, 1, 28, 200, 800]) {
      const data = addDays(EPOCH_DATE, delta)
      expect(numeroDelGiorno(data)).toBe(puzzleNumberFor(data))
    }
  })

  it('le stesse chiavi delle definizioni', () => {
    const nere = disegnaSchema(mulberry32(7), 10, 10)
    const schema = nere.map((n: boolean) => (n ? NERA : '.')).join('')
    const delGeneratore = sequenzeDi(nere, 10, 10).map((s: { chiave: string }) => s.chiave).sort()
    const delGioco = sequenzeDelloSchema(schema, 10, 10).map((s) => s.chiave).sort()
    expect(delGeneratore).toEqual(delGioco)
  })
})

describe('lo schema delle caselle nere', () => {
  it('rispetta le regole del cruciverba italiano, su molti semi', () => {
    let disegnati = 0
    for (let seme = 1; seme <= 40; seme += 1) {
      // Con qualche seme non viene: il generatore passa al successivo, ed e'
      // previsto. Ma deve venire quasi sempre, altrimenti e' tempo buttato.
      const nere: boolean[] | null = disegnaSchema(mulberry32(seme), 10, 10)
      if (!nere) continue
      disegnati += 1
      const lunghezze = tratti(nere, 10, 10)
      // Nessuna lettera che stia in una parola sola: ogni tratto e' lungo almeno due.
      expect(lunghezze.every((n) => n >= 2)).toBe(true)
      // E nessuna parola cosi' lunga da incrociarsi solo con altre lunghe.
      expect(Math.max(...lunghezze)).toBeLessThanOrEqual(TRATTO_MASSIMO)
      // Mai un quadrato di quattro nere.
      for (let r = 0; r < 9; r += 1) {
        for (let c = 0; c < 9; c += 1) {
          const k = r * 10 + c
          expect(nere[k] && nere[k + 1] && nere[k + 10] && nere[k + 11]).toBe(false)
        }
      }
    }
    expect(disegnati).toBeGreaterThanOrEqual(32)
  })
})

describe('un cruciverba generato', () => {
  const cruciverba = generaCruciverba({ indici, seme: semeDelGiorno(29), schemi: 40 })

  it('viene, ed e\' sempre lo stesso per lo stesso giorno', () => {
    expect(cruciverba).not.toBeNull()
    const ancora = generaCruciverba({ indici, seme: semeDelGiorno(29), schemi: 40 })
    expect(ancora.griglia).toBe(cruciverba.griglia)
  }, 60_000)

  it('ha solo parole vere, tutte diverse, ognuna con la sua definizione', () => {
    const dizionario = new Map(voci.map((v: { parola: string }) => [v.parola, v]))
    const sequenze = sequenzeDelloSchema(cruciverba.griglia, cruciverba.righe, cruciverba.colonne)
    const parole = sequenze.map((s) => s.caselle.map((k) => cruciverba.griglia[k]).join(''))
    expect(new Set(parole).size).toBe(parole.length)
    for (const [i, s] of sequenze.entries()) {
      expect(dizionario.has(parole[i])).toBe(true)
      const d = cruciverba.definizioni[s.chiave]
      expect(d?.testo?.length).toBeGreaterThan(2)
      // Nessuna definizione contiene la sua risposta.
      expect(d.testo.toLowerCase().split(/[^a-zàèéìòù]+/)).not.toContain(parole[i])
    }
  })

  it('si salva con un\'istruzione che non si rompe sugli apostrofi', () => {
    const sql = istruzioneSql(29, cruciverba, '2026-09-26T00:00:00.000Z')
    expect(sql.startsWith('INSERT OR IGNORE INTO cruciverba_schemi')).toBe(true)
    // Ogni apostrofo dentro le stringhe e' raddoppiato: il numero di apici e' pari.
    expect((sql.match(/'/g) ?? []).length % 2).toBe(0)
  })

  it('le parole da non ripetere si ricavano dalla soluzione salvata', () => {
    const parole = paroleDellaSoluzione(cruciverba.griglia, cruciverba.righe, cruciverba.colonne)
    expect(parole.length).toBeGreaterThan(10)
    expect(parole.every((p: string) => p.length >= 4 && cruciverba.parole.includes(p))).toBe(true)
  })
})

describe('gli schemi liberi', () => {
  it('hanno semi loro: lo schema libero n non e’ il cruciverba del giorno n', async () => {
    // @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
    const { semeLibero } = await import('../cruciverba/generatore.mjs')
    const semi = new Set<number>()
    for (let n = 1; n <= 500; n += 1) {
      expect(semeLibero(n)).not.toBe(semeDelGiorno(n))
      semi.add(semeLibero(n))
    }
    expect(semi.size).toBe(500)
  })

  it('si scrivono nella loro tabella, col loro numero', () => {
    const finto = { righe: 1, colonne: 2, griglia: 'ab', definizioni: {} }
    expect(istruzioneSql(7, finto, 'x', true)).toMatch(/^INSERT OR IGNORE INTO cruciverba_schemi_liberi \(id, /)
    expect(istruzioneSql(7, finto, 'x')).toMatch(/^INSERT OR IGNORE INTO cruciverba_schemi \(puzzle_number, /)
  })

  it('portano il loro livello, uno di quelli che il gioco conosce, nello stesso ordine', () => {
    const finto = { righe: 1, colonne: 2, griglia: 'ab', definizioni: {} }
    expect(istruzioneSql(7, finto, 'x', true, null, 'facile')).toMatch(/, livello\) VALUES \(.*, 'facile'\);$/)
    expect(Object.keys(LIVELLI_CRUCIVERBA)).toEqual([...LIVELLI_GIOCO])
  })
})

describe('le definizioni chiare', () => {
  it('lasciano fuori le classificazioni, le note d\'uso e le materie da specialista', () => {
    for (const testo of [
      'Genere di piante della famiglia delle Mimosacee',
      'Pianta erbacea della famiglia delle Graminacee',
      "Superclasse di vertebrati del phylum dei cordati",
      'In vulcanologia indica una colata lavica',
      'Con uso enfatico',
      'Normalmente utilizzato in alcune espressioni',
    ]) {
      expect(definizioneChiara(testo), testo).toBe(false)
    }
  })

  it('tengono le definizioni di tutti i giorni', () => {
    for (const testo of ['Animale domestico che abbaia', 'Città della Toscana', 'Il contrario di alto', 'Si beve al mattino']) {
      expect(definizioneChiara(testo), testo).toBe(true)
    }
  })
})

describe('lo schema facile della classificata', () => {
  const livello = LIVELLI_CRUCIVERBA[LIVELLO_DEL_GIORNO]
  const facili = dizionarioDelLivello(voci, LIVELLO_DEL_GIORNO)
  const schemi = [31, 32, 33].map((numero) =>
    generaCruciverba({ indici: facili, seme: semeDelGiorno(numero), livello: LIVELLO_DEL_GIORNO, schemi: 30 }),
  )

  it('e\' un nove per nove, e si riempie', () => {
    expect(LIVELLO_DEL_GIORNO).toBe('facile')
    for (const c of schemi) {
      expect(c).not.toBeNull()
      expect([c.righe, c.colonne]).toEqual([9, 9])
      expect(c.griglia).toHaveLength(81)
    }
  })

  it('ha definizioni chiare, e al piu\' due da enigmista', () => {
    for (const c of schemi) {
      const testi = Object.values(c.definizioni as Record<string, { testo: string }>).map((d) => d.testo)
      const enigmista = testi.filter((t) => DA_ENIGMISTA.test(t))
      expect(enigmista.length).toBeLessThanOrEqual(livello.massimoEnigmista)
      for (const t of testi) if (!DA_ENIGMISTA.test(t)) expect(definizioneChiara(t), t).toBe(true)
    }
  })
})

describe('gli schemi gia\' scritti', () => {
  const perParola = new Map(voci.map((v: { parola: string }) => [v.parola, v]))
  // Le definizioni come le scrive `istruzioneSql`: testo, voce e nota.
  const salvate = (cruciverba: { definizioni: Record<string, { testo: string; voce: string; nota: string }> }) =>
    Object.fromEntries(
      Object.entries(cruciverba.definizioni).map(([k, d]) => [
        k,
        d.nota ? { t: d.testo, v: d.voce, n: d.nota } : { t: d.testo, v: d.voce },
      ]),
    )

  it('una definizione che il filtro ha scartato dopo lascia il posto alla prima buona', () => {
    // Lo schema #35, quando il filtro non vedeva ancora il buco di "dei,".
    const rotta = "L'universalità dei, ovverosia, senza eccezione alcuna, tutti i diritti ed oneri"
    const corretto = correggiDefinizioni('eredita', 1, 7, { o0: { t: rotta, v: 'eredità' } }, perParola)
    expect(corretto.definizioni.o0).toEqual({
      t: 'Passaggio di proprietà e/o beni, anche pecuniari, per la morte di qualcuno',
      v: 'eredità',
    })
    expect(corretto.cambiate).toEqual([
      { chiave: 'o0', parola: 'eredita', prima: rotta, dopo: corretto.definizioni.o0.t },
    ])
  })

  it('uno schema con le definizioni di adesso resta com\'e\'', () => {
    const cruciverba = generaCruciverba({ indici, seme: semeDelGiorno(29), schemi: 40 })
    const { griglia, righe, colonne } = cruciverba
    expect(correggiDefinizioni(griglia, righe, colonne, salvate(cruciverba), perParola)).toBeNull()
  }, 60_000)

  it('una parola che il dizionario non ha piu\' tiene la sua definizione', () => {
    expect(correggiDefinizioni('zzzz', 1, 4, { o0: { t: 'Il verso di chi dorme', v: 'zzzz' } }, perParola)).toBeNull()
  })
})

describe('una parola che torna cambia definizione', () => {
  const VOCALI = 'aeiou'
  /** Rifa' la parola dalla definizione da enigmista: se il conto e' giusto, la definizione e' giusta. */
  function risolvi(testo: string): string {
    const x = testo.slice(testo.lastIndexOf(' ') + 1)
    const n = (s: string) => s.length
    if (testo.startsWith('Le vocali di ')) return [...x].filter((c) => VOCALI.includes(c)).join('')
    if (testo.startsWith('Le consonanti di ')) return [...x].filter((c) => !VOCALI.includes(c)).join('')
    if (testo.startsWith('Le lettere pari di ')) return [...x].filter((_, i) => i % 2 === 1).join('')
    if (testo.startsWith('Le lettere dispari di ')) return [...x].filter((_, i) => i % 2 === 0).join('')
    void n
    return x
  }

  it('le definizioni da enigmista sono giuste per costruzione, e il riconoscitore le riconosce', () => {
    const comuni = ['milano', 'farina', 'tavolo', 'aprile', 'mare', 'sole', 'lento', 'strada']
    const tutte = ['la', 'ta', 'le', 'aia', 'ar', 'il', 'so', 'tr'].flatMap((p) =>
      definizioniDaEnigmista(p, comuni).map((t: string) => [p, t] as const),
    )
    expect(tutte.map(([, t]) => t)).toEqual(
      expect.arrayContaining(['Il cuore di milano', 'Inizio di tavolo', 'Le vocali di farina', 'Fine di aprile']),
    )
    for (const [parola, testo] of tutte) {
      expect(DA_ENIGMISTA.test(testo), testo).toBe(true)
      const x = testo.slice(testo.lastIndexOf(' ') + 1)
      if (testo.startsWith('Inizio di ')) expect(x.startsWith(parola), testo).toBe(true)
      else if (testo.startsWith('Fine di ')) expect(x.endsWith(parola), testo).toBe(true)
      else if (testo.startsWith('Il cuore di ')) {
        const resto = x.length - parola.length
        expect(resto % 2, testo).toBe(0)
        expect(x.slice(resto / 2, resto / 2 + parola.length), testo).toBe(parola)
      } else expect(risolvi(testo), testo).toBe(parola)
    }
    // Una definizione del Wikizionario non e' da enigmista.
    expect(DA_ENIGMISTA.test('Articolo determinativo maschile singolare')).toBe(false)
    expect(DA_ENIGMISTA.test('Il cuore di Milano e della Lombardia')).toBe(false)
  })

  it('la prima definizione che la parola non ha avuto di recente, poi quelle da enigmista', () => {
    const voce = (parola: string) => voci.find((v: { parola: string }) => v.parola === parola)
    const il = { chiave: 'o0', voce: { ...voce('il'), sigla: false } }
    const era = { chiave: 'o5', voce: { ...voce('era'), sigla: false } }
    const prima = scegliDefinizioni([il, era])
    expect(prima.o0.testo).toBe('Articolo determinativo maschile singolare')
    expect(prima.o5.testo).toBe(era.voce.definizioni[0].testo)
    const recenti = new Map([
      ['il', new Set([prima.o0.testo.toLowerCase()])],
      ['era', new Set([prima.o5.testo.toLowerCase()])],
    ])
    const dopo = scegliDefinizioni([il, era], { recenti, comuni: ['milano', 'vile', 'filo'] })
    expect(dopo.o5.testo).toBe(era.voce.definizioni[1].testo)
    expect(DA_ENIGMISTA.test(dopo.o0.testo)).toBe(true)
    expect(dopo.o0.voce).toBe('il')
    // Senza definizioni da enigmista per lei, una parola corta riparte dalla prima.
    expect(scegliDefinizioni([il], { recenti, comuni: [] }).o0.testo).toBe(prima.o0.testo)
  })

  it('con la memoria, le definizioni che tornano uguali sono molte meno', () => {
    /** Cinque giorni di fila come li fa la notte; restituisce quante parole hanno avuto una definizione gia' data. */
    const ripetute = (memoria: boolean) => {
      const recenti = new Map<string, Set<string>>()
      const evita = new Set<string>()
      let volte = 0
      for (let numero = 200; numero < 205; numero += 1) {
        const c = generaCruciverba({ indici, seme: semeDelGiorno(numero), schemi: 40, evita, recenti: memoria ? recenti : new Map() })
        const salvate = Object.fromEntries(Object.entries(c.definizioni).map(([k, d]: [string, any]) => [k, { t: d.testo }]))
        for (const [parola, testo] of definizioniDellaSoluzione(c.griglia, c.righe, c.colonne, salvate)) {
          if (recenti.get(parola)?.has(testo.toLowerCase())) volte += 1
          if (!recenti.has(parola)) recenti.set(parola, new Set())
          recenti.get(parola)!.add(testo.toLowerCase())
          if (parola.length >= 3) evita.add(parola)
        }
      }
      return volte
    }
    const senza = ripetute(false)
    const con = ripetute(true)
    expect(senza).toBeGreaterThan(10)
    expect(con).toBeLessThanOrEqual(senza / 3)
  }, 120_000)

  it('correggere gli schemi non tocca le definizioni da enigmista', () => {
    const perParola = new Map(voci.map((v: { parola: string }) => [v.parola, v]))
    expect(correggiDefinizioni('la', 1, 2, { o0: { t: 'Il cuore di milano', v: 'la' } }, perParola)).toBeNull()
  })

  it('uno schema si rifa solo se e\' di un formato vecchio e nessuno l\'ha aperto', () => {
    const finto = { righe: 1, colonne: 2, griglia: 'la', definizioni: { o0: { testo: 'Il cuore di milano', voce: 'la', nota: '' } } }
    const sql = istruzioneRifai(50, finto, 'x', 2)
    expect(sql).toMatch(/^UPDATE cruciverba_schemi SET /)
    expect(sql).toMatch(/WHERE puzzle_number = 50 AND formato < 2 AND NOT EXISTS \(SELECT 1 FROM cruciverba_games WHERE puzzle_number = 50\);$/)
    expect(istruzioneSql(50, finto, 'x', false, 2)).toMatch(/created_at, formato\) VALUES \(.*, 2\);$/)
  })
})
