import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ROTTE } from '@/app/rotte'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaCatena } from '@/games/catena/ComeSiGioca'
import { PartitaCatena } from '@/games/catena/Partita'
import { useCatenaLibera } from '@/games/catena/useCatenaLibera'
import { SceltaFinale } from '@/games/sfide/Scelta'
import { BottoneLascia, FoglioNuova } from '@/games/sospese/Lascia'
import { useSospesa } from '@/games/sospese/registro'
import type { ImpostazioniFinale } from '@shared/sfide-libere'

/**
 * La Catena libera: una a caso, quante se ne vuole, con il tempo di ogni
 * parola e quello della finale che si scelgono. Tutto nel telefono, e non conta per la classifica. Con un
 * amico la stessa per tutti e due, nella sfida.
 *
 * Lasciata a meta' resta in sospeso, con il tempo fermo: si riprende da qui o
 * dal biglietto delle Libere, che arriva con `?riprendi` e la riapre subito.
 */
export default function CatenaLibera() {
  const g = useCatenaLibera()
  const sospesa = useSospesa('catena')
  const [query] = useSearchParams()
  const [regole, setRegole] = useState(false)
  /** Le opzioni dell'ultima partita: "Un'altra" riparte da quelle. */
  const [ultime, setUltime] = useState<ImpostazioniFinale | null>(null)
  /** Le opzioni di una partita nuova, mentre si chiede che fare di quella in sospeso. */
  const [nuova, setNuova] = useState<ImpostazioniFinale | null>(null)
  const v = g.vista
  const festa = useFesta(v ? !v.finita : null, v?.indovinata === true, 2_600)
  const parti = (o: ImpostazioniFinale) => {
    setUltime(o)
    void g.comincia({ tempoFinaleMs: o.secondi * 1_000, tempoParolaMs: o.passo * 1_000 })
  }
  const comincia = (o: ImpostazioniFinale) => (sospesa ? setNuova(o) : parti(o))

  // Dal biglietto delle Libere la partita lasciata si riapre da sola, una volta: in sviluppo React monta due volte.
  const { riprendi } = g
  const [daRiprendere, setDaRiprendere] = useState(() => query.has('riprendi'))
  const ripresa = useRef(false)
  useEffect(() => {
    if (!daRiprendere || ripresa.current) return
    ripresa.current = true
    void riprendi().finally(() => setDaRiprendere(false))
  }, [daRiprendere, riprendi])

  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )

  if (!v && !daRiprendere && !g.riprendendo) {
    return (
      <Pagina titolo="Catena" gioco="catena" indietro={{ a: ROTTE.libere, etichetta: 'Libere' }} azioni={info}>
        <SceltaFinale
          gioco="catena"
          titoloPasso="Tempo per parola"
          titoloTempo="Tempo per la parola finale"
          onComincia={comincia}
          sospesa={sospesa && { dettaglio: sospesa.dettaglio, onRiprendi: () => void riprendi() }}
        >
          {g.errore && <p className="sfl-errore">{g.errore}</p>}
        </SceltaFinale>
        <ComeSiGiocaCatena open={regole} onClose={() => setRegole(false)} />
        <FoglioNuova
          open={nuova !== null}
          onClose={() => setNuova(null)}
          onRiprendi={() => void riprendi()}
          onNuova={() => {
            g.lascia()
            if (nuova) parti(nuova)
          }}
        />
      </Pagina>
    )
  }

  /** Le opzioni di "Gioca ancora": quelle scelte, o quelle della partita ripresa. */
  const ancora: ImpostazioniFinale | null =
    ultime ??
    (v && { passo: v.tempoParolaMs / 1_000, secondi: (v.tempoFinaleMs / 1_000) as ImpostazioniFinale['secondi'] })

  return (
    <Pagina
      key="partita"
      titolo="Catena"
      sotto="Libera"
      intera
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={
        <>
          {info}
          {v && !v.nuova && !v.finita && <BottoneLascia onLascia={g.lascia} />}
        </>
      }
    >
      {!v ? (
        <div className="cat-attesa" aria-hidden="true" />
      ) : (
        <PartitaCatena
          key={g.numero}
          vista={v}
          comandi={g.comandi}
          adesso={g.adesso}
          fine={
            <>
              <p className="cat-fine__nota u-tabnum">
                {g.conti.indovinate} indovinate su {g.conti.partite} · non conta per la classifica
              </p>
              <div className="cat-fine__bottoni">
                <button type="button" className="cat-fine__bottone" onClick={g.ricomincia}>
                  Opzioni
                </button>
                <button type="button" className="cat-fine__bottone is-menta" onClick={() => ancora && parti(ancora)}>
                  <IconRefresh size={18} />
                  Gioca ancora
                </button>
              </div>
            </>
          }
        />
      )}
      <ComeSiGiocaCatena open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}
