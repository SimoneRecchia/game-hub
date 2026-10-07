import { useState } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import {
  ORDINE_DELLA_NOTTE,
  PERSONAGGI,
  SCOPI_FAZIONI,
  TUTTI_I_PERSONAGGI,
  type Fazione,
  type IdPersonaggio,
} from '@shared/lupus-personaggi'
import { BadgeRuolo, RigaRuolo } from './Pezzi'
import { FoglioPersonaggio } from './Preparazione'
import { NOMI_FAZIONI } from './testi'
import '@/games/cruciverba/ComeSiGioca.css'

const FAZIONI: Fazione[] = ['villaggio', 'lupi', 'solo']

/** Le regole di Lupus e i personaggi, nel foglio della "i": il minimo per giocare, e chi fa che cosa. */
export function ComeSiGiocaLupus({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [parte, setParte] = useState<'regole' | 'personaggi'>('regole')
  const [dettaglio, setDettaglio] = useState<IdPersonaggio | null>(null)
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="lupus-foglio">
        <SegmentedControl
          ariaLabel="Che cosa leggere"
          value={parte}
          onChange={setParte}
          options={[
            { value: 'regole', label: 'Le regole' },
            { value: 'personaggi', label: 'I personaggi' },
          ]}
        />
        {parte === 'regole' ? (
          <div className="cru-aiuto">
            <p className="cru-aiuto__lede">
              Alcuni abitanti di Tabula sono lupi mannari: di notte sbranano, di giorno si nascondono fra gli altri.
              Il villaggio vince se li elimina tutti, i lupi quando sono tanti quanti gli altri.
            </p>

            <section className="cru-aiuto__sezione">
              <h3 className="cru-aiuto__titolo">La notte</h3>
              <ul className="cru-aiuto__elenco">
                <li>Chi ha un potere lo usa: il Veggente scruta, la Guardia protegge, i lupi scelgono la vittima.</li>
                <li>
                  <strong>Un telefono</strong>: il telefono passa a tutti, anche a chi non ha poteri. Chi dorme fa
                  finta di scegliere.
                </li>
                <li>
                  <strong>Online</strong>: ognuno sceglie dal suo telefono.
                </li>
              </ul>
            </section>

            <section className="cru-aiuto__sezione">
              <h3 className="cru-aiuto__titolo">Il giorno</h3>
              <ol className="cru-aiuto__passi">
                <li>
                  <strong>L’alba</strong>: si scopre chi è morto.
                </li>
                <li>
                  <strong>La discussione</strong>: si accusa, ci si difende, si mente.
                </li>
                <li>
                  <strong>Le nomine</strong>: tutti, anche i fantasmi, votano a turno chi accusare. I due più votati
                  vanno sotto accusa, e il gufato con loro.
                </li>
                <li>
                  <strong>Le arringhe</strong>: gli accusati si difendono.
                </li>
                <li>
                  <strong>Il ballottaggio</strong>: i vivi non accusati votano in segreto chi linciare. Poi scende
                  la notte.
                </li>
              </ol>
            </section>

            <section className="cru-aiuto__sezione">
              <h3 className="cru-aiuto__titolo">Da sapere</h3>
              <ul className="cru-aiuto__elenco">
                <li>Chi muore diventa un fantasma: non parla più e non mostra la carta.</li>
                <li>
                  Il <strong>Benvenuto!</strong> va allo sbranato della notte. Le nomine cominciano alla sua sinistra,
                  e a pari voti va sotto accusa chi gli siede più vicino, in senso orario.
                </li>
                <li>Online chi apre la stanza conduce: manda avanti il giorno.</li>
              </ul>
            </section>

            <section className="cru-aiuto__sezione">
              <h3 className="cru-aiuto__titolo">Le regole da scegliere</h3>
              <ul className="cru-aiuto__elenco">
                <li>
                  <strong>Prima notte senza vittime</strong>: la prima notte i lupi si riconoscono soltanto.
                </li>
                <li>
                  <strong>I fantasmi votano</strong>: alle nomine, non al ballottaggio.
                </li>
                <li>
                  <strong>Carta svelata alla morte</strong>: chi muore mostra il suo personaggio.
                </li>
                <li>
                  <strong>Gufo letale</strong>: il gufato muore all’alba, se non è un mannaro.
                </li>
              </ul>
            </section>

            <section className="cru-aiuto__sezione">
              <h3 className="cru-aiuto__titolo">Il mazzo</h3>
              <p className="cru-aiuto__nota">
                Quello del regolamento dipende da quanti siete: in otto, cinque villici, due lupi e il Veggente; più
                siete, più personaggi entrano. Si può anche scegliere personaggio per personaggio.
              </p>
            </section>
          </div>
        ) : (
          <div className="lupus-personaggi">
            {FAZIONI.map((f) => (
              <section key={f} className="lupus-personaggi__fazione" aria-label={NOMI_FAZIONI[f]}>
                <h3 className="lupus-personaggi__titolo">{NOMI_FAZIONI[f]}</h3>
                <p className="lupus-personaggi__scopo">{SCOPI_FAZIONI[f]}</p>
                <div className="lupus-personaggi__elenco">
                  {TUTTI_I_PERSONAGGI.filter((id) => PERSONAGGI[id].fazione === f).map((id) => (
                    <RigaRuolo key={id} ruolo={id} onClick={() => setDettaglio(id)} />
                  ))}
                </div>
              </section>
            ))}
            <section className="lupus-personaggi__fazione" aria-label="L’ordine della notte">
              <h3 className="lupus-personaggi__titolo">L’ordine della notte</h3>
              <ol className="lupus-ordine-notte">
                {ORDINE_DELLA_NOTTE.map((id) => (
                  <li key={id}>
                    <BadgeRuolo ruolo={id} size={22} />
                    {PERSONAGGI[id].nome}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
      <FoglioPersonaggio ruolo={dettaglio} onClose={() => setDettaglio(null)} />
    </Sheet>
  )
}
