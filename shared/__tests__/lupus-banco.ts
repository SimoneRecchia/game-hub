import {
  IMPOSTAZIONI_LUPUS,
  applica,
  chiAspetta,
  nuovaPartita,
  type ImpostazioniLupus,
  type PartitaLupus,
  type SceltaNotturna,
} from '../lupus'
import type { Composizione } from '../lupus-composizione'
import type { IdPersonaggio } from '../lupus-personaggi'

/**
 * Una partita con i ruoli dati a mano, nell'ordine dei posti: p0, p1, ... La
 * partita nasce con il seme 42 come qualunque altra, poi i ruoli mescolati si
 * sostituiscono con quelli della prova: il caso che resta e' quello vero.
 */
export function partitaCon(ruoli: IdPersonaggio[], impostazioni: Partial<ImpostazioniLupus> = {}): PartitaLupus {
  const iscritti = ruoli.map((_, i) => ({ id: `p${i}`, nome: `Giocatore ${i}` }))
  const composizione: Composizione = {}
  for (const r of ruoli) composizione[r] = (composizione[r] ?? 0) + 1
  const partita = nuovaPartita(iscritti, composizione, { ...IMPOSTAZIONI_LUPUS, ...impostazioni }, 42, 1000)
  return {
    ...partita,
    giocatori: partita.giocatori.map((g, i) => ({ ...g, ruolo: ruoli[i] })),
  }
}

/** Tutti guardano il loro ruolo: comincia la prima notte. */
export function ruoliVisti(partita: PartitaLupus): PartitaLupus {
  let p = partita
  for (const g of partita.giocatori) p = applica(p, { tipo: 'ruolo_visto', giocatore: g.id }, 1000)
  return p
}

/**
 * Le scelte della notte, nell'ordine scritto: un id e' il bersaglio, 'letto'
 * conferma di aver letto, 'nessuno' salta un compito facoltativo, un sì o un no
 * dice al Baron se usare il potere.
 */
export function notte(partita: PartitaLupus, scelte: Record<string, string | boolean>): PartitaLupus {
  let p = partita
  for (const [giocatore, v] of Object.entries(scelte)) {
    const scelta: SceltaNotturna =
      v === 'letto'
        ? { tipo: 'letto' }
        : v === 'nessuno'
          ? { tipo: 'nessuno' }
          : typeof v === 'boolean'
            ? { tipo: 'potere', usa: v }
            : { tipo: 'indica', bersaglio: v }
    p = applica(p, { tipo: 'notte', giocatore, scelta }, 2000)
  }
  return p
}

export function voti(partita: PartitaLupus, v: Record<string, string | null>): PartitaLupus {
  let p = partita
  for (const [giocatore, bersaglio] of Object.entries(v)) {
    p = applica(p, { tipo: 'voto', giocatore, bersaglio }, 3000)
  }
  return p
}

/** Chi conduce manda avanti, una volta o piu'. */
export function avanti(partita: PartitaLupus, volte = 1): PartitaLupus {
  let p = partita
  for (let i = 0; i < volte; i += 1) p = applica(p, { tipo: 'avanti' }, 4000)
  return p
}

export function viviIn(partita: PartitaLupus): string[] {
  return partita.giocatori.filter((g) => g.vivo).map((g) => g.id)
}

/** Tutti i votanti che mancano votano `bersaglio`; il bersaglio stesso vota `ripiego`. */
export function tuttiVotano(partita: PartitaLupus, bersaglio: string, ripiego: string): PartitaLupus {
  const v: Record<string, string> = {}
  for (const id of chiAspetta(partita)) v[id] = id === bersaglio ? ripiego : bersaglio
  return voti(partita, v)
}
