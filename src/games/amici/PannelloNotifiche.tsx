import { useEffect, useState } from 'react'
import { CATEGORIE_NOTIFICHE, type CategoriaNotifica, type StatoNotifiche } from '@shared/notifiche'
import { Elenco, Riga, Sezione } from '@/components/Elementi'
import { Interruttore } from '@/components/Interruttore'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { useDati } from '@/lib/dati'
import {
  accendiNotifiche,
  iscrizioneAttuale,
  permessoNotifiche,
  spegniNotifiche,
  supportoNotifiche,
} from '@/lib/notifiche'

/**
 * Le notifiche, nel profilo: prima se arrivano su questo dispositivo, poi
 * quali. Le categorie valgono per tutti i dispositivi, perché le guarda il
 * server; l'interruttore in cima vale per questo.
 */
export function PannelloNotifiche() {
  const supporto = supportoNotifiche()
  const { dati, ricarica } = useDati<StatoNotifiche>(supporto === 'si' ? '/notifiche' : null)
  const toast = useToast()
  const [iscritto, setIscritto] = useState<boolean | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [preferenze, setPreferenze] = useState<StatoNotifiche['preferenze'] | null>(null)

  useEffect(() => {
    if (supporto !== 'si') return
    void iscrizioneAttuale()
      .then((i) => setIscritto(i !== null && permessoNotifiche() === 'granted'))
      .catch(() => setIscritto(false))
  }, [supporto])
  useEffect(() => {
    if (dati) setPreferenze(dati.preferenze)
  }, [dati])

  if (supporto === 'no') {
    return (
      <Sezione titolo="Notifiche">
        <p className="profilo__testo">Questo browser non riceve notifiche.</p>
      </Sezione>
    )
  }
  if (supporto === 'ios') {
    return (
      <Sezione titolo="Notifiche">
        <p className="profilo__testo">
          Su iPhone arrivano dall’app sulla schermata Home: tocca Condividi, poi <strong>Aggiungi alla schermata Home</strong>, e
          aprila da lì.
        </p>
      </Sezione>
    )
  }

  const bloccate = permessoNotifiche() === 'denied'

  async function cambiaDispositivo(acceso: boolean) {
    if (!dati) return
    setOccupato(true)
    try {
      if (acceso) {
        const esito = await accendiNotifiche(dati.chiave)
        if (esito === 'accese') {
          setIscritto(true)
          void api('/notifiche/prova', { method: 'POST' }).catch(() => {})
          void ricarica()
        } else if (esito === 'negate') {
          toast.show('Le notifiche sono bloccate: riattivale dalle impostazioni del browser.')
        } else {
          toast.show('Non sono riuscito ad accenderle: riprova fra poco.')
        }
      } else {
        await spegniNotifiche()
        setIscritto(false)
        void ricarica()
      }
    } finally {
      setOccupato(false)
    }
  }

  async function cambiaCategoria(id: CategoriaNotifica, acceso: boolean) {
    setPreferenze((p) => (p ? { ...p, [id]: acceso } : p))
    try {
      const { preferenze: salvate } = await api<{ preferenze: StatoNotifiche['preferenze'] }>('/notifiche/preferenze', {
        method: 'POST',
        body: { [id]: acceso },
      })
      setPreferenze(salvate)
    } catch {
      setPreferenze((p) => (p ? { ...p, [id]: !acceso } : p))
      toast.show('Non sono riuscito a salvarla: riprova.')
    }
  }

  return (
    <Sezione titolo="Notifiche">
      {bloccate ? (
        <p className="profilo__testo">Le hai bloccate per questo sito: riattivale dalle impostazioni del browser.</p>
      ) : (
        <Elenco>
          <Riga
            titolo="Su questo dispositivo"
            valore={
              <Interruttore
                acceso={iscritto === true}
                onCambia={(v) => void cambiaDispositivo(v)}
                etichetta="Notifiche su questo dispositivo"
                disabilitato={iscritto === null || !dati || occupato}
              />
            }
          />
          {iscritto &&
            preferenze &&
            CATEGORIE_NOTIFICHE.map((c) => (
              <Riga
                key={c.id}
                titolo={c.nome}
                sotto={c.descrizione}
                valore={
                  <Interruttore acceso={preferenze[c.id]} onCambia={(v) => void cambiaCategoria(c.id, v)} etichetta={c.nome} />
                }
              />
            ))}
        </Elenco>
      )}
    </Sezione>
  )
}
