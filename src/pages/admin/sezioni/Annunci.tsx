import { useId, useState, type FormEvent } from 'react'
import type { AdminAnnunci, Annuncio, TonoAnnuncio } from '@shared/admin'
import { MASSIMO_TESTO_ANNUNCIO } from '@shared/admin'
import { AvvisoATutti } from '@/components/AvvisoATutti'
import { Button } from '@/components/Button'
import { Interruttore } from '@/components/Interruttore'
import { IconCestino } from '@/components/Icons'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useAdmin, useAzione } from '../dati'
import { dataOra, fa } from '../formato'
import { Carta, Conferma, Scelta, Stato } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

const TONI: Array<{ value: TonoAnnuncio; label: string }> = [
  { value: 'info', label: 'Info' },
  { value: 'avviso', label: 'Avviso' },
  { value: 'festa', label: 'Festa' },
]

type Scadenza = 'mai' | '1h' | '6h' | '1g' | '3g' | '7g' | 'data'

const SCADENZE: Array<{ valore: Scadenza; nome: string }> = [
  { valore: 'mai', nome: 'Finché lo spengo' },
  { valore: '1h', nome: 'Per un’ora' },
  { valore: '6h', nome: 'Per sei ore' },
  { valore: '1g', nome: 'Per un giorno' },
  { valore: '3g', nome: 'Per tre giorni' },
  { valore: '7g', nome: 'Per una settimana' },
  { valore: 'data', nome: 'Fino a…' },
]

const ORE: Record<Exclude<Scadenza, 'mai' | 'data'>, number> = { '1h': 1, '6h': 6, '1g': 24, '3g': 72, '7g': 168 }

