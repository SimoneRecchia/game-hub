/**
 * I campi che si scrivono negli account — il nickname, l'email, il codice — letti
 * dal corpo di una richiesta: li controllano l'accesso e il pannello di
 * amministrazione, con gli stessi messaggi.
 */

import { CODE_LENGTH, EMAIL_MAX, EMAIL_PATTERN, NICKNAME_MAX, NICKNAME_MIN, NICKNAME_PATTERN } from '../../shared/config'
import { fail } from './http'

export function readNickname(value: unknown): string {
  if (typeof value !== 'string') fail(400, 'BAD_REQUEST', 'Richiesta non valida.')
  const nickname = value.trim()
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    fail(400, 'NICKNAME_LENGTH', `Il nickname deve avere fra ${NICKNAME_MIN} e ${NICKNAME_MAX} caratteri.`)
  }
  if (!NICKNAME_PATTERN.test(nickname)) {
    fail(400, 'NICKNAME_CHARS', 'Il nickname può contenere solo lettere, numeri, punto, trattino e underscore.')
  }
  return nickname
}

export function readEmail(value: unknown): string {
  if (typeof value !== 'string') fail(400, 'EMAIL_REQUIRED', 'Scrivi l’email.')
  const email = value.trim()
  if (email.length === 0) fail(400, 'EMAIL_REQUIRED', 'Scrivi l’email.')
  if (email.length > EMAIL_MAX) fail(400, 'EMAIL_INVALID', "Questa email è troppo lunga.")
  if (!EMAIL_PATTERN.test(email)) fail(400, 'EMAIL_INVALID', "Questa email non sembra valida.")
  return email
}

export function readCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim() : ''
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
    fail(400, 'BAD_CODE_FORMAT', `Il codice è di ${CODE_LENGTH} cifre.`)
  }
  return code
}
