import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Elenco, Riga, Sezione, Vuoto } from '@/components/Elementi'
import { IconCestino, IconClose, IconFoto, IconImporta, IconShare } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { eliminaSet, leggiImmagine, leggiSet, nuovoIdSet, salvaImmagine, salvaSet, type SetProprio } from '@/games/indovina/archivio'
import { nomeDaFile, preparaFoto } from '@/games/indovina/foto'
import { fileDelSet, problemaDelSet, setDalFile } from '@/games/indovina/setFile'
import { Faccia } from '@/games/indovina/Tabellone'
import { NOME_MASSIMO, NOME_SET_MASSIMO, VOCI_MASSIME, VOCI_MINIME } from '@shared/indovina'
import './Indovina.css'

/**
 * Un set di personaggi proprio: un nome, e da sei a trenta foto, ognuna con il
 * suo nome. Si salva da solo a ogni cambio, nel telefono: niente va al server.
 * Le foto si prendono dalla galleria, piu' di una alla volta, e si tagliano
 * da sole in un quadrato.
 */
export default function IndovinaSet() {
  const { id = 'nuovo' } = useParams()
  const { vai } = useNavigazione()
  const toast = useToast()
  const [set, setSet] = useState<SetProprio | null>(null)
  const [trovato, setTrovato] = useState(true)
  const [url, setUrl] = useState<ReadonlyMap<string, string>>(new Map())
  const [preparo, setPreparo] = useState<{ fatte: number; tutte: number } | null>(null)
  const [elimina, setElimina] = useState(false)
  const scelta = useRef<HTMLInputElement>(null)
  const importa = useRef<HTMLInputElement>(null)
  const sostituisci = useRef<number | null>(null)
  const creati = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setRef = useRef(set)
  setRef.current = set

  useEffect(() => {
    // Il set nuovo che ha appena preso il suo indirizzo e' gia' qui: rileggerlo
    // cancellerebbe le lettere scritte nel frattempo.
    if (setRef.current?.id === id) return
    let annullato = false
    void (async () => {
      if (id === 'nuovo') {
        setSet({ id: nuovoIdSet(), nome: '', voci: [], modificato: Date.now() })
        return
      }
      const letto = await leggiSet(id)
      if (annullato) return
      if (!letto) {
        setTrovato(false)
        return
      }
      setSet(letto)
      const trovate = new Map<string, string>()
      for (const v of letto.voci) {
        const blob = await leggiImmagine(v.img)
        if (blob) {
          const u = URL.createObjectURL(blob)
          creati.current.push(u)
          trovate.set(v.img, u)
        }
      }
      if (!annullato) setUrl(trovate)
    })()
    return () => {
      annullato = true
    }
  }, [id])

  useEffect(
    () => () => {
      for (const u of creati.current) URL.revokeObjectURL(u)
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  /** Ogni cambio si salva dopo un attimo; un set nuovo prende il suo indirizzo al primo. */
  const cambia = (dopo: SetProprio) => {
    setRef.current = dopo
    setSet(dopo)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void salvaSet(dopo).then(() => {
        if (id === 'nuovo') vai(ROTTE.setIndovina(dopo.id), { replace: true, direzione: 'nessuna' })
      })
    }, 300)
  }

  const mostra = (hash: string, blob: Blob) => {
    const u = URL.createObjectURL(blob)
    creati.current.push(u)
    setUrl((prima) => new Map(prima).set(hash, u))
  }

  const aggiungi = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!set || file.length === 0) return
    const quale = sostituisci.current
    sostituisci.current = null
    const posto = quale !== null ? 1 : VOCI_MASSIME - set.voci.length
    const presi = file.slice(0, posto)
    if (file.length > posto) toast.show(`Al massimo ${VOCI_MASSIME} personaggi.`, 'error')
    setPreparo({ fatte: 0, tutte: presi.length })
    const nuove: SetProprio['voci'] = []
    for (const f of presi) {
      try {
        const { blob, hash } = await preparaFoto(f)
        await salvaImmagine(hash, blob)
        mostra(hash, blob)
        nuove.push({ nome: nomeDaFile(f.name), img: hash })
      } catch {
        toast.show(`Non riesco a leggere ${f.name}.`, 'error')
      }
      setPreparo((p) => (p ? { ...p, fatte: p.fatte + 1 } : p))
    }
    setPreparo(null)
    // Il set di adesso, non quello di quando si e' cominciato: nel frattempo si puo' aver scritto un nome.
    const attuale = setRef.current
    if (!attuale) return
    const voci =
      quale !== null && nuove[0]
        ? attuale.voci.map((v, i) => (i === quale ? { nome: v.nome || nuove[0].nome, img: nuove[0].img } : v))
        : [...attuale.voci, ...nuove]
    cambia({ ...attuale, voci })
  }

  const daFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !set) return
    try {
      const letto = await setDalFile(file)
      for (const v of letto.voci) {
        await salvaImmagine(v.img, v.blob)
        mostra(v.img, v.blob)
      }
      const attuale = setRef.current ?? set
      cambia({ ...attuale, nome: attuale.nome || letto.nome, voci: letto.voci.map(({ nome, img }) => ({ nome, img })) })
      toast.show(`Importati ${letto.voci.length} personaggi`)
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'File non valido.', 'error')
    }
  }

  const condividi = async () => {
    if (!set) return
    const file = await fileDelSet(set)
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: set.nome })
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    // Dove non si condividono file, si scarica.
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  if (!trovato) {
    return (
      <Pagina titolo="Set" indietro={{ a: ROTTE.indovina, etichetta: 'Indovina chi' }}>
        <Vuoto titolo="Set non trovato" testo="È stato eliminato, o è in un altro telefono." />
      </Pagina>
    )
  }

  const problema = set ? problemaDelSet(set) : null
  const nomi = set ? set.voci.map((v) => v.nome.trim().toLowerCase()) : []

  return (
    <Pagina
      titolo={set?.nome || (id === 'nuovo' ? 'Nuovo set' : 'Set')}
      indietro={{ a: ROTTE.indovina, etichetta: 'Indovina chi' }}
    >
      {!set ? (
        <div className="ic-attesa ic-attesa--corta" aria-hidden="true" />
      ) : (
        <>
          <Sezione titolo="Nome">
            <input
              className="ic-campo-testo"
              value={set.nome}
              onChange={(e) => cambia({ ...set, nome: e.target.value.slice(0, NOME_SET_MASSIMO) })}
              placeholder="Ufficio, Famiglia, Calcetto…"
              aria-label="Nome del set"
            />
          </Sezione>

          <Sezione
            titolo="Personaggi"
            azione={<span className="ic-set-editor__conto u-tabnum">{set.voci.length}/{VOCI_MASSIME}</span>}
            nota={problema ?? (set.voci.length > 0 ? 'Tocca una foto per cambiarla.' : undefined)}
          >
            <div className="ic-set-editor">
              {set.voci.map((v, i) => {
                const doppio = v.nome.trim() !== '' && nomi.indexOf(v.nome.trim().toLowerCase()) !== i
                return (
                  <div key={`${v.img}-${i}`} className="ic-voce">
                    <button
                      type="button"
                      className="ic-voce__foto"
                      onClick={() => {
                        sostituisci.current = i
                        scelta.current?.click()
                      }}
                      aria-label={`Cambia la foto di ${v.nome || `personaggio ${i + 1}`}`}
                    >
                      <Faccia url={url.get(v.img) ?? null} nome={v.nome || '?'} />
                    </button>
                    <button
                      type="button"
                      className="ic-voce__togli"
                      onClick={() => cambia({ ...set, voci: set.voci.filter((_, j) => j !== i) })}
                      aria-label={`Togli ${v.nome || `personaggio ${i + 1}`}`}
                    >
                      <IconClose size={14} />
                    </button>
                    <input
                      className={`ic-voce__nome${!v.nome.trim() || doppio ? ' is-da-fare' : ''}`}
                      value={v.nome}
                      onChange={(e) =>
                        cambia({
                          ...set,
                          voci: set.voci.map((x, j) => (j === i ? { ...x, nome: e.target.value.slice(0, NOME_MASSIMO) } : x)),
                        })
                      }
                      placeholder="Nome"
                      aria-label={`Nome del personaggio ${i + 1}`}
                    />
                  </div>
                )
              })}
              {set.voci.length < VOCI_MASSIME && (
                <button type="button" className="ic-voce ic-voce--aggiungi" onClick={() => scelta.current?.click()} disabled={preparo !== null}>
                  <span className="ic-voce__piu" aria-hidden="true">
                    <IconFoto size={26} />
                  </span>
                  <span>{preparo ? `${preparo.fatte}/${preparo.tutte}` : 'Aggiungi foto'}</span>
                </button>
              )}
            </div>
            <input ref={scelta} type="file" accept="image/*" multiple hidden onChange={(e) => void aggiungi(e)} />
            <input ref={importa} type="file" accept=".json,application/json" hidden onChange={(e) => void daFile(e)} />
          </Sezione>

          <Sezione nota={`Le foto restano nel telefono. Servono da ${VOCI_MINIME} a ${VOCI_MASSIME} personaggi.`}>
            <Elenco>
              {set.voci.length > 0 && (
                <Riga icona={<IconShare size={18} />} titolo="Manda il set a un amico" sotto="Come file, da aprire nel suo telefono" onClick={() => void condividi()} />
              )}
              {set.voci.length === 0 && (
                <Riga icona={<IconImporta size={18} />} titolo="Apri un set ricevuto" sotto="Il file che ti hanno mandato" onClick={() => importa.current?.click()} />
              )}
              {id !== 'nuovo' && (
                <Riga icona={<IconCestino size={18} />} titolo="Elimina il set" distruttiva onClick={() => setElimina(true)} />
              )}
            </Elenco>
          </Sezione>
        </>
      )}

      <Sheet open={elimina} onClose={() => setElimina(false)} title="Eliminare il set?">
        <div className="ic-conferma">
          <p className="ic-conferma__testo">Le foto spariscono dal telefono.</p>
          <Button
            size="lg"
            fullWidth
            variant="destructive"
            onClick={() => {
              setElimina(false)
              if (set) void eliminaSet(set.id).then(() => vai(ROTTE.indovina, { replace: true }))
            }}
          >
            Elimina
          </Button>
          <Button size="lg" fullWidth variant="plain" onClick={() => setElimina(false)}>
            Annulla
          </Button>
        </div>
      </Sheet>
    </Pagina>
  )
}
