import { centroDi, strato } from '@/games/fortuna/voli'
import { suona } from '@/lib/suoni'

/**
 * A giro finito il croupier raccoglie le carte: volano coperte negli scarti,
 * una dopo l'altra. Sono copie delle carte, nello strato dei voli, perché il
 * tavolo intanto passa al giro dopo e le sue carte non ci sono piu'.
 * Restituisce quanto dura, per far aspettare la distribuzione che segue.
 */
export function raccogliCarte(tavolo: HTMLElement | null, scarti: HTMLElement | null): number {
  if (!tavolo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
  const a = centroDi(scarti)
  if (!a) return 0
  const carte = [...tavolo.querySelectorAll<HTMLElement>('.bj-carta__volo')]
  let quante = 0
  for (const el of carte) {
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    const i = quante
    quante += 1
    const copia = el.cloneNode(true) as HTMLElement
    copia.classList.add('bj-raccolta')
    copia.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--l:${r.width}px`
    strato().append(copia)
    const dx = a.x - (r.left + r.width / 2)
    const dy = a.y - (r.top + r.height / 2)
    const scala = Math.max(0.3, Math.min(1, 30 / r.width))
    copia
      .animate(
        [
          { transform: 'none' },
          { transform: 'translate(0, -10px) rotate(-4deg)', offset: 0.2 },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${-80 + i * 4}deg) scale(${scala})` },
        ],
        { duration: 560, delay: i * 45, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' },
      )
      .finished.then(() => copia.remove(), () => copia.remove())
    copia
      .querySelector('.bj-carta__giro')
      ?.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], {
        duration: 300,
        delay: i * 45 + 80,
        easing: 'ease-in',
        fill: 'forwards',
      })
  }
  if (quante > 0) suona('carta', { volume: 0.7 })
  return quante === 0 ? 0 : 560 + quante * 45
}
