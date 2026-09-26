/**
 * Icone inline in stile SF Symbols: tratto 1.8, terminazioni tonde.
 * Inline invece che da libreria per non aggiungere peso al bundle.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconGames = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2.2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2" />
  </Svg>
)

export const IconTrophy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5.5H4.6a.6.6 0 0 0-.6.7c.2 2 1.3 3.6 3 4.1" />
    <path d="M17 5.5h2.4c.4 0 .7.3.6.7-.2 2-1.3 3.6-3 4.1" />
    <path d="M12 14v3.5" />
    <path d="M8.5 20.5h7l-.7-2.2a1 1 0 0 0-1-.8h-3.6a1 1 0 0 0-1 .8l-.7 2.2Z" />
  </Svg>
)

export const IconPerson = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20.2c1.2-3.5 4-5.2 7.5-5.2s6.3 1.7 7.5 5.2" />
  </Svg>
)

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Svg>
)

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Svg>
)

export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5v11" />
    <path d="M8.2 7.3 12 3.5l3.8 3.8" />
    <path d="M6 12.5H5a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5v-5a1.5 1.5 0 0 0-1.5-1.5h-1" />
  </Svg>
)

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Svg>
)

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10.5" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </Svg>
)

export const IconBackspace = (p: IconProps) => (
  <Svg {...p} viewBox="0 0 24 24">
    <path d="M9 4.5h10.5A1.5 1.5 0 0 1 21 6v12a1.5 1.5 0 0 1-1.5 1.5H9L2.6 12.7a1 1 0 0 1 0-1.4L9 4.5Z" />
    <path d="M11.5 9.5l5 5M16.5 9.5l-5 5" />
  </Svg>
)

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </Svg>
)

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Svg>
)

export const IconAuto = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconFlame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c3.6 0 6-2.4 6-5.6 0-4.3-4.2-5.6-3.3-10.4C12.3 6.3 10 8.6 10 11c-.9-.6-1.4-1.6-1.5-2.8C7 9.6 6 11.9 6 14.4 6 18.2 8.6 21 12 21Z" />
  </Svg>
)

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 4.5h3A2 2 0 0 1 19.5 6.5v11a2 2 0 0 1-2 2h-3" />
    <path d="M11 8.5 14.5 12 11 15.5" />
    <path d="M14.5 12h-10" />
  </Svg>
)

export const IconPeople = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.8 20c1-3 3.3-4.5 6.2-4.5s5.2 1.5 6.2 4.5" />
    <path d="M16.2 5.2a3.2 3.2 0 0 1 0 6" />
    <path d="M18 15.8c2 .5 3.4 1.9 4.2 4.2" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.8 9.6 17.4 19 8" />
  </Svg>
)

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2.6" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
)

/* ───────────────────────────  Le varianti piene della tab bar  ─────────────────────────── */

/** Le icone della tab bar hanno due stati, come in iOS: il contorno a riposo, il pieno quando e' la sezione aperta. */
export const IconGamesFill = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="3" y="3" width="7.8" height="7.8" rx="2.4" />
    <rect x="13.2" y="3" width="7.8" height="7.8" rx="2.4" />
    <rect x="3" y="13.2" width="7.8" height="7.8" rx="2.4" />
    <rect x="13.2" y="13.2" width="7.8" height="7.8" rx="2.4" />
  </Svg>
)

export const IconTrophyFill = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="currentColor" />
    <path d="M7 5.5H4.6a.6.6 0 0 0-.6.7c.2 2 1.3 3.6 3 4.1" />
    <path d="M17 5.5h2.4c.4 0 .7.3.6.7-.2 2-1.3 3.6-3 4.1" />
    <path d="M12 14v3.5" />
    <path d="M8.5 20.5h7l-.7-2.2a1 1 0 0 0-1-.8h-3.6a1 1 0 0 0-1 .8l-.7 2.2Z" fill="currentColor" />
  </Svg>
)

export const IconPersonFill = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <circle cx="12" cy="7.8" r="4" />
    <path d="M3.9 20.1C5 16.1 8 14.2 12 14.2s7 1.9 8.1 5.9c.2.7-.3 1.4-1 1.4H4.9c-.7 0-1.2-.7-1-1.4Z" />
  </Svg>
)

/* ───────────────────────────────────  Le altre  ─────────────────────────────────── */

export const IconPlay = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10.2-6.4a1 1 0 0 0 0-1.8L9.6 4.7C8.9 4.3 8 4.8 8 5.6Z" />
  </Svg>
)

export const IconShuffle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7h3.2c2 0 3.2 1 4.3 2.6l2 3c1.1 1.6 2.3 2.4 4.3 2.4h3.2" />
    <path d="M3.5 17h3.2c1.6 0 2.7-.6 3.6-1.6" />
    <path d="M13.7 8.6C14.6 7.6 15.7 7 17.3 7h3.2" />
    <path d="M18 4.5 20.5 7 18 9.5" />
    <path d="M18 14.5 20.5 17 18 19.5" />
  </Svg>
)

export const IconComputer = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="11.5" rx="2.2" />
    <path d="M9 20h6" />
    <path d="M12 16v4" />
    <circle cx="9.5" cy="10.2" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="10.2" r="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.2 13.8a3.8 3.8 0 0 0 5.4 0l3-3a3.8 3.8 0 0 0-5.4-5.4l-1 1" />
    <path d="M13.8 10.2a3.8 3.8 0 0 0-5.4 0l-3 3a3.8 3.8 0 0 0 5.4 5.4l1-1" />
  </Svg>
)

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2.4" />
    <path d="M16 8V6.4A2.4 2.4 0 0 0 13.6 4H6.4A2.4 2.4 0 0 0 4 6.4v7.2A2.4 2.4 0 0 0 6.4 16H8" />
  </Svg>
)

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)

export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.8 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8L12 3.8Z" />
  </Svg>
)

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18V5.5Z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 0 20 18V5.5Z" />
  </Svg>
)

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconBolt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 3.5 5.5 13.2h5.8L10.5 20.5 18.5 10.8h-5.8L13 3.5Z" />
  </Svg>
)

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" />
    <path d="M18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2 1-2.5 2.5-.3-1.5-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z" />
  </Svg>
)

export const IconTarget = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.6" />
    <path d="M3.5 9.5h17" />
    <path d="M8 3v4M16 3v4" />
  </Svg>
)

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.4" />
    <path d="m4.5 7 7.5 6 7.5-6" />
  </Svg>
)

export const IconKey = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="m11.3 11.7 8.2-8.2" />
    <path d="m16.5 6.5 2.5 2.5" />
    <path d="m14 9 1.8 1.8" />
  </Svg>
)

export const IconList = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </Svg>
)
