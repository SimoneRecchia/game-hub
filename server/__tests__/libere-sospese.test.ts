import { describe, expect, it } from 'vitest'
import type { AdminCodice, AdminGiochi, AdminIo } from '../../shared/admin'
import { gameDate } from '../../shared/daily'
import { SOSPESA_MS } from '../../shared/sospese'
import { banco } from './banco'

const PROPRIETARIO = 'capo@esempio.it'

describe('le libere in sospeso', () => {
  it('il telefono racconta che cosa succede, e il pannello conta', async () => {
    const b = banco({ ADMIN_EMAILS: PROPRIETARIO })
    const capo = await b.giocatore('capo')
    b.db.sqlite
      .prepare('UPDATE players SET email = ?, email_lower = ?, email_verified_at = ? WHERE id = ?')
      .run(PROPRIETARIO, PROPRIETARIO, new Date().toISOString(), capo.id)
    const anna = await b.giocatore('anna')
    const evento = (id: string, gioco: string, e: string) =>
      b.chiama('POST', '/libere/sospese', anna, { id, gioco, evento: e })

    expect((await evento('sudoku-0001', 'sudoku', 'inizio')).status).toBe(204)
    expect((await evento('sudoku-0001', 'sudoku', 'ripresa')).status).toBe(204)
    expect((await evento('wordle-0001', 'wordle', 'inizio')).status).toBe(204)
    expect((await evento('wordle-0001', 'wordle', 'finita')).status).toBe(204)
    // Una partita chiusa non si riapre con un evento arrivato dopo.
    expect((await evento('wordle-0001', 'wordle', 'ripresa')).status).toBe(204)
    expect((await evento('scacchi-001', 'scacchi', 'inizio')).status).toBe(204)
    // Una partita che nessuno tocca da tre giorni e' scaduta anche se il telefono non lo dice.
    b.db.sqlite
      .prepare("UPDATE libere_sospese SET toccata_at = ? WHERE id = 'scacchi-001'")
      .run(new Date(Date.now() - SOSPESA_MS - 60_000).toISOString())

    expect((await evento('x', 'sudoku', 'inizio')).status).toBe(400)
    expect((await evento('sudoku-0002', 'lotto', 'inizio')).status).toBe(400)
    expect((await evento('sudoku-0002', 'sudoku', 'vinta')).status).toBe(400)

    const codice = await b.chiama<AdminCodice>('POST', '/admin/codice', capo)
    await b.chiama<AdminIo>('POST', '/admin/sblocca', capo, { codice: codice.dati.codiceDiProva })
    const { sospese } = (await b.chiama<AdminGiochi>('GET', '/admin/giochi', capo)).dati
    expect(sospese).toMatchObject({ adesso: 1, create: 3, riprese: 1, finite: 1, annullate: 0, scadute: 1 })
    expect(sospese.perGioco).toEqual([{ gioco: 'sudoku', adesso: 1 }])
    expect(sospese.giorni).toHaveLength(14)
    expect(sospese.giorni[13]).toEqual({ data: gameDate(), create: 3, riprese: 1, scadute: 0 })
  })
})
