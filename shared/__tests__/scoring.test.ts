import { describe, expect, it } from 'vitest'
import {
  ATTEMPT_POINTS,
  ATTEMPT_STEP,
  LOSS_POINTS,
  WEIGHT_UNIT,
  WORD_WEIGHTS,
  MAX_SCORE,
  MAX_SPEED_BONUS,
  MAX_STREAK_BONUS,
  MAX_TIEBREAK,
  PARTICIPATION_POINTS,
  SPEED_FULL_MS,
  SPEED_ZERO_MS,
  maxScoreFor,
  scoreBreakdown,
  scoreFor,
  scoreForWord,
  speedBonus,
  streakBonus,
  weightOf,
  weighted,
} from '../scoring'
import { MAX_ATTEMPTS, WORDS_PER_DAY } from '../config'

describe('bonus velocita', () => {
  it('e pieno sotto i 45 secondi', () => {
    expect(speedBonus(1_000)).toBe(MAX_SPEED_BONUS)
    expect(speedBonus(SPEED_FULL_MS)).toBe(MAX_SPEED_BONUS)
  })

  it('si azzera dopo dodici minuti', () => {
    expect(speedBonus(SPEED_ZERO_MS)).toBe(0)
    expect(speedBonus(SPEED_ZERO_MS + 60_000)).toBe(0)
  })

  it('scende senza salti nel mezzo', () => {
    const mid = speedBonus((SPEED_FULL_MS + SPEED_ZERO_MS) / 2)
    expect(mid).toBe(Math.round(MAX_SPEED_BONUS / 2))
    // Monotono: piu' tempo non puo' dare piu' punti. Si parte da 1 ms perché
    // 0 vuol dire "non misurato", non "istantaneo".
    let previous = MAX_SPEED_BONUS + 1
    for (let ms = 1; ms <= SPEED_ZERO_MS; ms += 15_000) {
      const value = speedBonus(ms)
      expect(value).toBeLessThanOrEqual(previous)
      previous = value
    }
  })

  it('vale zero se il tempo non e misurabile, ma zero millisecondi e un tempo', () => {
    expect(speedBonus(null)).toBe(0)
    expect(speedBonus(-5)).toBe(0)
    /*
     * La durata si misura dal primo tentativo, quindi indovinare al primo colpo
     * da' esattamente zero. Trattarlo come "non misurato" togliva il bonus al
     * risultato migliore possibile: era un bug, e questo test lo tiene chiuso.
     */
    expect(speedBonus(0)).toBe(MAX_SPEED_BONUS)
  })
})

describe('bonus costanza', () => {
  it('cresce di un punto al giorno', () => {
    expect(streakBonus(0)).toBe(0)
    expect(streakBonus(1)).toBe(1)
    expect(streakBonus(5)).toBe(5)
  })

  it('si ferma al tetto', () => {
    expect(streakBonus(MAX_STREAK_BONUS)).toBe(MAX_STREAK_BONUS)
    expect(streakBonus(400)).toBe(MAX_STREAK_BONUS)
  })

  it('regge una streak negativa', () => {
    expect(streakBonus(-3)).toBe(0)
  })
})

