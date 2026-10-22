/**
 * Lo stato premuto dei tasti, dal momento in cui il dito tocca.
 *
 * I fogli di stile scrivono la pressione come `:is(:active, [data-premuto])`.
 * `:active` da solo sul telefono arrivava tardi o mai: Safari non lo accende
 * senza un ascoltatore di `touchstart`, e Chrome, in una pagina che scorre, lo
 * accende solo dopo un attimo, per non illuminare un tasto quando il dito sta
 * per scorrere — e un tocco rapido lo vedeva solo quando si alzava il dito.
 * Qui l'attributo si mette al `pointerdown` sul tasto sotto il dito e si toglie
 * quando il dito si alza, o quando la pagina comincia a scorrere
 * (`pointercancel`): un tasto sfiorato scorrendo non resta giu'.
 */

/** Quel che si preme: i bottoni, i link, e quel che fa da bottone. */
const PREMIBILE = 'button, a[href], [role="button"], [role="tab"], [role="radio"], [role="checkbox"], label, summary'

let premuto: Element | null = null

function rilascia() {
  premuto?.removeAttribute('data-premuto')
  premuto = null
}

function premi(e: PointerEvent) {
  rilascia()
  // Il tasto destro del mouse non preme niente.
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const bersaglio = e.target instanceof Element ? e.target.closest(PREMIBILE) : null
  if (!bersaglio || bersaglio.matches(':disabled, [aria-disabled="true"]')) return
  bersaglio.setAttribute('data-premuto', '')
  premuto = bersaglio
}

let installato = false

export function installaPremuto(): void {
  if (installato || typeof document === 'undefined') return
  installato = true
  const opzioni = { capture: true, passive: true } as const
  document.addEventListener('pointerdown', premi, opzioni)
  document.addEventListener('pointerup', rilascia, opzioni)
  document.addEventListener('pointercancel', rilascia, opzioni)
  document.addEventListener('dragstart', rilascia, opzioni)
  // Senza un ascoltatore di touchstart Safari su iOS non accende mai `:active`.
  document.addEventListener('touchstart', () => {}, opzioni)
  window.addEventListener('blur', rilascia)
  document.addEventListener('visibilitychange', rilascia)
}
