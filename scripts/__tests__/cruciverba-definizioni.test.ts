import { describe, expect, it } from 'vitest'
import {
  definizioneAccettabile,
  definizioniDellaVoce,
  formeDellaVoce,
  normalizzaRisposta,
  notaDellaForma,
  pulisciDefinizione,
  rivelaLaRisposta,
  // @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
} from '../cruciverba/definizioni.mjs'

describe('la risposta', () => {
  it('perde gli accenti e resta nelle 21 lettere', () => {
    expect(normalizzaRisposta('Città')).toBe('citta')
    expect(normalizzaRisposta('tè')).toBe('te')
    expect(normalizzaRisposta('jazz')).toBeNull()
    expect(normalizzaRisposta("l'altro")).toBeNull()
    expect(normalizzaRisposta('a')).toBeNull()
  })
})

describe('pulire una definizione senza riscriverla', () => {
  it('toglie i residui dei modelli e tiene la prima proposizione', () => {
    expect(
      pulisciDefinizione(
        'uccello domestico; la sua classificazione scientifica è Anser anser ( tassonomia)',
      ),
    ).toBe('Uccello domestico')
  })

  it('taglia una definizione troppo lunga prima di un complemento, non a meta\' parola', () => {
    const lunga =
      "uccello domestico degli Anseriformi di notevoli dimensioni con i piedi a forma di pinna, un tempo allevato ovunque nelle campagne"
    expect(pulisciDefinizione(lunga)).toBe(
      'Uccello domestico degli Anseriformi di notevoli dimensioni con i piedi a forma di pinna',
    )
  })

  it('rinuncia quando il taglio lascerebbe un frammento', () => {
    const inciso =
      'nei confronti di un figlio o di una figlia, il padre del padre (nonno paterno) e il padre della madre (nonno materno)'
    expect(pulisciDefinizione(inciso)).toBeNull()
  })

  it('non lascia parentesi aperte', () => {
    const d = pulisciDefinizione(
      "stato dell'Africa centrale (nome ufficiale: Repubblica dell'Angola, con capitale Luanda, che confina a nord con il Congo e a est con lo Zambia)",
    )
    expect(d === null || (d.split('(').length === d.split(')').length)).toBe(true)
  })

  it('toglie la grammatica davanti ai due punti', () => {
    expect(pulisciDefinizione('in funzione di soggetto: la persona a cui si parla o scrive')).toBe(
      'La persona a cui si parla o scrive',
    )
  })
})

describe('le definizioni che non si usano', () => {
  it('quelle che contengono la risposta o la sua radice', () => {
    expect(rivelaLaRisposta('Che regola', 'regolatore')).toBe(true)
    expect(rivelaLaRisposta('In modo irato, con ira', 'iratamente')).toBe(true)
    expect(rivelaLaRisposta('Pensioni per cani', 'cane')).toBe(true)
    expect(rivelaLaRisposta('Atomo formato da antimateria', 'antiatomo')).toBe(true)
    // Le parole corte contano solo intere: "re" dentro "regione" non rivela niente.
    expect(rivelaLaRisposta('Capoluogo di regione', 're')).toBe(false)
    expect(rivelaLaRisposta('Distesa di acqua salata', 'mare')).toBe(false)
  })

  it('i rimandi, i segnaposto, i nomi generici, le glosse in inglese', () => {
    for (const d of [
      'Variante di acquietare',
      'Definizione mancante; se vuoi, aggiungila tu',
      'Nome proprio di persona maschile',
      'Terza persona singolare del presente',
      'In funzione di predicato nominale',
      'Bevanda ottenuta dalle suddette piante',
      'The letter m, M',
    ]) {
      expect(definizioneAccettabile(d, 'parola')).toBe(false)
    }
  })

  it('quelle rimaste mozze', () => {
    expect(definizioneAccettabile('Gerundio presente di', 'amando')).toBe(false)
    expect(definizioneAccettabile('Articolo determinativo da usare solo', 'lo')).toBe(false)
    expect(definizioneAccettabile('Pensioni per cani: luoghi', 'canile')).toBe(false)
    expect(definizioneAccettabile('Distesa di acqua salata che circonda la terra emersa', 'mare')).toBe(
      true,
    )
  })
})

describe('una voce del dump', () => {
  it('tiene i sensi buoni, salta le forme flesse e le etichette escluse, segna le sigle', () => {
    const voce = {
      word: 'UE',
      pos: 'abbrev',
      senses: [
        { glosses: ['acronimo di Unione Europea: unione di stati europei'] },
        { glosses: ['uscita elettronica'], tags: ['obsolete'] },
      ],
    }
    expect(definizioniDellaVoce(voce, 'ue')).toEqual([
      { testo: 'Acronimo di Unione Europea: unione di stati europei', voce: 'UE', nota: 'sigla', pos: 'abbrev' },
    ])
  })

  it('una sigla sciolta in una parola sola e\' un\'abbreviazione da messaggino, e resta fuori', () => {
    expect(definizioniDellaVoce({ word: 'cs', pos: 'abbrev', senses: [{ glosses: ['cosa'] }] }, 'cs')).toEqual(
      [],
    )
  })

  it('le forme flesse diventano plurali e femminili del loro lemma', () => {
    expect(notaDellaForma('plurale di ala')).toBe('plurale')
    expect(notaDellaForma('femminile di bello')).toBe('femminile')
    expect(notaDellaForma('femminile plurale di buono')).toBe('femminile plurale')
    expect(notaDellaForma('plurale femminile di inaccurato')).toBe('femminile plurale')
    expect(notaDellaForma('maschile plurale di caro')).toBe('plurale')
    expect(notaDellaForma('diminutivo di rete')).toBeNull()
    expect(
      formeDellaVoce({
        word: 'ali',
        pos: 'noun',
        senses: [{ glosses: ['plurale di ala'], tags: ['form-of'], form_of: [{ word: 'ala' }] }],
      }),
    ).toEqual([{ lemma: 'ala', nota: 'plurale', pos: 'noun' }])
  })
})
