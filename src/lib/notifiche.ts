import { api } from './api'
import { daBase64url } from '@shared/webpush'

/**
 * Le notifiche dal lato del telefono: se si possono avere, l'iscrizione e la
 * disiscrizione. Le preferenze stanno sul server (shared/notifiche.ts),
 * perché le guarda chi manda.
 */

/**
 * Si possono avere? Su iPhone e iPad solo dall'app sulla schermata Home
 * (`ios`): in Safari il browser non le ha.
 */
export type SupportoNotifiche = 'si' | 'no' | 'ios'

const suIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const installata = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function supportoNotifiche(): SupportoNotifiche {
  const ha = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (ha) return 'si'
  return suIos() && !installata() ? 'ios' : 'no'
}

/** Il permesso del browser: concesso, negato, o non ancora chiesto. */
export const permessoNotifiche = (): NotificationPermission =>
  'Notification' in window ? Notification.permission : 'denied'

async function registrazione(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // In sviluppo il service worker non c'e' (src/main.tsx): niente notifiche.
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** L'iscrizione di questo dispositivo, se c'e'. */
export async function iscrizioneAttuale(): Promise<PushSubscription | null> {
  return (await (await registrazione())?.pushManager.getSubscription()) ?? null
}

/**
 * Accende le notifiche su questo dispositivo: chiede il permesso — va fatto
 * da un tocco, o il browser non lo chiede nemmeno —, si iscrive con la chiave
 * del server e gli manda l'iscrizione.
 */
export async function accendiNotifiche(chiave: string): Promise<'accese' | 'negate' | 'errore'> {
  const permesso = await Notification.requestPermission()
  if (permesso !== 'granted') return 'negate'
  const reg = await registrazione()
  if (!reg) return 'errore'
  try {
    const iscrizione =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: daBase64url(chiave) }))
    await api('/notifiche/iscrizione', { method: 'POST', body: iscrizione.toJSON() })
    return 'accese'
  } catch {
    return 'errore'
  }
}

/** Le spegne su questo dispositivo; sugli altri restano come sono. */
export async function spegniNotifiche(): Promise<void> {
  const iscrizione = await iscrizioneAttuale()
  if (!iscrizione) return
  await api('/notifiche/disiscrizione', { method: 'POST', body: { endpoint: iscrizione.endpoint } }).catch(() => {})
  await iscrizione.unsubscribe().catch(() => false)
}

/**
 * Ridice al server l'iscrizione di questo dispositivo, una volta per apertura
 * dell'app: il browser a volte la rinnova, e se sul telefono e' entrato un
 * altro giocatore le notifiche devono andare a lui.
 */
let ridetta = false
export async function ridiciIscrizione(): Promise<void> {
  if (ridetta || permessoNotifiche() !== 'granted') return
  ridetta = true
  const iscrizione = await iscrizioneAttuale().catch(() => null)
  if (iscrizione) await api('/notifiche/iscrizione', { method: 'POST', body: iscrizione.toJSON() }).catch(() => {})
}
