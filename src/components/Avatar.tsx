import { AVATAR_COLORS } from '@shared/config'
import './Avatar.css'

interface Props {
  nickname: string
  color?: string
  size?: number
  /** Anello dorato/argento/bronzo per il podio. */
  medal?: 1 | 2 | 3 | null
}

/** Colore stabile derivato dal nickname, così l'avatar non cambia mai. */
export function colorForNickname(nickname: string): string {
  let hash = 0
  for (let i = 0; i < nickname.length; i += 1) {
    hash = (hash * 31 + nickname.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(nickname: string): string {
  const cleaned = nickname.replace(/[^a-zA-Z0-9]/g, '')
  if (cleaned.length === 0) return '?'
  if (cleaned.length === 1) return cleaned.toUpperCase()
  return (cleaned[0] + cleaned[1]).toUpperCase()
}

export function Avatar({ nickname, color, size = 40, medal = null }: Props) {
  const bg = color ?? colorForNickname(nickname)
  return (
    <span
      className={`avatar${medal ? ` avatar--medal-${medal}` : ''}`}
      style={{
        width: size,
        height: size,
        // Il colore della persona, schiarito: una faccina pastello con l'inchiostro sopra, come gli adesivi.
        background: `color-mix(in srgb, ${bg} 58%, #fff)`,
        borderWidth: size >= 32 ? 2.5 : 2,
        fontSize: Math.round(size * 0.4),
      }}
      aria-hidden="true"
    >
      {initials(nickname)}
    </span>
  )
}
