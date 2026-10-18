/**
 * Invio delle email tramite Resend.
 *
 * Perché un servizio esterno: dalle Pages Functions non si può parlare SMTP, e
 * Cloudflare Email Routing riceve ma non spedisce. Resend ha un'API HTTP, un
 * piano gratuito da 3.000 email al mese — più che sufficiente per un gruppo di
 * colleghi — e la verifica del dominio si fa con record DNS.
 *
 * Se `RESEND_API_KEY` non c'e', `sendEmail` restituisce `not_configured`
 * invece di sollevare: le rotte lo trattano come un errore dichiarato e
 * spiegano cosa manca, invece di lasciare un 500 opaco.
 */

import type { Bindings } from '../types'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: 'not_configured' | 'rejected' | 'network'; detail: string }

/**
 * La richiesta arriva da questo computer: e' lo sviluppo in locale. Li', senza
 * la chiave di Resend, il codice per entrare torna nella risposta, perché non
 * ci sarebbe altro modo di leggerlo. In produzione l'indirizzo e' quello del
 * sito, e la condizione non si avvera mai, nemmeno senza la chiave.
 */
export function daQuestoComputer(url: string): boolean {
  const host = new URL(url).hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/** La verifica per email e' attiva? Guida sia le rotte sia la UI. */
export function emailVerificationEnabled(env: Bindings): boolean {
  return env.EMAIL_VERIFICATION === 'on' && Boolean(env.RESEND_API_KEY)
}

export async function sendEmail(env: Bindings, message: EmailMessage): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    return {
      ok: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY non impostata',
    }
  }

  const from = env.EMAIL_FROM ?? 'Game Hub <giochi@simonerecchia.com>'
  /*
   * L'endpoint e' sovrascrivibile: serve a puntare a un servizio compatibile
   * diverso da Resend, e in sviluppo a un finto servizio locale da cui leggere
   * il codice senza mandare email vere.
   */
  const endpoint = env.EMAIL_ENDPOINT ?? RESEND_ENDPOINT

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    })
  } catch (error) {
    return { ok: false, reason: 'network', detail: String(error).slice(0, 200) }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    // Il dettaglio finisce nei log di Cloudflare, non nella risposta al client.
    return {
      ok: false,
      reason: 'rejected',
      detail: `HTTP ${response.status} ${body.slice(0, 300)}`,
    }
  }

  const payload = (await response.json().catch(() => null)) as { id?: string } | null
  return { ok: true, id: payload?.id ?? null }
}

/* ─────────────────────────────  Messaggi  ───────────────────────────── */

/**
 * Struttura comune delle email.
 *
 * Niente immagini e niente CSS esterno: i client di posta li trattano in modi
 * imprevedibili, e un codice a sei cifre non ha bisogno di grafica. Gli stili
 * sono in linea perché è l'unica cosa che funziona davvero nelle email.
 */