describe('punteggio della partita', () => {
  it('premia i tentativi risparmiati', () => {
    const base = { status: 'won' as const, durationMs: null, streak: 0 }
    const scores = [1, 2, 3, 4, 5, 6].map((attempts) => scoreFor({ ...base, attempts }))
    expect(scores).toEqual([...ATTEMPT_POINTS])
    // Strettamente decrescente: un tentativo in piu' costa sempre qualcosa.
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThan(scores[i - 1])
    }
  })

  it('i bonus non ribaltano mai il numero di tentativi', () => {
    // L'invariante dell'impianto, verificata su tutte le combinazioni:
    // meno tentativi vince sempre, anche contro chi ha tutti i bonus.
    for (let migliore = 1; migliore < MAX_ATTEMPTS; migliore += 1) {
      const senzaBonus = scoreFor({
        status: 'won',
        attempts: migliore,
        durationMs: null,
        streak: 0,
      })
      for (let peggiore = migliore + 1; peggiore <= MAX_ATTEMPTS; peggiore += 1) {
        const conTuttiIBonus = scoreFor({
          status: 'won',
          attempts: peggiore,
          durationMs: 1_000,
          streak: 999,
        })
        expect(senzaBonus).toBeGreaterThan(conTuttiIBonus)
      }
    }
  })

  it('il tetto dei bonus sta sotto il gradino fra due tentativi', () => {
    // E' la condizione che rende vera l'invariante qui sopra: se qualcuno alza
    // un bonus senza toccare i punti base, cade prima questo test.
    expect(MAX_TIEBREAK).toBeLessThan(ATTEMPT_STEP)
    for (let i = 1; i < ATTEMPT_POINTS.length; i += 1) {
      expect(ATTEMPT_POINTS[i - 1] - ATTEMPT_POINTS[i]).toBe(ATTEMPT_STEP)
    }
  })

  it('somma le tre componenti', () => {
    const breakdown = scoreBreakdown({
      status: 'won',
      attempts: 2,
      durationMs: 30_000,
      streak: 4,
    })
    expect(breakdown).toEqual({ attempts: 90, speed: 4, streak: 4, total: 98 })
  })

  it('da i punti di consolazione a chi ha perso', () => {
    const lost = scoreBreakdown({ status: 'lost', attempts: 6, durationMs: 20_000, streak: 9 })
    expect(lost.total).toBe(LOSS_POINTS)
    // Nessun bonus a chi non ha indovinato.
    expect(lost.speed).toBe(0)
    expect(lost.streak).toBe(0)
  })

  it('non assegna nulla a una partita in corso', () => {
    expect(scoreFor({ status: 'playing', attempts: 2, durationMs: 5_000, streak: 3 })).toBe(0)
  })

  it('il massimo teorico corrisponde alla costante esposta', () => {
    expect(scoreFor({ status: 'won', attempts: 1, durationMs: 1_000, streak: 20 })).toBe(MAX_SCORE)
    expect(MAX_SCORE).toBe(109)
  })

  it('regge tentativi fuori scala senza esplodere', () => {
    expect(scoreFor({ status: 'won', attempts: 0, durationMs: null, streak: 0 })).toBe(
      ATTEMPT_POINTS[0],
    )
    expect(scoreFor({ status: 'won', attempts: 99, durationMs: null, streak: 0 })).toBe(
      ATTEMPT_POINTS[5],
    )
  })
})


describe('scala dei punti: giusta ma recuperabile', () => {
  it('e la base di partecipazione piu un gradino per tentativo risparmiato', () => {
    expect([...ATTEMPT_POINTS]).toEqual([100, 90, 80, 70, 60, 50])
    // La scala e' derivata, non scritta a mano: se si ritocca uno dei due
    // numeri, questo test dice subito cosa ne viene fuori.
    const peggiore = ATTEMPT_POINTS[ATTEMPT_POINTS.length - 1]
    expect(peggiore).toBe(PARTICIPATION_POINTS + ATTEMPT_STEP)
  })

  it('la giornata migliore vale al massimo il doppio della peggiore', () => {
    // E' la condizione di "recuperabile": col rapporto 6:1 di prima, una
    // vittoria al sesto valeva un sesto di una perfetta e due giornate
    // sfortunate decidevano la classifica. Con 2:1, tutto il divario fra la
    // giornata migliore e la peggiore vale una sola giornata: si recupera
    // giocando, non serve sperare che l'altro sbagli per una settimana.
    const migliore = ATTEMPT_POINTS[0]
    const peggiore = ATTEMPT_POINTS[ATTEMPT_POINTS.length - 1]
    expect(migliore / peggiore).toBeLessThanOrEqual(2)
    expect(migliore - peggiore).toBeLessThanOrEqual(peggiore)
  })

  it('ma i tentativi contano ancora: il gradino non e simbolico', () => {
    // L'altra meta' del compromesso. Un gradino troppo piccolo renderebbe
    // indifferente indovinare al secondo o al sesto.
    expect(ATTEMPT_STEP).toBeGreaterThanOrEqual(ATTEMPT_POINTS[0] / 20)
  })

  it('chi non indovina sta sotto chi indovina al sesto, e sopra chi non gioca', () => {
    const sesto = scoreFor({ status: 'won', attempts: 6, durationMs: null, streak: 0 })
    expect(LOSS_POINTS).toBeLessThan(sesto)
    expect(LOSS_POINTS).toBeGreaterThan(0)
  })
})

