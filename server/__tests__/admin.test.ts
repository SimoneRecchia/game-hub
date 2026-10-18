import { describe, expect, it } from 'vitest'
import type {
  AdminAnnunci,
  AdminCodice,
  AdminContenuti,
  AdminContenuto,
  AdminDatabase,
  AdminFortuna,
  AdminGiocatore,
  AdminGiocatori,
  AdminGiochi,
  AdminIo,
  AdminPanoramica,
  AdminRegistro,
  AdminSistema,
  AdminSqlRisultato,
  AdminErrori,
  AdminCloudflare,
} from '../../shared/admin'
import { gameDate, puzzleNumberFor } from '../../shared/daily'
import type { OggiRisposta } from '../../shared/types'
import { colonneDi } from '../lib/adminDati'
import { soloLettura } from '../routes/admin'
import { banco, type Giocatore } from './banco'

const PROPRIETARIO = 'capo@esempio.it'

/** Un banco con il proprietario: email confermata fra quelle di ADMIN_EMAILS. */
async function conIlProprietario() {
  const b = banco({ ADMIN_EMAILS: `altro@esempio.it, ${PROPRIETARIO.toUpperCase()}` })
  const capo = await b.giocatore('capo')
  conEmail(b.db, capo, PROPRIETARIO)
  return { ...b, capo }
}

function conEmail(db: ReturnType<typeof banco>['db'], chi: Giocatore, email: string, confermata = true) {
  db.sqlite
    .prepare('UPDATE players SET email = ?, email_lower = ?, email_verified_at = ? WHERE id = ?')
    .run(email, email.toLowerCase(), confermata ? new Date().toISOString() : null, chi.id)
}

/** Sblocca il pannello con il codice, che in locale torna nella risposta. */
async function sblocca(chiama: ReturnType<typeof banco>['chiama'], chi: Giocatore) {
  const codice = await chiama<AdminCodice>('POST', '/admin/codice', chi)
  expect(codice.status).toBe(200)
  const r = await chiama<AdminIo>('POST', '/admin/sblocca', chi, { codice: codice.dati.codiceDiProva })
  expect(r.status).toBe(200)
  return r.dati
}

describe('chi apre il pannello', () => {
  it('chi non e’ amministratore lo sa, e le rotte gli rispondono di no', async () => {
    const { chiama, giocatore } = banco({ ADMIN_EMAILS: PROPRIETARIO })
    const io = await giocatore('anna')
    expect((await chiama<AdminIo>('GET', '/admin/io', io)).dati).toEqual({
      admin: false,
      ruolo: null,
      sbloccatoFino: null,
      email: null,
    })
    const r = await chiama<{ code: string }>('GET', '/admin/panoramica', io)
    expect(r.status).toBe(403)
    expect(r.dati.code).toBe('NON_ADMIN')
    expect((await chiama('GET', '/admin/io', null)).status).toBe(401)
  })

  it('l’email del proprietario vale solo se e’ confermata', async () => {
    const { chiama, giocatore, db } = banco({ ADMIN_EMAILS: PROPRIETARIO })
    const furbo = await giocatore('furbo')
    conEmail(db, furbo, PROPRIETARIO, false)
    expect((await chiama<AdminIo>('GET', '/admin/io', furbo)).dati.admin).toBe(false)
  })

  it('il proprietario apre il pannello solo con il codice mandato all’email', async () => {
    const { chiama, capo } = await conIlProprietario()
    const io = (await chiama<AdminIo>('GET', '/admin/io', capo)).dati
    expect(io).toMatchObject({ admin: true, ruolo: 'proprietario', sbloccatoFino: null, email: 'ca•••@esempio.it' })
    const bloccato = await chiama<{ code: string }>('GET', '/admin/panoramica', capo)
    expect(bloccato.status).toBe(403)
    expect(bloccato.dati.code).toBe('ADMIN_BLOCCATO')

    const codice = await chiama<AdminCodice>('POST', '/admin/codice', capo)
    expect(codice.dati.codiceDiProva).toMatch(/^\d{6}$/)
    // Un altro codice subito no: uno al minuto.
    expect((await chiama('POST', '/admin/codice', capo)).status).toBe(429)
    const sbagliato = codice.dati.codiceDiProva === '000000' ? '111111' : '000000'
    expect((await chiama('POST', '/admin/sblocca', capo, { codice: sbagliato })).status).toBe(400)
    const aperto = await chiama<AdminIo>('POST', '/admin/sblocca', capo, { codice: codice.dati.codiceDiProva })
    expect(Date.parse(aperto.dati.sbloccatoFino ?? '')).toBeGreaterThan(Date.now() + 11 * 3_600_000)
    // Il codice si usa una volta.
    expect((await chiama('POST', '/admin/sblocca', capo, { codice: codice.dati.codiceDiProva })).status).toBe(400)
    expect((await chiama('GET', '/admin/panoramica', capo)).status).toBe(200)

    await chiama('POST', '/admin/blocca', capo)
    expect((await chiama('GET', '/admin/panoramica', capo)).status).toBe(403)
  })

  it('cinque tentativi sbagliati bruciano il codice', async () => {
    const { chiama, capo } = await conIlProprietario()
    const codice = (await chiama<AdminCodice>('POST', '/admin/codice', capo)).dati.codiceDiProva!
    const sbagliato = codice === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i += 1) await chiama('POST', '/admin/sblocca', capo, { codice: sbagliato })
    expect((await chiama('POST', '/admin/sblocca', capo, { codice })).status).toBe(400)
  })
})

