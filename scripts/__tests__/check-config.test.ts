import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — script di build in JavaScript, senza dichiarazioni di tipo
import { PLACEHOLDER, configProblem } from '../check-config.mjs'

const VALIDO = `
name = "game-hub"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "game-hub-db"
database_id = "a1b2c3d4-5e6f-7890-abcd-ef1234567890"
`

describe('controllo della configurazione di deploy', () => {
  it('non segnala nulla con un ID vero', () => {
    expect(configProblem(VALIDO)).toBeNull()
  })

  it('segnala il segnaposto lasciato al suo posto', () => {
    const problema = configProblem(VALIDO.replace(/database_id = ".*"/, `database_id = "${PLACEHOLDER}"`))
    expect(problema).toContain("manca l'ID del database D1")
    // Il messaggio deve dire cosa fare, non solo che c'e' un problema.
    expect(problema).toContain('wrangler d1 create game-hub-db')
    expect(problema).toContain('DEPLOY.md')
  })

  it('segnala un file senza dichiarazione del database', () => {
    expect(configProblem('name = "game-hub"\n')).toContain('nessun database D1')
  })

  it('segnala un file vuoto o illeggibile', () => {
    expect(configProblem('')).toContain('illeggibile')
    expect(configProblem('   \n ')).toContain('illeggibile')
    expect(configProblem(undefined)).toContain('illeggibile')
  })

  it('il wrangler.toml del repository dichiara un database D1', () => {
    // Il segnaposto qui e' atteso finché il progetto non viene collegato a
    // Cloudflare: quello che conta e' che la dichiarazione ci sia.
    const reale = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
    expect(reale).toContain('[[d1_databases]]')
    expect(reale).toContain('binding = "DB"')
  })
})
