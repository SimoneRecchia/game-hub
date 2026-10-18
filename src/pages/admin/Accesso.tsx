import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AdminCodice, AdminIo } from '@shared/admin'
import { SBLOCCO_ADMIN_ORE } from '@shared/admin'
import { CODE_LENGTH } from '@shared/config'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { CampoCodice } from '@/components/CampoCodice'
import { Vuoto } from '@/components/Elementi'
import { IconLock } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { messaggioDi } from './dati'
import { IconaSblocca } from './icone'

const INDIETRO = { a: ROTTE.profilo, etichetta: 'Profilo' }

/** Il pannello sta arrivando, o non risponde. */
export function InAttesa({ errore, onRiprova }: { errore: string | null; onRiprova: () => void }) {
  return (
    <Pagina titolo="Pannello admin" indietro={INDIETRO}>
      {errore ? (
        <Vuoto
          icona={<IconLock size={28} />}
          titolo="Il pannello non risponde"
          testo={errore}
          azione={
            <Button variant="tinted" onClick={onRiprova}>
              Riprova
            </Button>
          }
        />
      ) : (
        <div className="adm-sblocco">
          <div className="adm-sblocco__carta scheletro" style={{ height: 320 }} aria-busy="true" aria-label="Carico" />
        </div>
      )}
    </Pagina>
  )
}

/**
 * Lo sblocco: la sessione da sola non basta ad aprire il pannello, ci vuole il
 * codice che arriva all'email. Si chiede, si scrive, e il pannello resta
 * aperto su questo dispositivo per `SBLOCCO_ADMIN_ORE` ore.
 */
export function Sblocco({ io, onSbloccato }: { io: AdminIo; onSbloccato: (io: AdminIo) => void }) {
  const [inviato, setInviato] = useState<AdminCodice | null>(null)
  const [codice, setCodice] = useState('')
  const [attesa, setAttesa] = useState(0)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (attesa <= 0) return
    const t = window.setTimeout(() => setAttesa((a) => a - 1), 1000)
    return () => window.clearTimeout(t)
  }, [attesa])
  useEffect(() => {
    if (inviato) campo.current?.focus()
  }, [inviato])

  async function chiedi() {
    setErrore(null)
    setOccupato(true)
    try {
      const r = await api<AdminCodice>('/admin/codice', { method: 'POST' })
      haptic('success')
      setInviato(r)
      setCodice('')
      setAttesa(r.attesa)
    } catch (e) {
      haptic('error')
      setErrore(messaggioDi(e, 'Non riesco a mandare il codice. Riprova.'))
    } finally {
      setOccupato(false)
    }
  }

  async function sblocca(valore: string) {
    setErrore(null)
    setOccupato(true)
    try {
      const r = await api<AdminIo>('/admin/sblocca', { method: 'POST', body: { codice: valore } })
      haptic('success')
      onSbloccato(r)
    } catch (e) {
      haptic('error')
      setErrore(
        e instanceof ApiFetchError && e.code === 'CODE_INVALID'
          ? 'Il codice non è giusto, o è scaduto.'
          : messaggioDi(e, 'Non riesco a sbloccare il pannello. Riprova.'),
      )
      setCodice('')
      campo.current?.focus()
    } finally {
      setOccupato(false)
    }
  }

  function invia(e: FormEvent) {
    e.preventDefault()
    if (!inviato) void chiedi()
    else if (codice.length === CODE_LENGTH) void sblocca(codice)
  }

  const email = inviato?.email ?? io.email

  return (
    <Pagina titolo="Pannello admin" indietro={INDIETRO}>
      <div className="adm-sblocco">
        <form className="adm-sblocco__carta entra" onSubmit={invia} noValidate>
          <span className="adm-sblocco__icona" aria-hidden="true">
            <IconaSblocca size={30} />
          </span>
          <h2 className="adm-sblocco__titolo">{inviato ? 'Scrivi il codice' : 'Sblocca il pannello'}</h2>
          {email ? (
            <p className="adm-sblocco__testo" role="status">
              {inviato ? 'L’abbiamo mandato a ' : 'Ti mando un codice a '}
              <strong>{email}</strong>.
            </p>
          ) : (
            <p className="adm-sblocco__testo">Serve un’email confermata sul tuo account.</p>
          )}

          {inviato && (
            <>
              <CampoCodice
                id="codice-admin"
                ref={campo}
                etichetta="Codice per sbloccare il pannello"
                valore={codice}
                onCambia={(cifre) => {
                  setCodice(cifre)
                  setErrore(null)
                }}
                onCompleto={(cifre) => void sblocca(cifre)}
                disabled={occupato}
                errore={errore !== null}
              />
              {inviato.codiceDiProva && (
                <p className="adm-sblocco__nota">In locale, senza la posta: il codice è {inviato.codiceDiProva}.</p>
              )}
            </>
          )}

          {errore && (
            <p className="adm-sblocco__errore" role="alert">
              {errore}
            </p>
          )}

          {inviato ? (
            <>
              <Button type="submit" size="lg" fullWidth loading={occupato} disabled={codice.length !== CODE_LENGTH}>
                Sblocca
              </Button>
              <button
                type="button"
                className="adm-sblocco__link"
                disabled={occupato || attesa > 0}
                onClick={() => void chiedi()}
              >
                {attesa > 0 ? `Rimanda il codice fra ${attesa}s` : 'Rimanda il codice'}
              </button>
            </>
          ) : (
            <Button type="submit" size="lg" fullWidth loading={occupato} disabled={!io.email}>
              Mandami il codice
            </Button>
          )}
          <p className="adm-sblocco__nota">Resta aperto {SBLOCCO_ADMIN_ORE} ore su questo dispositivo.</p>
        </form>
      </div>
    </Pagina>
  )
}