describe('i giocatori', () => {
  it('si cercano, si modificano e restano unici', async () => {
    const { chiama, giocatore, capo, db } = await conIlProprietario()
    const anna = await giocatore('anna')
    await giocatore('bruno')
    conEmail(db, anna, 'anna@esempio.it')
    await sblocca(chiama, capo)

    const tutti = (await chiama<AdminGiocatori>('GET', '/admin/giocatori', capo)).dati
    expect(tutti.totale).toBe(3)
    const cercati = (await chiama<AdminGiocatori>('GET', '/admin/giocatori?q=ann', capo)).dati
    expect(cercati.righe.map((r) => r.nickname)).toEqual(['anna'])
    const capi = (await chiama<AdminGiocatori>('GET', '/admin/giocatori?filtro=amministratori', capo)).dati
    expect(capi.righe.map((r) => [r.nickname, r.ruolo])).toEqual([['capo', 'proprietario']])
    // Un trattino basso non e' un jolly del LIKE.
    expect((await chiama<AdminGiocatori>('GET', '/admin/giocatori?q=_', capo)).dati.totale).toBe(0)

    const preso = await chiama<{ code: string }>('PATCH', `/admin/giocatori/${anna.id}`, capo, { nickname: 'Bruno' })
    expect(preso.status).toBe(409)
    const cambiato = await chiama<AdminGiocatore>('PATCH', `/admin/giocatori/${anna.id}`, capo, {
      nickname: 'annina',
      email: 'nuova@esempio.it',
    })
    expect(cambiato.status).toBe(200)
    expect(cambiato.dati.giocatore).toMatchObject({
      nickname: 'annina',
      displayName: 'annina',
      email: 'nuova@esempio.it',
      emailVerificata: false,
    })
    const registro = (await chiama<AdminRegistro>('GET', '/admin/registro', capo)).dati
    expect(registro.voci[0]).toMatchObject({ azione: 'giocatore.modifica', oggetto: 'anna', admin: { nickname: 'capo' } })
  })

  it('un account sospeso esce da tutto, e non rientra', async () => {
    const { chiama, giocatore, capo } = await conIlProprietario()
    const anna = await giocatore('anna')
    await sblocca(chiama, capo)
    expect((await chiama('GET', '/oggi', anna)).status).toBe(200)
    const r = await chiama<AdminGiocatore>('PATCH', `/admin/giocatori/${anna.id}`, capo, { sospeso: true })
    expect(r.dati.giocatore.sospeso).toBe(true)
    expect(r.dati.sessioni).toEqual([])
    expect((await chiama('GET', '/oggi', anna)).status).toBe(401)
    // Il proprietario non si sospende.
    expect((await chiama('PATCH', `/admin/giocatori/${capo.id}`, capo, { sospeso: true })).status).toBe(409)
  })

  it('il ruolo lo da’ il proprietario, e un amministratore non tocca il proprietario', async () => {
    const { chiama, giocatore, capo, db } = await conIlProprietario()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    conEmail(db, anna, 'anna@esempio.it')
    await sblocca(chiama, capo)
    const nominata = await chiama<AdminGiocatore>('PATCH', `/admin/giocatori/${anna.id}`, capo, { ruolo: 'admin' })
    expect(nominata.dati.giocatore.ruolo).toBe('admin')

    expect((await chiama<AdminIo>('GET', '/admin/io', anna)).dati.ruolo).toBe('admin')
    await sblocca(chiama, anna)
    expect((await chiama('PATCH', `/admin/giocatori/${bruno.id}`, anna, { ruolo: 'admin' })).status).toBe(403)
    expect((await chiama('PATCH', `/admin/giocatori/${capo.id}`, anna, { displayName: 'Capo' })).status).toBe(403)
    expect((await chiama('POST', `/admin/giocatori/${capo.id}/esci`, anna)).status).toBe(403)
    expect((await chiama('PATCH', `/admin/giocatori/${bruno.id}`, anna, { displayName: 'Brunetto' })).status).toBe(200)
  })

  it('si azzera la giornata di un gioco, e si elimina un account con tutto il suo', async () => {
    const { chiama, giocatore, capo, db } = await conIlProprietario()
    const anna = await giocatore('anna')
    await sblocca(chiama, capo)
    const numero = puzzleNumberFor(gameDate())
    db.sqlite
      .prepare(
        `INSERT INTO catena_partite (id, player_id, puzzle_number, date, status, started_at, updated_at, score)
         VALUES ('c1', ?, ?, ?, 'done', ?, ?, 84)`,
      )
      .run(anna.id, numero, gameDate(), new Date().toISOString(), new Date().toISOString())
    const prima = (await chiama<AdminGiocatore>('GET', `/admin/giocatori/${anna.id}`, capo)).dati
    expect(prima.giochi.find((g) => g.gioco === 'catena')).toMatchObject({ giornate: 1, punti: 84, oggi: { stato: 'finita', punti: 84 } })

    const azzerata = await chiama<AdminGiocatore>('POST', `/admin/giocatori/${anna.id}/azzera`, capo, { gioco: 'catena' })
    expect(azzerata.dati.giochi.find((g) => g.gioco === 'catena')?.oggi).toBeNull()
    expect((await chiama('POST', `/admin/giocatori/${anna.id}/azzera`, capo, { gioco: 'catena' })).status).toBe(404)
    expect((await chiama('POST', `/admin/giocatori/${anna.id}/azzera`, capo, { gioco: 'nomi' })).status).toBe(400)

    expect((await chiama('DELETE', `/admin/giocatori/${anna.id}`, capo, { conferma: 'Anna' })).status).toBe(400)
    expect((await chiama('DELETE', `/admin/giocatori/${anna.id}`, capo, { conferma: 'anna' })).status).toBe(200)
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE player_id = ?').get(anna.id)?.n).toBe(0)
    expect((await chiama('GET', `/admin/giocatori/${anna.id}`, capo)).status).toBe(404)
    expect((await chiama('DELETE', `/admin/giocatori/${capo.id}`, capo, { conferma: 'capo' })).status).toBe(409)
  })
})

