import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Le materie con un file solo; "Accadde oggi" ha una cartella, un file per giorno. */
export const FILE_MATERIE = ['arte', 'libri', 'cinema', 'lirica', 'nobel', 'storia', 'scienza'] as const

function versioneDi(file: string): string {
  const v = (JSON.parse(readFileSync(file, 'utf8')) as { versione?: unknown }).versione
  if (typeof v !== 'string' || !/^[0-9a-f]{6,40}$/.test(v)) throw new Error(`${file}: senza versione`)
  return v
}

/**
 * Le impronte dei file di `cartella` (public/dati/quiz): quella di ogni
 * materia, e una per tutti i giorni di "Accadde oggi". Un file che manca non
 * ha impronta, e l'app lo scarichera' senza.
 */
export function versioniCultura(cartella: string): Record<string, string> {
  const fuori: Record<string, string> = {}
  for (const m of FILE_MATERIE) {
    const file = join(cartella, `${m}.json`)
    if (existsSync(file)) fuori[m] = versioneDi(file)
  }
  const giorni = join(cartella, 'oggi')
  if (existsSync(giorni)) {
    const file = readdirSync(giorni)
      .filter((f) => /^\d{2}-\d{2}\.json$/.test(f))
      .sort()
    if (file.length > 0) {
      const tutte = file.map((f) => `${f}:${versioneDi(join(giorni, f))}`).join('\n')
      fuori.oggi = createHash('sha1').update(tutte).digest('hex').slice(0, 10)
    }
  }
  return fuori
}
