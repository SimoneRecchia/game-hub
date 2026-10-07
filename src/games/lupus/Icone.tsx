import type { ReactNode } from 'react'
import type { IdPersonaggio } from '@shared/lupus-personaggi'

/**
 * Le icone di Lupus, dal Lupus di prima: silhouette piatte disegnate a mano,
 * tutte sullo stesso reticolo di 64 per 64 e riempite col colore del testo. Il
 * secondo colore (`ALT`) e' quello dei dettagli scavati — gli occhi, il naso —
 * e prende il colore di chi le contiene, da `--icona-alt`: nel tondo di un
 * personaggio e' il suo colore, cosi' gli occhi sembrano buchi.
 */
export type NomeIcona =
  | IdPersonaggio
  | 'fantasma'
  | 'luna'
  | 'sole'
  | 'teschio'
  | 'corona'
  | 'telefono'
  | 'mondo'
  | 'nascosto'
  | 'gente'
  | 'branco'
  | 'paese'
  | 'solitario'

const ALT = 'var(--icona-alt, var(--surface))'

const DISEGNI: Record<NomeIcona, ReactNode> = {
  // Il cappello di paglia.
  villico: (
    <>
      <path d="M32 10c-8 0-13 6-13 15v6h26v-6c0-9-5-15-13-15z" />
      <ellipse cx="32" cy="34" rx="26" ry="8" />
      <path d="M8 36c4 6 13 9 24 9s20-3 24-9v5c-4 6-13 10-24 10S12 47 8 41z" />
      <rect x="19" y="27" width="26" height="4" fill={ALT} />
    </>
  ),
  lupo: (
    <>
      <path d="M32 62C19 53 11 42 11 29L6 4l17 15c3-2 6-3 9-3s6 1 9 3L58 4l-5 25c0 13-8 24-21 33z" />
      <path d="M32 62l-6-11h12z" fill={ALT} />
      <circle cx="32" cy="53" r="2.2" />
      <path d="M18 31l9 3-1 6-8-3z M46 31l-9 3 1 6 8-3z" fill={ALT} />
    </>
  ),
  veggente: (
    <>
      <path d="M32 16C18 16 8 26 4 32c4 6 14 16 28 16s24-10 28-16c-4-6-14-16-28-16z" />
      <circle cx="32" cy="32" r="10" fill={ALT} />
      <circle cx="32" cy="32" r="5.5" />
      <circle cx="35" cy="29" r="1.8" fill={ALT} />
    </>
  ),
  medium: (
    <>
      <circle cx="32" cy="28" r="18" />
      <path d="M18 50h28l4 8H14z" />
      <path d="M22 22c2-5 6-8 11-9" stroke={ALT} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M40 8l1.5 4 4 1.5-4 1.5L40 19l-1.5-4-4-1.5 4-1.5z" />
    </>
  ),
  indemoniato: (
    <>
      <path d="M14 8c0 8 4 14 8 17h20c4-3 8-9 8-17-5 3-8 8-9 12H23c-1-4-4-9-9-12z" />
      <path d="M32 22c-11 0-17 8-17 18s6 18 17 18 17-8 17-18-6-18-17-18z" />
      <path d="M23 34l6 3-6 3z M41 34l-6 3 6 3z" fill={ALT} />
      <path d="M25 46c3 3 11 3 14 0l-2 4c-3 2-7 2-10 0z" fill={ALT} />
    </>
  ),
  guardia: (
    <>
      <path d="M32 4l24 8v18c0 14-10 24-24 30C18 54 8 44 8 30V12z" />
      <path d="M30 18h4v10h10v4H34v12h-4V32H20v-4h10z" fill={ALT} />
    </>
  ),
  gufo: (
    <>
      <path d="M14 10l8 8h20l8-8v22c0 14-8 24-18 26C22 56 14 46 14 32z" />
      <circle cx="24" cy="28" r="7" fill={ALT} />
      <circle cx="40" cy="28" r="7" fill={ALT} />
      <circle cx="24" cy="28" r="3.5" />
      <circle cx="40" cy="28" r="3.5" />
      <path d="M32 33l-4 7h8z" fill={ALT} />
      <path d="M22 50l4 6 3-6 3 6 3-6 3 6 4-6" stroke={ALT} strokeWidth="2.5" fill="none" />
    </>
  ),
  massone: (
    <>
      <path d="M32 6l3 4-14 40 5 2L32 22l6 30 5-2L29 10z" />
      <circle cx="32" cy="12" r="5" />
      <path d="M10 44l22-8 22 8-2 5-20-7-20 7z" />
      <path d="M12 50h40v6H12z" />
    </>
  ),
  criceto: (
    <>
      <circle cx="18" cy="16" r="9" />
      <circle cx="46" cy="16" r="9" />
      <circle cx="18" cy="16" r="4" fill={ALT} />
      <circle cx="46" cy="16" r="4" fill={ALT} />
      <path d="M32 18c-14 0-22 10-22 22s10 18 22 18 22-6 22-18-8-22-22-22z" />
      <circle cx="24" cy="36" r="3" fill={ALT} />
      <circle cx="40" cy="36" r="3" fill={ALT} />
      <path d="M29 44h6l-3 4z" fill={ALT} />
      <path
        d="M14 46c4 2 8 2 12 0M38 46c4 2 8 2 12 0"
        stroke={ALT}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  mitomane: (
    <>
      <path d="M32 6C16 6 8 14 8 26c0 16 10 30 24 32 14-2 24-16 24-32C56 14 48 6 32 6z" />
      <path d="M16 26c4-4 10-4 14 0-4 2-10 2-14 0z M34 26c4-4 10-4 14 0-4 2-10 2-14 0z" fill={ALT} />
      <path d="M20 40c6 6 18 6 24 0-2 8-8 12-12 12s-10-4-12-12z" fill={ALT} />
    </>
  ),
  lara: (
    <>
      <path
        d={
          'M50 2c-7 2-12 8-12 15 0 4 2 8 5 10-8-1-14-7-14-15C29 5 33 0 39 0c-8-1-16 5-16 15 0 9 8 16 17 16 ' +
          '4 0 7-1 10-3-7 0-12-5-12-12 0-6 5-11 12-14z'
        }
        opacity="0.65"
      />
      <path d="M30 64C19 56 12 46 12 35L8 14l14 13c2-2 5-3 8-3s6 1 8 3l14-13-4 21c0 11-7 21-18 29z" />
      <path d="M30 64l-5-9h10z" fill={ALT} />
      <path d="M18 37l8 3-1 5-7-3z M42 37l-8 3 1 5 7-3z" fill={ALT} />
    </>
  ),
  mucca: (
    <>
      <path d="M6 14c0 8 6 12 12 12h28c6 0 12-4 12-12-4 2-8 6-10 8H16c-2-2-6-6-10-8z" />
      <path d="M32 18c-12 0-18 8-18 18v6c0 8 6 16 18 16s18-8 18-16v-6c0-10-6-18-18-18z" />
      <circle cx="24" cy="34" r="3.5" fill={ALT} />
      <circle cx="40" cy="34" r="3.5" fill={ALT} />
      <path d="M20 46c0-4 5-7 12-7s12 3 12 7-5 7-12 7-12-3-12-7z" fill={ALT} />
      <circle cx="27" cy="46" r="2" />
      <circle cx="37" cy="46" r="2" />
    </>
  ),
  darius: (
    <>
      <path d="M32 4C18 4 8 16 8 30v30h48V30C56 16 46 4 32 4z" />
      <path d="M32 16c-8 0-14 8-14 16 0 6 4 12 14 20 10-8 14-14 14-20 0-8-6-16-14-16z" fill={ALT} />
      <path d="M32 24c-6 0-10 5-12 8 2 3 6 8 12 8s10-5 12-8c-2-3-6-8-12-8z" />
      <circle cx="32" cy="32" r="4" fill={ALT} />
    </>
  ),
  baron: (
    <>
      <path d="M20 6h24v14h8v6H12v-6h8z" />
      <path d="M32 26c-10 0-16 7-16 16 0 6 3 10 7 12v6h18v-6c4-2 7-6 7-12 0-9-6-16-16-16z" />
      <circle cx="26" cy="42" r="4" fill={ALT} />
      <circle cx="38" cy="42" r="4" fill={ALT} />
      <path d="M30 50h4v4h-4z M24 50h4v4h-4z M36 50h4v4h-4z" fill={ALT} />
    </>
  ),
  jekyll: (
    <>
      <path d="M26 4h12v4h-2v14l16 26c3 5 0 10-6 10H18c-6 0-9-5-6-10l16-26V8h-2z" />
      <path d="M22 40h20l6 10c1 2 0 4-2 4H18c-2 0-3-2-2-4z" fill={ALT} />
      <circle cx="30" cy="46" r="3" />
      <circle cx="38" cy="50" r="2" />
      <circle cx="26" cy="51" r="1.5" />
    </>
  ),
  cartomante: (
    <>
      <rect x="14" y="6" width="36" height="52" rx="5" transform="rotate(-8 32 32)" />
      <path
        d="M32 18l3.5 8 8.5 1-6.2 5.8 1.7 8.6L32 37l-7.5 4.4 1.7-8.6L20 27l8.5-1z"
        fill={ALT}
        transform="rotate(-8 32 32)"
      />
      <circle cx="22" cy="14" r="2" fill={ALT} transform="rotate(-8 32 32)" />
      <circle cx="42" cy="50" r="2" fill={ALT} transform="rotate(-8 32 32)" />
    </>
  ),
  purple: (
    <>
      <path d="M40 40l16 16-5 5-16-16z" />
      <circle cx="27" cy="27" r="20" />
      <circle cx="27" cy="27" r="13" fill={ALT} />
      <path d="M18 26c1-5 4-8 9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
  mortovivo: (
    <>
      <path d="M14 26c0-12 8-20 18-20s18 8 18 20v26H14z" />
      <path d="M30 18h4v8h8v4h-8v12h-4V30h-8v-4h8z" fill={ALT} />
      <path d="M6 52h52v6H6z" />
    </>
  ),
  // Un teschio tenuto in mano.
  amleto: (
    <>
      <path d="M32 4C21 4 14 12 14 22c0 6 3 10 6 13v7h24v-7c3-3 6-7 6-13C50 12 43 4 32 4z" />
      <circle cx="25" cy="22" r="4" fill={ALT} />
      <circle cx="39" cy="22" r="4" fill={ALT} />
      <path d="M30 28h4l-2 5z" fill={ALT} />
      <path d="M14 46c4-4 10-4 14-1l4 3 4-3c4-3 10-3 14 1v6c0 5-4 8-8 8H22c-4 0-8-3-8-8z" />
      <path d="M26 50h12v3H26z" fill={ALT} />
    </>
  ),
  // Un ritratto in cornice, e dentro un lupo.
  dorian: (
    <>
      <path d="M8 6h48v52H8z" />
      <path d="M14 12h36v40H14z" fill={ALT} />
      <path d="M32 48c-7-5-11-11-11-18l-2-11 8 7c1-1 3-2 5-2s4 1 5 2l8-7-2 11c0 7-4 13-11 18z" />
    </>
  ),
  fantasma: (
    <>
      <path d="M32 6C20 6 12 16 12 28v30l6-5 7 5 7-5 7 5 7-5 6 5V28C52 16 44 6 32 6z" />
      <circle cx="25" cy="28" r="4" fill={ALT} />
      <circle cx="39" cy="28" r="4" fill={ALT} />
      <ellipse cx="32" cy="40" rx="3" ry="4" fill={ALT} />
    </>
  ),
  luna: (
    <path d="M40 6c-14 3-24 15-24 28 0 13 10 24 24 26-6 3-14 3-20 0C9 55 4 44 4 32 4 18 14 8 28 4c4-1 8 0 12 2z" />
  ),
  sole: (
    <>
      <circle cx="32" cy="32" r="12" />
      <path
        d="M32 4v10M32 50v10M4 32h10M50 32h10M12 12l7 7M45 45l7 7M12 52l7-7M45 19l7-7"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </>
  ),
  teschio: (
    <>
      <path d="M32 4C18 4 10 14 10 26c0 8 4 13 8 16v10h28V42c4-3 8-8 8-16C54 14 46 4 32 4z" />
      <circle cx="24" cy="28" r="5" fill={ALT} />
      <circle cx="40" cy="28" r="5" fill={ALT} />
      <path d="M30 34h4l-2 5z" fill={ALT} />
      <path d="M22 60h20v-6H22z" />
    </>
  ),
  corona: <path d="M8 22l12 10 12-18 12 18 12-10-6 30H14z" />,
  telefono: (
    <>
      <rect x="16" y="4" width="32" height="56" rx="6" />
      <rect x="20" y="10" width="24" height="40" rx="2" fill={ALT} />
      <circle cx="32" cy="55" r="2.5" fill={ALT} />
    </>
  ),
  mondo: (
    <>
      <circle cx="32" cy="32" r="26" />
      <path
        d="M32 6c-8 8-8 44 0 52M32 6c8 8 8 44 0 52M6 32h52M10 20h44M10 44h44"
        stroke={ALT}
        strokeWidth="3"
        fill="none"
      />
    </>
  ),
  nascosto: (
    <>
      <path d="M32 16C18 16 8 26 4 32c3 4 8 10 15 13l6-6a10 10 0 0 1 14-14l5-5c-4-2-8-4-12-4z" />
      <path d="M60 32c-2-3-5-7-9-10L34 39a10 10 0 0 1-2-1l-5 5c2 1 3 1 5 1 14 0 24-10 28-12z" />
      <path d="M10 56L54 12l4 4L14 60z" />
    </>
  ),
  gente: (
    <>
      <circle cx="22" cy="20" r="10" />
      <circle cx="44" cy="24" r="8" />
      <path d="M4 52c0-10 8-18 18-18s18 8 18 18z" />
      <path d="M40 52c0-6-2-11-5-15 3-2 6-3 9-3 9 0 16 7 16 16z" />
    </>
  ),
  branco: (
    <>
      <path d="M32 62C19 53 11 42 11 29L6 4l17 15c3-2 6-3 9-3s6 1 9 3L58 4l-5 25c0 13-8 24-21 33z" />
      <path d="M32 62l-6-11h12z" fill={ALT} />
      <path d="M18 31l9 3-1 6-8-3z M46 31l-9 3 1 6 8-3z" fill={ALT} />
    </>
  ),
  paese: (
    <>
      <path d="M32 6L6 30h8v26h36V30h8z" />
      <rect x="26" y="38" width="12" height="18" fill={ALT} />
    </>
  ),
  solitario: <path d="M32 4l7 17 18 2-13 12 4 18-16-9-16 9 4-18L6 23l18-2z" />,
}

export function IconaLupus({
  nome,
  size = 24,
  className,
  titolo,
}: {
  nome: NomeIcona
  size?: number | string
  className?: string
  /** Il nome per chi non vede; senza, l'icona e' decorativa. */
  titolo?: string
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden={titolo ? undefined : true}
      role={titolo ? 'img' : undefined}
      focusable="false"
    >
      {titolo ? <title>{titolo}</title> : null}
      {DISEGNI[nome]}
    </svg>
  )
}