function layout(titolo: string, corpo: string): string {
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#000">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:20px;letter-spacing:-0.4px">${titolo}</h1>
    ${corpo}
    <p style="margin:28px 0 0;font-size:12px;color:#8a8a8e;line-height:1.5">
      Game Hub · <a href="https://giochi.simonerecchia.com" style="color:#007aff;text-decoration:none">giochi.simonerecchia.com</a>
    </p>
  </div>
</body></html>`
}

function blocoCodice(code: string): string {
  return `<p style="margin:0 0 8px;font-size:15px;color:#3c3c43;line-height:1.5">Il codice è:</p>
    <p style="margin:0;font-size:34px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,'SF Mono',Menlo,monospace">${code}</p>`
}

export function verifyEmailMessage(nickname: string, code: string, minuti: number): Omit<EmailMessage, 'to'> {
  return {
    subject: `${code} è il tuo codice per Game Hub`,
    text: `Ciao ${nickname},\n\nil codice per confermare la tua email su Game Hub è:\n\n${code}\n\nVale ${minuti} minuti. Se non hai chiesto tu la registrazione, ignora questo messaggio.\n\ngiochi.simonerecchia.com`,
    html: layout(
      `Ciao ${nickname}, conferma l’email`,
      `${blocoCodice(code)}
      <p style="margin:20px 0 0;font-size:14px;color:#3c3c43;line-height:1.5">
        Vale <strong>${minuti} minuti</strong>. Se non hai chiesto tu la registrazione, ignora questo
        messaggio.
      </p>`,
    ),
  }
}

/** Il nickname in evidenza: sta in ogni email che serve a rientrare. */
function bloccoNickname(nickname: string): string {
  return `<p style="margin:0 0 8px;font-size:15px;color:#3c3c43;line-height:1.5">Il tuo nickname è:</p>
    <p style="margin:0;font-size:26px;font-weight:700;letter-spacing:0.5px">${nickname}</p>`
}

/**
 * Il codice per entrare, con il nickname scritto in chiaro: si entra con il
 * nickname o con l'email, e chi ha scritto l'email puo' non ricordarlo.
 */
export function loginMessage(nickname: string, code: string, minuti: number): Omit<EmailMessage, 'to'> {
  return {
    subject: `${code} è il tuo codice per entrare in Game Hub`,
    text: [
      `Ciao ${nickname},`,
      `il codice per entrare in Game Hub è:`,
      code,
      `Il tuo nickname è: ${nickname}`,
      `Il codice vale ${minuti} minuti. Se non l’hai chiesto tu, ignora questo messaggio:` +
        ' senza il codice non entra nessuno.',
      'giochi.simonerecchia.com',
    ].join('\n\n'),
    html: layout(
      `Ciao ${nickname}, ecco il codice per entrare`,
      `${blocoCodice(code)}
      <div style="margin:24px 0 0">${bloccoNickname(nickname)}</div>
      <p style="margin:20px 0 0;font-size:14px;color:#3c3c43;line-height:1.5">
        Il codice vale <strong>${minuti} minuti</strong>. Se non l’hai chiesto tu, ignora questo
        messaggio: senza il codice non entra nessuno.
      </p>`,
    ),
  }
}

/**
 * Il codice per cambiare il nickname, con il nickname di adesso e quello nuovo:
 * chi lo riceve senza averlo chiesto capisce subito che cosa sta succedendo.
 * Nickname e codice sono gia' controllati (lettere, numeri, punto, trattino e
 * underscore), quindi nell'HTML non serve altro.
 */
export function nicknameMessage(
  nickname: string,
  nuovo: string,
  code: string,
  minuti: number,
): Omit<EmailMessage, 'to'> {
  return {
    subject: `${code} è il codice per cambiare il nickname su Game Hub`,
    text: [
      `Ciao ${nickname},`,
      `per cambiare il nickname in «${nuovo}» il codice è:`,
      code,
      `Il codice vale ${minuti} minuti. Se non l’hai chiesto tu, ignora questo messaggio:` +
        ' senza il codice il nickname resta quello di adesso.',
      'giochi.simonerecchia.com',
    ].join('\n\n'),
    html: layout(
      `Ciao ${nickname}, cambi il nickname?`,
      `<p style="margin:0 0 8px;font-size:15px;color:#3c3c43;line-height:1.5">Il nickname nuovo sarà:</p>
      <p style="margin:0 0 24px;font-size:26px;font-weight:700;letter-spacing:0.5px">${nuovo}</p>
      ${blocoCodice(code)}
      <p style="margin:20px 0 0;font-size:14px;color:#3c3c43;line-height:1.5">
        Il codice vale <strong>${minuti} minuti</strong>. Se non l’hai chiesto tu, ignora questo
        messaggio: senza il codice il nickname resta quello di adesso.
      </p>`,
    ),
  }
}

/**
 * Il codice che sblocca il pannello di amministrazione. Dice che cosa apre:
 * chi lo riceve senza averlo chiesto deve capire che qualcuno ci sta provando.
 */
export function adminMessage(nickname: string, code: string, minuti: number): Omit<EmailMessage, 'to'> {
  return {
    subject: `${code} è il codice per il pannello di amministrazione di Game Hub`,
    text: [
      `Ciao ${nickname},`,
      `il codice per aprire il pannello di amministrazione è:`,
      code,
      `Il codice vale ${minuti} minuti. Se non l’hai chiesto tu, qualcuno ha la tua sessione:` +
        ' esci da tutti i dispositivi dal profilo.',
      'giochi.simonerecchia.com/admin',
    ].join('\n\n'),
    html: layout(
      `Ciao ${nickname}, ecco il codice per il pannello`,
      `${blocoCodice(code)}
      <p style="margin:20px 0 0;font-size:14px;color:#3c3c43;line-height:1.5">
        Il codice vale <strong>${minuti} minuti</strong>. Se non l’hai chiesto tu, qualcuno ha la tua
        sessione: esci da tutti i dispositivi dal profilo.
      </p>`,
    ),
  }
}
