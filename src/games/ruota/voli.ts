/**
 * Le fiches e le monete che volano: la puntata dal saldo alla ruota quando la
 * si lancia, la vincita dalla ruota al saldo, la puntata persa che scivola al
 * banco. Sono elementi del body, animati con le Web Animations e tolti alla
 * fine: passare dallo stato di React ridisegnerebbe la pagina a ogni
 * fotogramma, e un volo alla pagina dice qualcosa solo quando arriva.
 *
 * Senza animazioni non vola niente: le funzioni chiamano subito chi aspetta.
 */
import { suona } from '@/lib/suoni'

export interface Punto {
  x: number
  y: number
}

/** I colori delle fiches di una pila, dal basso: come al tavolo, non due uguali di fila. */
const COLORI_FICHES = ['var(--ct-rosso)', 'var(--ct-blu)', 'var(--ct-piu)', 'var(--ct-oro-scuro)']

const ridotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function strato(): HTMLElement {
  let s = document.querySelector<HTMLElement>('.ct-voli')
  if (!s) {
    s = document.createElement('div')
    s.className = 'ct-voli'
    s.setAttribute('aria-hidden', 'true')
    document.body.append(s)
  }
  return s
}

/** Il centro di un elemento sullo schermo, o niente se non si vede. */
export function centroDi(el: Element | null): Punto | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function pezzo(classe: string, testo = '', colore?: string): HTMLElement {
  const el = document.createElement('span')
  el.className = `ct-volo ${classe}`
  if (testo) el.textContent = testo
  if (colore) el.style.setProperty('--fiche', colore)
  strato().append(el)
  return el
}

const posto = (p: Punto, scala: number, giro: number) =>
  `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) scale(${scala}) rotate(${giro}deg)`

/**
 * Un volo ad arco, campionato su una curva di Bézier: tre fotogrammi chiave
 * farebbero due rette. `alto` e' quanto sale la curva sopra il piu' alto dei
 * due estremi.
 */
function arco(da: Punto, a: Punto, alto: number, scale: [number, number], giri: number): Keyframe[] {
  const controllo = { x: (da.x + a.x) / 2, y: Math.min(da.y, a.y) - alto }
  const passi = 12
  return Array.from({ length: passi + 1 }, (_, i) => {
    const t = i / passi
    const u = 1 - t
    const p = {
      x: u * u * da.x + 2 * u * t * controllo.x + t * t * a.x,
      y: u * u * da.y + 2 * u * t * controllo.y + t * t * a.y,
    }
    return {
      transform: posto(p, scale[0] + (scale[1] - scale[0]) * t, giri * t),
      opacity: i === 0 ? 0 : 1,
      offset: t,
    }
  })
}

/**
 * La puntata: una pila di fiches dal saldo alla ruota, una dopo l'altra, con
 * l'importo sull'ultima. Si risolve quando si posa l'ultima, con il loro
 * suono.
 */
export function puntaFiches(da: Punto, a: Punto, importo: number): Promise<void> {
  if (ridotto()) {
    suona('fiche')
    return Promise.resolve()
  }
  const quante = 4
  const voli = Array.from({ length: quante }, (_, i) => {
    const ultima = i === quante - 1
    const el = pezzo('ct-volo--fiche', ultima ? String(importo) : '', COLORI_FICHES[i % COLORI_FICHES.length])
    // La pila: ogni fiche si posa un filo piu' su della precedente, dritta dopo un giro intero.
    const arrivo = { x: a.x, y: a.y - i * 3 }
    const animazione = el.animate(arco(da, arrivo, 70 + i * 8, [0.9, 0.78], 360), {
      duration: 620,
      delay: i * 85,
      easing: 'cubic-bezier(0.3, 0.1, 0.25, 1)',
      fill: 'forwards',
    })
    return animazione.finished.then(() => el)
  })
  return Promise.all(voli).then((pezzi) => {
    suona('fiche')
    // Posate, restano un attimo sulla ruota e si spengono: la puntata ora la dice il mozzo.
    for (const el of pezzi) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 220, fill: 'forwards' }).finished.then(
        () => el.remove(),
      )
    }
  })
}

/**
 * La vincita: monete d'oro dalla ruota al saldo, una dopo l'altra. `arrivo`
 * e' chiamata quando arriva la prima, ed e' li' che il saldo deve cambiare;
 * ogni moneta che arriva tintinna.
 */
export function incassaMonete(da: Punto, a: Punto, quante: number, arrivo?: () => void): Promise<void> {
  if (ridotto()) {
    arrivo?.()
    suona('incasso')
    return Promise.resolve()
  }
  let prima = true
  const voli = Array.from({ length: quante }, (_, i) => {
    const el = pezzo('ct-volo--moneta')
    // Partono un po' sparse attorno alla ruota, come se ne uscissero a manciate.
    const angolo = (i / quante) * Math.PI * 2
    const partenza = { x: da.x + Math.cos(angolo) * 18, y: da.y + Math.sin(angolo) * 18 }
    const animazione = el.animate(arco(partenza, a, 90 + (i % 3) * 25, [1.1, 0.7], 540), {
      duration: 760,
      delay: i * 70,
      easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
      fill: 'forwards',
    })
    return animazione.finished.then(() => {
      el.remove()
      if (prima) {
        prima = false
        arrivo?.()
      }
      suona('incasso', { volume: 0.8 })
    })
  })
  return Promise.all(voli).then(() => undefined)
}

/**
 * La puntata persa: le fiches cadono dalla ruota, si fanno rosse e scivolano
 * giu', al banco. Non aspetta nessuno: il saldo era gia' sceso al lancio.
 */
export function perdiFiches(da: Punto, importo: number): void {
  if (ridotto()) return
  const quante = 4
  for (let i = 0; i < quante; i += 1) {
    const el = pezzo('ct-volo--fiche is-persa', i === quante - 1 ? `−${importo}` : '', COLORI_FICHES[i])
    const verso = i % 2 === 0 ? -1 : 1
    const fine = { x: da.x + verso * (30 + i * 14), y: da.y + 190 + i * 16 }
    el.animate(
      [
        { transform: posto({ x: da.x, y: da.y - i * 3 }, 0.8, 0), opacity: 1 },
        {
          transform: posto({ x: da.x + verso * 10, y: da.y - 26 - i * 3 }, 0.86, verso * 30),
          opacity: 1,
          offset: 0.25,
        },
        { transform: posto(fine, 0.6, verso * 220), opacity: 0 },
      ],
      { duration: 900, delay: 120 + i * 60, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'forwards' },
    ).finished.then(() => el.remove())
  }
}
