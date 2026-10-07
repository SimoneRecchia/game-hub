import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Dawg } from '../../shared/dawg'
import { tabelloneDa, tabelloneVuoto } from '../../shared/scarabeo'
import { mossaInTesto, type VistaScarabeo } from '../../shared/scarabeo-amici'
import { mosseLegali } from '../../shared/scarabeo-motore'
import type { InvitoConLink, PresenzaRisposta, SalaTavolo, VistaTavolo } from '../../shared/types'
import { banco, type Giocatore } from './banco'

// Un leggio a caso, una volta su trecento, non ha nessuna parola da posare sulla stella, e il test cadeva:
// le partite hanno semi fissi, e ognuno ha una parola per cominciare.
vi.mock('../../shared/scarabeo-amici', async (originale) => {
  const vero = await originale<typeof import('../../shared/scarabeo-amici')>()
  const semi = [3_141_592_653, 2_718_281_828, 1_618_033_988, 1_414_213_562, 1_732_050_807, 2_236_067_977]
  let n = 0
  return { ...vero, semeACaso: () => semi[n++ % semi.length] }
})

const dawg = Dawg.da(readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg')))

type Chiama = ReturnType<typeof banco>['chiama']

const vista = async (chiama: Chiama, id: string, chi: Giocatore) =>
  (await chiama<VistaTavolo>('GET', `/tavolo/partite/${id}`, chi)).dati
const scarabeo = (v: VistaTavolo) => JSON.parse(v.posizione) as VistaScarabeo

async function muovi(chiama: Chiama, id: string, chi: Giocatore, mossa: string) {
  const prima = await vista(chiama, id, chi)
  return chiama<VistaTavolo & { code?: string; error?: string }>('POST', `/tavolo/partite/${id}/mossa`, chi, {
    mossa,
    versione: prima.versione,
  })
}

/** Anna invita Bruno a Scarabeo, Bruno accetta: chi comincia e chi risponde. */
async function partita(chiama: Chiama, anna: Giocatore, bruno: Giocatore) {
  await chiama('POST', '/presenza', bruno, { attivita: 'scarabeo' })
  const invito = await chiama<{ id: string }>('POST', '/tavolo/inviti', anna, { gioco: 'scarabeo', playerId: bruno.id })
  expect(invito.status).toBe(201)
  const { partitaId } = (await chiama<{ partitaId: string }>('POST', `/tavolo/inviti/${invito.dati.id}/accetta`, bruno))
    .dati
  const a = await vista(chiama, partitaId, anna)
  return { id: partitaId, primo: a.parte === 0 ? anna : bruno, secondo: a.parte === 0 ? bruno : anna }
}

describe('lo Scarabeo fra amici, sul tavolo del server', () => {
  it('ognuno vede il suo leggio, e nessuno il sacchetto', async () => {
    const { chiama, giocatore, db } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const { id, primo, secondo } = await partita(chiama, anna, bruno)

    const mia = await vista(chiama, id, primo)
    const sua = await vista(chiama, id, secondo)
    expect(mia).toMatchObject({ gioco: 'scarabeo', stato: 'in_corso', tuoTurno: true, mosse: [] })
    expect(sua.tuoTurno).toBe(false)
    const v1 = scarabeo(mia)
    const v2 = scarabeo(sua)
    expect(v1.leggio).toHaveLength(8)
    expect(v2.leggio).toHaveLength(8)
    expect(v1).toMatchObject({ tessereAltro: 8, restanti: 120 - 16, punti: { io: 0, altro: 0 }, leggioAltro: null })
    // Il seme non esce, e del leggio dell'altro si sa solo quante tessere ha.
    const salvata = db.sqlite.prepare('SELECT posizione FROM tavolo_partite WHERE id = ?').get(id)?.posizione
    const seme = String((JSON.parse(String(salvata)) as { s: number }).s)
    expect(mia.posizione).not.toContain(seme)
    expect(mia.posizione).not.toMatch(/"(s|seme)":/)
    expect(Object.keys(v1).sort()).toEqual(
      ['aggiustamento', 'fine', 'leggio', 'leggioAltro', 'mosse', 'punti', 'restanti', 'tessereAltro'].sort(),
    )
  })

  it('una posa passa dalle regole e dal dizionario, e il turno passa all’altro', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('carla')
    const bruno = await giocatore('dario')
    const { id, primo, secondo } = await partita(chiama, anna, bruno)
    const leggio = scarabeo(await vista(chiama, id, primo)).leggio

    // Fuori turno, fuori dalla stella, con una tessera che non ha, con una parola che non c'e'.
    const migliore = mosseLegali(dawg, tabelloneVuoto(), leggio, true).sort((a, b) => b.punti - a.punti)[0]
    const posa = mossaInTesto({ tipo: 'posa', posa: migliore.posa })
    expect((await muovi(chiama, id, secondo, posa)).dati.code).toBe('NON_TOCCA')
    const spostata = mossaInTesto({ tipo: 'posa', posa: migliore.posa.map((p) => ({ ...p, r: 0 })) })
    expect((await muovi(chiama, id, primo, spostata)).dati.code).toBe('MOSSA')
    const mancante = 'abcdefghilmnopqrstuvz'.split('').find((l) => !leggio.includes(l))!
    expect((await muovi(chiama, id, primo, `7.7.${mancante} 7.8.${mancante}`)).dati.code).toBe('MOSSA')
    // Quattro tessere sulla stella in un ordine che non fa una parola: fra i giri delle stesse ce n'e' sempre uno.
    const lettere = leggio.filter((t) => t !== '*').slice(0, 4)
    const finta = [0, 1, 2, 3]
      .map((k) => [...lettere.slice(k), ...lettere.slice(0, k)])
      .find((giro) => !dawg.contiene(giro.join('')))!
    const sconosciuta = await muovi(chiama, id, primo, finta.map((l, i) => `7.${5 + i}.${l}`).join(' '))
    expect(sconosciuta.status).toBe(422)
    expect(sconosciuta.dati.code).toBe('PAROLA_SCONOSCIUTA')

    const r = await muovi(chiama, id, primo, posa)
    expect(r.status).toBe(200)
    const dopo = scarabeo(r.dati)
    expect(r.dati.tuoTurno).toBe(false)
    expect(dopo.punti.io).toBe(migliore.punti)
    expect(dopo.leggio).toHaveLength(8)
    expect(dopo.mosse).toEqual([{ tipo: 'posa', posa: migliore.posa }])
    const perLui = scarabeo(await vista(chiama, id, secondo))
    expect(perLui.punti).toEqual({ io: 0, altro: migliore.punti })
    expect(perLui.restanti).toBe(120 - 16 - migliore.posa.length)
    expect(tabelloneDa(perLui.mosse).filter(Boolean)).toHaveLength(migliore.posa.length)
  })

  it('i cambi dell’altro si vedono senza le tessere', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('elena')
    const bruno = await giocatore('franco')
    const { id, primo, secondo } = await partita(chiama, anna, bruno)
    const leggio = scarabeo(await vista(chiama, id, primo)).leggio
    const cambiate = leggio.slice(0, 3)
    const r = await muovi(chiama, id, primo, mossaInTesto({ tipo: 'cambio', tessere: cambiate }))
    expect(r.status).toBe(200)
    expect(scarabeo(r.dati).mosse).toEqual([{ tipo: 'cambio', tessere: cambiate }])
    expect(scarabeo(await vista(chiama, id, secondo)).mosse).toEqual([{ tipo: 'cambio', tessere: [] }])
    // Cambiare una tessera che non si ha non vale.
    const suo = scarabeo(await vista(chiama, id, secondo)).leggio
    const mancante = 'abcdefghilmnopqrstuvz'.split('').find((l) => !suo.includes(l))!
    expect((await muovi(chiama, id, secondo, `cambio:${mancante}`)).dati.code).toBe('MOSSA')
  })

  it('sei turni senza parole chiudono la partita, e ognuno perde le sue tessere', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('gina')
    const bruno = await giocatore('ivo')
    const { id, primo, secondo } = await partita(chiama, anna, bruno)
    const leggio = scarabeo(await vista(chiama, id, primo)).leggio
    const migliore = mosseLegali(dawg, tabelloneVuoto(), leggio, true).sort((a, b) => b.punti - a.punti)[0]
    await muovi(chiama, id, primo, mossaInTesto({ tipo: 'posa', posa: migliore.posa }))
    let ultima: VistaTavolo | null = null
    for (let i = 0; i < 6; i += 1) ultima = (await muovi(chiama, id, i % 2 === 0 ? secondo : primo, 'passo')).dati
    expect(ultima!.stato).toBe('finita')
    expect(ultima!.motivo).toBe('ferma')
    const fine = scarabeo(await vista(chiama, id, primo))
    expect(fine.fine).toBe('ferma')
    expect(fine.leggioAltro).toHaveLength(8)
    expect(fine.aggiustamento.io).toBeLessThan(0)
    expect(fine.punti.io).toBe(migliore.punti + fine.aggiustamento.io)
    const perLui = await vista(chiama, id, secondo)
    const atteso = fine.punti.io === fine.punti.altro ? null : fine.punti.io > fine.punti.altro ? 'avversario' : 'io'
    expect(perLui.vincitore).toBe(atteso)
    const sala = (await chiama<SalaTavolo>('GET', '/tavolo/sala?gioco=scarabeo', primo)).dati
    expect(sala.record.vinte + sala.record.perse + sala.record.patte).toBe(1)

    // La rivincita si gioca con un sacchetto nuovo.
    await chiama('POST', '/presenza', secondo, { attivita: 'scarabeo' })
    const chiesta = await chiama<{ invitoId: string }>('POST', `/tavolo/partite/${id}/rivincita`, primo)
    expect(chiesta.status).toBe(201)
    await chiama('POST', '/presenza', primo, { attivita: 'scarabeo' })
    const accettata = await chiama<{ partitaId: string }>('POST', `/tavolo/partite/${id}/rivincita`, secondo)
    const nuova = await vista(chiama, accettata.dati.partitaId, primo)
    expect(nuova.stato).toBe('in_corso')
    const iniziali = [scarabeo(nuova).leggio.join(''), scarabeo(await vista(chiama, nuova.id, secondo)).leggio.join('')]
    expect(iniziali).not.toContain(leggio.join(''))
  })

  it('si invita anche con un link, e l’invito dice a che gioco', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('lia')
    const creato = await chiama<{ id: string; codice: string }>('POST', '/tavolo/inviti', anna, { gioco: 'scarabeo' })
    expect(creato.status).toBe(201)
    const invito = (await chiama<InvitoConLink>('GET', `/inviti/${creato.dati.codice}`, null)).dati
    expect(invito).toMatchObject({ gioco: 'scarabeo', stato: 'attesa', da: { displayName: 'lia' } })
    const bruno = await giocatore('mario')
    const aperta = await chiama<{ partitaId: string; gioco: string }>(
      'POST',
      `/tavolo/link/${creato.dati.codice}/accetta`,
      bruno,
    )
    expect(aperta.dati.gioco).toBe('scarabeo')
    const presenza = (await chiama<PresenzaRisposta>('POST', '/presenza', anna, { attivita: 'hub' })).dati
    expect(presenza.partitaTavolo).toMatchObject({ id: aperta.dati.partitaId, gioco: 'scarabeo' })
  })
})
