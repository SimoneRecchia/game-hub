import { describe, expect, it } from 'vitest'
import { nomeDaFile } from '../foto'
import { nomiDaElenco, problemaDelSet } from '../setFile'

describe('il nome di partenza di una foto', () => {
  it('viene dal nome del file quando dice qualcosa', () => {
    expect(nomeDaFile('giulia_mare.jpg')).toBe('Giulia mare')
    expect(nomeDaFile('zio-carlo.png')).toBe('Zio carlo')
  })

  it('resta vuoto per i nomi delle fotocamere', () => {
    for (const f of ['IMG_2041.HEIC', 'DSC00012.JPG', 'PXL_20260101_101010.jpg', '1234.jpg', 'Screenshot 2026-09-28.png']) {
      expect(nomeDaFile(f), f).toBe('')
    }
  })
})

describe('un set pronto per giocare', () => {
  const voci = (nomi: string[]) => nomi.map((nome, i) => ({ nome, img: `${i}`.repeat(32) }))

  it('ha almeno sei personaggi, tutti con un nome, tutti diversi', () => {
    expect(problemaDelSet({ voci: voci(['A', 'B', 'C', 'D', 'E', 'F']) })).toBeNull()
    expect(problemaDelSet({ voci: voci(['A', 'B', 'C']) })).toMatch(/almeno 6/)
    expect(problemaDelSet({ voci: voci(['A', 'B', 'C', 'D', 'E', '  ']) })).toMatch(/nome/)
    expect(problemaDelSet({ voci: voci(['A', 'B', 'C', 'D', 'E', 'a']) })).toMatch(/stesso nome/)
  })
})

describe('un set di soli nomi', () => {
  it('e’ pronto come uno con le foto', () => {
    expect(problemaDelSet({ voci: ['A', 'B', 'C', 'D', 'E', 'F'].map((nome) => ({ nome })) })).toBeNull()
  })

  it('si scrive un nome per riga, o separati da virgole, e si incolla con i segni degli elenchi', () => {
    expect(nomiDaElenco('Anna\nBruno\n\n  Carla  ', [], 30).nomi).toEqual(['Anna', 'Bruno', 'Carla'])
    expect(nomiDaElenco('Anna, Bruno; Carla', [], 30).nomi).toEqual(['Anna', 'Bruno', 'Carla'])
    expect(nomiDaElenco('1. Anna\n2) Bruno\n- Carla\n• Dario', [], 30).nomi).toEqual(['Anna', 'Bruno', 'Carla', 'Dario'])
    // Su piu' righe la virgola resta nel nome.
    expect(nomiDaElenco('Rossi, Mario\nBianchi, Anna', [], 30).nomi).toEqual(['Rossi, Mario', 'Bianchi, Anna'])
  })

  it('lascia fuori i doppioni, quelli gia’ nel set e quelli oltre il posto che resta', () => {
    expect(nomiDaElenco('Anna\nanna\nBruno\nCarla\nDario', ['bruno'], 2)).toEqual({
      nomi: ['Anna', 'Carla'],
      doppi: 2,
      oltre: 1,
    })
  })
})