/** "2026-10-18T14:30" per il campo della data, nell'ora del dispositivo. */
function perIlCampo(ms: number): string {
  const d = new Date(ms)
  const due = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}`
}

/**
 * Gli annunci a tutti: una riga in cima alle Giornaliere — una manutenzione,
 * un gioco nuovo, una festa. Si scrive, si vede com'e' prima di pubblicarlo,
 * e resta finché lo si spegne o fino alla sua scadenza.
 */
export default function Annunci() {
  const d = useAdmin<AdminAnnunci>('/annunci')
  const { esegui, occupato } = useAzione()
  const [elimina, setElimina] = useState<Annuncio | null>(null)

  async function cambia(a: Annuncio, attivo: boolean) {
    const r = await esegui<AdminAnnunci>(
      `attivo:${a.id}`,
      `/annunci/${encodeURIComponent(a.id)}`,
      { method: 'PATCH', body: { attivo } },
      attivo ? 'Annuncio acceso' : 'Annuncio spento',
    )
    if (r) d.imposta(r)
  }

  return (
    <Schermata titolo="Annunci" aggiorna={aggiornaDa(d)}>
      <Nuovo onPubblicato={d.imposta} />
      <ConDati d={d}>
        {(r) =>
          r.annunci.length === 0 ? null : (
            <Carta titolo="Pubblicati" sotto="I più recenti per primi">
              <ul className="adm-annunci">
                {r.annunci.map((a) => {
                  const scaduto = a.fino !== null && new Date(a.fino).getTime() <= Date.now()
                  return (
                    <li key={a.id} className={`adm-annunci__voce${a.attivo && !scaduto ? '' : ' is-spento'}`}>
                      <div className="adm-anteprima" inert>
                        <AvvisoATutti annuncio={{ id: `anteprima-${a.id}`, testo: a.testo, tono: a.tono }} />
                      </div>
                      <div className="adm-annunci__piede">
                        <div className="adm-annunci__testo">
                          {scaduto ? (
                            <Stato tono="avviso">Scaduto</Stato>
                          ) : a.attivo ? (
                            <Stato tono="buono">Si vede</Stato>
                          ) : (
                            <Stato tono="neutro">Spento</Stato>
                          )}
                          <span className="adm-annunci__meta" title={dataOra(a.creatoIl)}>
                            {a.creatoDa ? `@${a.creatoDa}, ` : ''}
                            {fa(a.creatoIl)}
                            {a.fino && ` · ${scaduto ? 'scaduto' : 'fino al'} ${dataOra(a.fino)}`}
                          </span>
                        </div>
                        <div className="adm-annunci__azioni">
                          <Interruttore
                            acceso={a.attivo}
                            onCambia={(x) => void cambia(a, x)}
                            etichetta={a.attivo ? 'Spegni l’annuncio' : 'Accendi l’annuncio'}
                            disabilitato={occupato === `attivo:${a.id}`}
                          />
                          <button
                            type="button"
                            className="adm-tondo"
                            onClick={() => setElimina(a)}
                            aria-label="Elimina l’annuncio"
                          >
                            <IconCestino size={17} />
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Carta>
          )
        }
      </ConDati>
      <Conferma
        aperta={elimina !== null}
        titolo="Eliminare l’annuncio?"
        testo="Sparisce per tutti, e dall’elenco."
        azione="Elimina"
        occupato={occupato === 'elimina'}
        onConferma={async () => {
          if (!elimina) return
          const r = await esegui<AdminAnnunci>(
            'elimina',
            `/annunci/${encodeURIComponent(elimina.id)}`,
            { method: 'DELETE' },
            'Annuncio eliminato',
          )
          if (r) d.imposta(r)
          setElimina(null)
        }}
        onChiudi={() => setElimina(null)}
      />
    </Schermata>
  )
}

function Nuovo({ onPubblicato }: { onPubblicato: (r: AdminAnnunci) => void }) {
  const { esegui, occupato } = useAzione()
  const [testo, setTesto] = useState('')
  const [tono, setTono] = useState<TonoAnnuncio>('info')
  const [scadenza, setScadenza] = useState<Scadenza>('mai')
  const [data, setData] = useState(() => perIlCampo(Date.now() + 24 * 3_600_000))
  const id = useId()
  const resta = MASSIMO_TESTO_ANNUNCIO - testo.length
  const fino =
    scadenza === 'mai'
      ? null
      : scadenza === 'data'
        ? Number.isFinite(new Date(data).getTime())
          ? new Date(data).toISOString()
          : null
        : new Date(Date.now() + ORE[scadenza] * 3_600_000).toISOString()
  const dataNelPassato = scadenza === 'data' && (fino === null || new Date(fino).getTime() <= Date.now())
  const pronto = testo.trim().length > 0 && resta >= 0 && !dataNelPassato

  async function pubblica(e: FormEvent) {
    e.preventDefault()
    if (!pronto) return
    const r = await esegui<AdminAnnunci>(
      'nuovo',
      '/annunci',
      { method: 'POST', body: { testo: testo.trim(), tono, fino } },
      'Annuncio pubblicato',
    )
    if (r) {
      onPubblicato(r)
      setTesto('')
      setScadenza('mai')
    }
  }

  return (
    <Carta titolo="Nuovo annuncio" sotto="Compare in cima alle Giornaliere, a tutti">
      <form className="adm-nuovo" onSubmit={pubblica} noValidate>
        <div className={`adm-nuovo__testo${resta < 0 ? ' is-troppo' : ''}`}>
          <label htmlFor={id} className="u-visually-hidden">
            Testo dell’annuncio
          </label>
          <textarea
            id={id}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Stasera alle 22 il sito si ferma per dieci minuti."
            rows={3}
            aria-describedby={`${id}-conto`}
          />
          <span id={`${id}-conto`} className="adm-nuovo__conto u-tabnum" aria-live="polite">
            {resta}
          </span>
        </div>
        <div className="adm-nuovo__scelte">
          <div className="adm-segmentato">
            <SegmentedControl ariaLabel="Tono" options={TONI} value={tono} onChange={setTono} />
          </div>
          <Scelta etichetta="Scadenza" valore={scadenza} voci={SCADENZE} onCambia={setScadenza} />
          {scadenza === 'data' && (
            <input
              type="datetime-local"
              className={`adm-campo adm-campo--data${dataNelPassato ? ' is-errore' : ''}`}
              value={data}
              min={perIlCampo(Date.now())}
              onChange={(e) => setData(e.target.value)}
              aria-label="Fino a"
            />
          )}
        </div>

        <div className="adm-nuovo__anteprima">
          <p className="adm-sottotitolo">Anteprima</p>
          <div className="adm-anteprima" inert>
            {testo.trim() ? (
              <AvvisoATutti annuncio={{ id: 'anteprima-nuovo', testo: testo.trim(), tono }} />
            ) : (
              <p className="adm-anteprima__vuota">Scrivi il testo per vederlo.</p>
            )}
          </div>
        </div>

        <div className="adm-modulo__piede">
          <Button type="submit" loading={occupato === 'nuovo'} disabled={!pronto}>
            Pubblica
          </Button>
        </div>
      </form>
    </Carta>
  )
}