describe('le cinque parole della giornata', () => {
  it('dimezzano, e l ultima resta all ottavo', () => {
    expect([...WORD_WEIGHTS]).toEqual([8, 4, 2, 1, 1])
    expect(WORD_WEIGHTS).toHaveLength(WORDS_PER_DAY)
    // L'ultima non scende a un sedicesimo: una quinta parola che valesse sei
    // punti e mezzo non varrebbe la pena di giocarla.
    expect(WORD_WEIGHTS[4]).toBe(WORD_WEIGHTS[3])
  })

  it('la somma delle quattro in piu fa quanto la principale', () => {
    const extra = WORD_WEIGHTS.slice(1).reduce((a, b) => a + b, 0)
    expect(extra).toBe(WORD_WEIGHTS[0])
    expect(extra).toBe(WEIGHT_UNIT)
  })

  it('e la somma non supera la principale a NESSUN punteggio', () => {
    /*
     * L'invariante vera, ed e' il motivo per cui `weighted` arrotonda per
     * difetto: al piu' vicino, un 100 darebbe 50+25+13+13 = 101, e le quattro
     * parole in piu' batterebbero la principale per un punto. Verificato su
     * tutti i punteggi possibili invece che su un esempio.
     */
    for (let punti = 0; punti <= 200; punti += 1) {
      const principale = weighted(punti, 1)
      const extra = [2, 3, 4, 5].reduce((sum, slot) => sum + weighted(punti, slot), 0)
      expect(extra).toBeLessThanOrEqual(principale)
    }
  })

  it('la principale vale piena', () => {
    for (let punti = 0; punti <= 200; punti += 1) {
      expect(weighted(punti, 1)).toBe(punti)
    }
  })

  it('i punti scendono lungo le posizioni, senza risalire', () => {
    const scala = [1, 2, 3, 4, 5].map((slot) => weighted(100, slot))
    expect(scala).toEqual([100, 50, 25, 12, 12])
    for (let i = 1; i < scala.length; i += 1) {
      expect(scala[i]).toBeLessThanOrEqual(scala[i - 1])
    }
  })

  it('il massimo per posizione e la scala dei pesi, senza bonus', () => {
    // E' il numero che il selettore mostra: dev'essere leggibile come "meta',
    // un quarto, un ottavo", non come 109 contro 50.
    expect([1, 2, 3, 4, 5].map(maxScoreFor)).toEqual([100, 50, 25, 12, 12])
  })

  it('regge posizioni fuori scala senza esplodere', () => {
    expect(weightOf(0)).toBe(WORD_WEIGHTS[0])
    expect(weightOf(99)).toBe(WORD_WEIGHTS[WORDS_PER_DAY - 1])
  })

  it('una giornata intera vale al massimo il doppio della sola principale', () => {
    // E' il tetto di quel che le extra possono aggiungere: chi fa tutto
    // raddoppia, non decuplica.
    const sola = weighted(ATTEMPT_POINTS[0], 1)
    const tutte = [1, 2, 3, 4, 5].reduce((s, slot) => s + weighted(ATTEMPT_POINTS[0], slot), 0)
    expect(tutte).toBeLessThanOrEqual(sola * 2)
  })

  it('i bonus stanno solo sulla principale', () => {
    /*
     * Senza questa regola i bonus si moltiplicavano per cinque: chi giocava
     * tutte le parole incassava fino a cinque volte il bonus velocità, e tanto
     * bastava a ribaltare chi aveva indovinato la principale al primo colpo.
     * Trovato provando l'API, non ragionando sui pesi — che erano giusti.
     */
    const veloce = { status: 'won' as const, attempts: 6, durationMs: 0, streak: 5 }
    expect(scoreForWord(veloce, 1)).toBe(ATTEMPT_POINTS[5] + MAX_SPEED_BONUS + MAX_STREAK_BONUS)
    // Sulle altre, la sola base pesata.
    expect(scoreForWord(veloce, 2)).toBe(weighted(ATTEMPT_POINTS[5], 2))
    expect(scoreForWord(veloce, 5)).toBe(weighted(ATTEMPT_POINTS[5], 5))
  })

  it('la principale giocata bene batte tutte e cinque giocate male', () => {
    /*
     * La condizione che l'utente ha chiesto a parole: "senza ribaltarla". E' il
     * caso peggiore possibile — giornata perfetta sulla sola principale contro
     * cinque parole chiuse tutte all'ultimo tentativo, con tutti i bonus in
     * palio — e regge per un punto, che e' esattamente quel che deve essere:
     * la somma delle quattro extra *vale* quanto la principale, quindi fare
     * tutto raddoppia la giornata senza mai passare davanti.
     */
    const migliore = { status: 'won' as const, attempts: 1, durationMs: 0, streak: 99 }
    const peggiore = { status: 'won' as const, attempts: MAX_ATTEMPTS, durationMs: 0, streak: 99 }
    const soloPrincipale = scoreForWord(migliore, 1)
    const tuttoMale = [1, 2, 3, 4, 5].reduce((s, slot) => s + scoreForWord(peggiore, slot), 0)
    expect(soloPrincipale).toBeGreaterThan(tuttoMale)
  })
})
