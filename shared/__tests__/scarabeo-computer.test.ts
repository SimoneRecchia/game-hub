import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dawg } from '../dawg'
import {
  MOSSE_PER_GIORNATA,
  TESSERE_LEGGIO,
  leggiiDa,
  leggioDa,
  rigioca,
  sacchettoDaSeme,
  sacchettoDelGiorno,
  type Mossa,
} from '../scarabeo'
import {
  MOSSE_A_TESTA,
  PARTITA_DEL_GIORNO,
  giornataDelComputer,
  rispostaDelGiorno,
  statoLibera,
  turnoDelComputer,
  type PartitaLibera,
} from '../scarabeo-computer'
import { valoreLeggio } from '../scarabeo-due'

const dawg = Dawg.da(
  readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg')),
)

describe('il computer gioca la giornata', () => {
  it('e’ deterministico: stesso sacchetto e stesso seme, stesse mosse', () => {
    const a = giornataDelComputer(dawg, sacchettoDelGiorno(29), 'normale', 29)
    const b = giornataDelComputer(dawg, sacchettoDelGiorno(29), 'normale', 29)
    expect(a).toEqual(b)
    expect(a.mosse).toHaveLength(MOSSE_PER_GIORNATA)
  })

  it('le sue mosse rigiocate valgono i punti che dichiara, e nessuna e’ sbagliata', () => {
    const { mosse, punti } = giornataDelComputer(dawg, sacchettoDelGiorno(30), 'normale', 30)
    const rigiocata = rigioca(mosse)
    expect(rigiocata.punti).toBe(punti)
    // Una posa che rigiocata vale zero senza parole sarebbe una posa illegale.
    for (const g of rigiocata.giocate) if (g.tipo === 'posa') expect(g.parole.length).toBeGreaterThan(0)
    expect(punti).toBeGreaterThan(100)
  })
})

describe('i leggii di due giocatori sullo stesso sacchetto', () => {
  it('alla partenza pesca otto tessere chi comincia, poi le altre otto l’avversario', () => {
    const sacchetto = sacchettoDaSeme(4)
    const { leggii, restanti } = leggiiDa(sacchetto, [], 2)
    expect(leggii[0]).toEqual(sacchetto.slice(0, TESSERE_LEGGIO))
    expect(leggii[1]).toEqual(sacchetto.slice(TESSERE_LEGGIO, 2 * TESSERE_LEGGIO))
    expect(restanti).toBe(sacchetto.length - 2 * TESSERE_LEGGIO)
  })

  it('con un giocatore solo e’ il leggio della classificata', () => {
    const sacchetto = sacchettoDelGiorno(12)
    const mosse: Mossa[] = [{ tipo: 'cambio', tessere: sacchetto.slice(0, 3) }, { tipo: 'passo' }]
    expect(leggiiDa(sacchetto, mosse, 1).leggii[0]).toEqual(leggioDa(sacchetto, mosse).leggio)
  })
})

describe('la partita libera contro il computer', () => {
  function giocaFinoInFondo(partita: PartitaLibera) {
    const sacchetto = sacchettoDaSeme(partita.seme)
    for (let giro = 0; giro < 400; giro += 1) {
      const stato = statoLibera(partita, sacchetto)
      if (stato.finita) return stato
      if (stato.turno === 'io') {
        // Chi gioca passa sempre: basta a far girare la partita.
        partita.mosse.push({ tipo: 'passo' })
      } else {
        const mossa = turnoDelComputer(dawg, partita, sacchetto)
        expect(mossa).not.toBeNull()
        partita.mosse.push(mossa!)
      }
    }
    return statoLibera(partita, sacchetto)
  }

  it('si alterna e va fino in fondo: chi resta con le tessere ne perde il valore, e dice chi ha vinto', () => {
    const partita: PartitaLibera = { seme: 77, livello: 'facile', mosse: [] }
    const iniziale = statoLibera(partita, sacchettoDaSeme(77))
    expect(iniziale.turno).toBe('io')
    expect(turnoDelComputer(dawg, partita, sacchettoDaSeme(77))).toBeNull()

    const fine = giocaFinoInFondo(partita)
    expect(fine.finita).toBe(true)
    expect(fine.turno).toBeNull()
    // Ben oltre le dieci mosse della giornata: la libera finisce quando finiscono le tessere.
    expect(fine.mosseComputer).toBeGreaterThan(MOSSE_A_TESTA)
    expect(fine.fine === 'chiusa' || fine.fine === 'ferma').toBe(true)
    // Chi passa sempre tiene le sue otto tessere, e alla fine ne perde il valore.
    expect(fine.aggiustamento.mio).toBe(-valoreLeggio(fine.mioLeggio))
    expect(fine.mieiPunti).toBe(fine.aggiustamento.mio)
    expect(fine.puntiComputer).toBeGreaterThan(0)
    expect(fine.esito).toBe('persa')
    if (fine.fine === 'chiusa') {
      // Chi chiude prende il valore delle tessere dell'altro.
      expect(fine.restanti).toBe(0)
      expect(fine.leggioComputer).toEqual([])
      expect(fine.aggiustamento.computer).toBe(valoreLeggio(fine.mioLeggio))
    }
  })

  it('con le regole della giornata finisce dopo dieci mosse a testa, senza il conto delle tessere', () => {
    const partita: PartitaLibera = { seme: 3, livello: 'normale', mosse: [] }
    const sacchetto = sacchettoDelGiorno(31)
    while (!statoLibera(partita, sacchetto, PARTITA_DEL_GIORNO).finita) {
      const stato = statoLibera(partita, sacchetto, PARTITA_DEL_GIORNO)
      if (stato.turno === 'io') partita.mosse.push({ tipo: 'passo' })
      else partita.mosse.push(rispostaDelGiorno(dawg, 31, partita.mosse)!)
    }
    const fine = statoLibera(partita, sacchetto, PARTITA_DEL_GIORNO)
    expect(fine.fine).toBe('mosse')
    expect(fine.mieMosse).toBe(MOSSE_A_TESTA)
    expect(fine.mosseComputer).toBe(MOSSE_A_TESTA)
    expect(fine.aggiustamento).toEqual({ mio: 0, computer: 0 })
    // Il computer del giorno non cambia mai le tessere: se non puo' posare, passa.
    expect(partita.mosse.filter((m, i) => i % 2 === 1 && m.tipo === 'cambio')).toEqual([])
    // A mosse uguali risponde uguale.
    expect(rispostaDelGiorno(dawg, 31, partita.mosse.slice(0, 1))).toEqual(partita.mosse[1])
    expect(rispostaDelGiorno(dawg, 31, partita.mosse.slice(0, 2))).toBeNull()
  })

  it('rigiocata dalle mosse, e’ la stessa partita', () => {
    const partita: PartitaLibera = { seme: 5, livello: 'normale', mosse: [] }
    giocaFinoInFondo(partita)
    const copia: PartitaLibera = { seme: 5, livello: 'normale', mosse: [] }
    giocaFinoInFondo(copia)
    expect(copia.mosse).toEqual(partita.mosse)
  })
})