describe('i numeri del pannello', () => {
  it('ogni schermata risponde, e la presenza segna i giorni attivi', async () => {
    const { chiama, giocatore, capo } = await conIlProprietario()
    const anna = await giocatore('anna')
    await chiama('POST', '/presenza', anna, { attivita: 'altro' })
    await sblocca(chiama, capo)

    const p = (await chiama<AdminPanoramica>('GET', '/admin/panoramica', capo)).dati
    expect(p.giocatori.totali).toBe(2)
    expect(p.attivi).toMatchObject({ online: 1, oggi: 1, mese: 1 })
    expect(p.serieAttivi).toHaveLength(30)
    expect(p.serieAttivi[29]).toEqual({ data: gameDate(), valore: 1 })
    expect(p.serieIscrizioni[29].valore).toBe(2)
    expect(p.partiteOggi).toHaveLength(10)
    expect(p.database.tabelle).toBeGreaterThan(50)

    const giochi = (await chiama<AdminGiochi>('GET', '/admin/giochi', capo)).dati
    expect(giochi.giochi).toHaveLength(10)
    expect(giochi.giochi[0].giorni).toHaveLength(14)

    const contenuti = (await chiama<AdminContenuti>('GET', '/admin/contenuti', capo)).dati
    expect(contenuti.giorni).toHaveLength(18)
    expect(contenuti.contenuti.find((x) => x.contenuto === 'wordle')?.pronti.every(Boolean)).toBe(true)
    expect(contenuti.contenuti.find((x) => x.contenuto === 'catena')?.pronti.some(Boolean)).toBe(false)
    const parola = (await chiama<AdminContenuto>('GET', `/admin/contenuti/wordle/${contenuti.oggi}`, capo)).dati
    expect(parola.dati).toMatchObject({ fissata: false })
    expect((await chiama('GET', `/admin/contenuti/catena/${contenuti.oggi}`, capo)).status).toBe(404)

    const f = (await chiama<AdminFortuna>('GET', '/admin/fortuna', capo)).dati
    expect(f.oggi[0]).toMatchObject({ gioco: 'crazy-time', giocate: 0, netto: 0 })
    expect(f.serie).toHaveLength(30)

    const d = (await chiama<AdminDatabase>('GET', '/admin/database', capo)).dati
    const giocatori = d.tabelle.find((t) => t.nome === 'players')
    expect(giocatori?.colonne).toEqual(expect.arrayContaining(['id', 'nickname', 'ruolo', 'sospeso_at']))
    const righe = await chiama<{ conteggi: Record<string, number> }>('GET', '/admin/database/righe?tabelle=players,nulla', capo)
    expect(righe.dati.conteggi).toEqual({ players: 2 })

    const s = (await chiama<AdminSistema>('GET', '/admin/sistema', capo)).dati
    expect(s.amministratori).toEqual([{ id: capo.id, nickname: 'capo', email: PROPRIETARIO, ruolo: 'proprietario' }])

    const cf = (await chiama<AdminCloudflare>('GET', '/admin/cloudflare', capo)).dati
    expect(cf).toMatchObject({ configurato: false, mancano: ['CF_ACCOUNT_ID', 'CF_API_TOKEN'] })
  })
})

