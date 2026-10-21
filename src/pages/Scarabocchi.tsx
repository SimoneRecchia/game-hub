import { useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { CampoCodice } from '@/components/CampoCodice'
import { Sezione } from '@/components/Elementi'
import { IconInfo, IconPlus } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { ComeSiGiocaScarabocchi } from '@/games/scarabocchi/Regole'
import { ApiFetchError, api } from '@/lib/api'
import { usePresenza } from '@/lib/presenza'
import {
  LUNGHEZZA_CODICE_SCARABOCCHI,
  NOMI_MODI_SCARABOCCHI,
  type StanzaScarabocchiBreve,
  type VistaStanzaScarabocchi,
} from '@shared/scarabocchi'
import '@/games/scarabocchi/Scarabocchi.css'

/**
 * La sala di Scarabocchi: si apre una stanza, o si entra in quella di un
 * amico con il suo codice. Come si gioca — Indovina il disegno o il telefono
 * senza fili — lo sceglie dentro chi la apre. Se si e' gia' in una stanza, la
 * si ritrova in cima.
 */
export default function Scarabocchi() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const { dati: presenza, aggiorna } = usePresenza()
  const [regole, setRegole] = useState(false)
  const [codice, setCodice] = useState('')
  const [invio, setInvio] = useState<'crea' | 'entra' | null>(null)
  const stanza = presenza?.stanzaScarabocchi ?? null

  const crea = async () => {
    setInvio('crea')
    try {
      const v = await api<VistaStanzaScarabocchi>('/scarabocchi/stanze', { method: 'POST' })
      aggiorna()
      vai(ROTTE.stanzaScarabocchi(v.codice))
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire la stanza.', 'error')
    } finally {
      setInvio(null)
    }
  }

  const entra = async (c: string) => {
    if (c.length !== LUNGHEZZA_CODICE_SCARABOCCHI || invio) return
    setInvio('entra')
    try {
      await api<VistaStanzaScarabocchi>(`/scarabocchi/stanze/${c}/entra`, { method: 'POST' })
      aggiorna()
      vai(ROTTE.stanzaScarabocchi(c))
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco a entrare.', 'error')
    } finally {
      setInvio(null)
    }
  }

  return (
    <Pagina
      titolo="Scarabocchi"
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      gioco="scarabocchi"
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {stanza && <StanzaAperta stanza={stanza} onApri={() => vai(ROTTE.stanzaScarabocchi(stanza.codice))} />}
      <Button size="lg" fullWidth loading={invio === 'crea'} disabled={invio !== null} onClick={() => void crea()}>
        <IconPlus size={18} /> {stanza ? 'Apri una stanza nuova' : 'Apri una stanza'}
      </Button>
      <Sezione titolo="Entra con un codice">
        <CampoCodice
          id="scarabocchi-codice"
          etichetta="Il codice della stanza"
          valore={codice}
          onCambia={setCodice}
          onCompleto={(c) => void entra(c)}
          lunghezza={LUNGHEZZA_CODICE_SCARABOCCHI}
          lettere
          disabled={invio === 'entra'}
        />
        <Button
          variant="tinted"
          size="lg"
          fullWidth
          loading={invio === 'entra'}
          disabled={codice.length !== LUNGHEZZA_CODICE_SCARABOCCHI || invio !== null}
          onClick={() => void entra(codice)}
        >
          Entra
        </Button>
      </Sezione>
      <ComeSiGiocaScarabocchi open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

function StanzaAperta({ stanza, onApri }: { stanza: StanzaScarabocchiBreve; onApri: () => void }) {
  const stato =
    stanza.stato === 'partita' ? 'Partita in corso' : stanza.stato === 'finita' ? 'Partita finita' : 'In attesa'
  const quanti = stanza.iscritti === 1 ? '1 giocatore' : `${stanza.iscritti} giocatori`
  return (
    <button type="button" className="scr-aperta" onClick={onApri}>
      <span className="scr-aperta__testo">
        <span className="scr-aperta__titolo">Stanza {stanza.codice}</span>
        <span className="scr-aperta__stato">
          {NOMI_MODI_SCARABOCCHI[stanza.modo]} · {stato} · {quanti}
        </span>
      </span>
      <span className="scr-aperta__vai">Torna</span>
    </button>
  )
}