describe('la console SQL', () => {
  it('in lettura passa solo quel che non scrive', () => {
    expect(soloLettura('SELECT * FROM players')).toBe(true)
    expect(soloLettura("select 'delete from players' as x")).toBe(true)
    expect(soloLettura('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true)
    expect(soloLettura('PRAGMA table_info(players)')).toBe(true)
    expect(soloLettura('PRAGMA foreign_keys = OFF')).toBe(false)
    expect(soloLettura('WITH x AS (SELECT 1) DELETE FROM players')).toBe(false)
    expect(soloLettura('DELETE FROM players')).toBe(false)
    expect(soloLettura('SELECT 1; DROP TABLE players')).toBe(false)
    expect(soloLettura('/* select */ UPDATE players SET nickname = 1')).toBe(false)
  })

  it('legge, e scrive solo con la scrittura accesa, nel registro', async () => {
    const { chiama, capo } = await conIlProprietario()
    await sblocca(chiama, capo)
    const letto = await chiama<AdminSqlRisultato>('POST', '/admin/sql', capo, { sql: 'SELECT nickname, 1 + 1 AS due FROM players' })
    expect(letto.dati).toMatchObject({ colonne: ['nickname', 'due'], righe: [['capo', 2]], troncato: false })
    const rifiutato = await chiama<{ code: string }>('POST', '/admin/sql', capo, { sql: "UPDATE players SET display_name = 'x'" })
    expect(rifiutato.dati.code).toBe('SOLO_LETTURA')
    const errore = await chiama<{ error: string }>('POST', '/admin/sql', capo, { sql: 'SELECT * FROM nessuna' })
    expect(errore.status).toBe(400)
    expect(errore.dati.error).toContain('nessuna')
    const scritto = await chiama('POST', '/admin/sql', capo, { sql: "UPDATE players SET display_name = 'Capo'", scrittura: true })
    expect(scritto.status).toBe(200)
    const registro = (await chiama<AdminRegistro>('GET', '/admin/registro', capo)).dati
    expect(registro.voci[0]).toMatchObject({ azione: 'sql.scrittura' })
  })
})

describe('gli annunci e gli errori', () => {
  it('un annuncio acceso arriva con le Giornaliere, e spento no', async () => {
    const { chiama, giocatore, capo } = await conIlProprietario()
    const anna = await giocatore('anna')
    await sblocca(chiama, capo)
    expect((await chiama<OggiRisposta>('GET', '/oggi', anna)).dati.annuncio).toBeNull()
    const elenco = (
      await chiama<AdminAnnunci>('POST', '/admin/annunci', capo, { testo: 'Stasera manutenzione', tono: 'avviso', fino: null })
    ).dati
    expect(elenco.annunci).toHaveLength(1)
    const id = elenco.annunci[0].id
    expect((await chiama<OggiRisposta>('GET', '/oggi', anna)).dati.annuncio).toEqual({
      id,
      testo: 'Stasera manutenzione',
      tono: 'avviso',
    })
    await chiama('PATCH', `/admin/annunci/${id}`, capo, { attivo: false })
    expect((await chiama<OggiRisposta>('GET', '/oggi', anna)).dati.annuncio).toBeNull()
    // Scaduto non si vede.
    await chiama('PATCH', `/admin/annunci/${id}`, capo, { attivo: true, fino: new Date(Date.now() - 1000).toISOString() })
    expect((await chiama<OggiRisposta>('GET', '/oggi', anna)).dati.annuncio).toBeNull()
    expect((await chiama('POST', '/admin/annunci', capo, { testo: 'x'.repeat(300) })).status).toBe(400)
  })

  it('un errore del server finisce nel pannello', async () => {
    const { chiama, giocatore, capo, db } = await conIlProprietario()
    const anna = await giocatore('anna')
    await sblocca(chiama, capo)
    db.sqlite.exec('DROP TABLE annunci')
    expect((await chiama('GET', '/oggi', anna)).status).toBe(500)
    const errori = (await chiama<AdminErrori>('GET', '/admin/errori', capo)).dati
    expect(errori.totale).toBe(1)
    expect(errori.errori[0]).toMatchObject({ metodo: 'GET', percorso: '/api/oggi', giocatore: 'anna' })
    expect((await chiama<AdminErrori>('DELETE', '/admin/errori', capo)).dati.totale).toBe(0)
  })
})

describe('le colonne di una tabella', () => {
  it('si leggono dal CREATE, senza i vincoli', () => {
    expect(
      colonneDi(`CREATE TABLE t (
        a TEXT PRIMARY KEY, -- la chiave, con una virgola, nel commento
        b INTEGER NOT NULL CHECK (b IN (1, 2)),
        "c" TEXT,
        PRIMARY KEY (a, b),
        FOREIGN KEY (a) REFERENCES x(id)
      )`),
    ).toEqual(['a', 'b', 'c'])
  })
})
