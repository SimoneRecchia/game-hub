/**
 * Le icone dell'app, da un disegno solo: public/icon.svg e favicon.svg, i PNG
 * che ne servono a iOS, ad Android e ai browser, e l'impronta che ne cambia
 * l'indirizzo a ogni versione nuova.
 *
 * Su iOS 26 l'icona di un'app web passa dal Liquid Glass come quella di
 * un'app che non e' stata rifatta: il sistema ci stende sopra il vetro, con la
 * luce sul bordo, e ne ricava da solo le versioni scura, trasparente e
 * colorata, separando il disegno dal fondo. I livelli di Icon Composer sono
 * solo delle app native, quindi l'icona e' fatta per quel passaggio:
 *
 *   - piena e quadrata (apple-touch-icon.png, 1024 punti): gli angoli li
 *     taglia iOS, un pixel trasparente diventerebbe nero, e a 180 punti le
 *     icone grandi della Home la ingrandirebbero;
 *   - piatta: niente ombre ne' riflessi disegnati, che sotto il vetro
 *     farebbero una seconda luce;
 *   - un fondo quasi a tinta unita e le copertine molto piu' chiare di lui,
 *     con i segni bianchi: senza i colori resta la luminosita', ed e' quella
 *     che separa il disegno dal fondo (un test la misura);
 *   - il disegno a un quinto dal bordo: in basso il vetro fa da lente, e
 *     schiarisce e stira quel che ci passa sotto.
 *
 * Gli indirizzi delle icone portano l'impronta (?v=) in index.html, nel
 * manifest e nella barra laterale: Safari tiene le icone per indirizzo, e chi
 * rimette l'app sulla Home si vedrebbe ancora quella di prima.
 *
 * sharp arriva con wrangler (miniflare lo usa per le immagini).
 *
 *   npm run icone
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBBLICO = join(RADICE, 'public')

/** Il fondo, dall'alto in basso: l'indaco dell'app (--brand), quasi a tinta unita. */
export const FONDO = ['#4f46e5', '#4337d2']

/**
 * Le copertine dei quattro giochi: i loro colori (tokens.css), un tono piu'
 * chiari, perche' si stacchino dal fondo anche quando iOS toglie i colori.
 */
export const COPERTINE = {
  wordle: ['#4fd96a', '#22b45e'],
  scarabeo: ['#ffc54f', '#f2911f'],
  cruciverba: ['#66a8ff', '#4d8df7'],
  battaglia: ['#3ccbec', '#1b9ac6'],
}

/**
 * I file, con il disegno di ognuno. `quadrata` e' a filo, senza angoli tondi
 * e senza trasparenze; `scala` rimpicciolisce le copertine attorno al centro,
 * per la zona sicura delle maschere di Android (un cerchio di raggio 0,4).
 */
export const PNG = [
  { file: 'apple-touch-icon.png', lato: 1024, forma: 'quadrata' },
  { file: 'icon-192.png', lato: 192 },
  { file: 'icon-512.png', lato: 512 },
  { file: 'icon-maskable-512.png', lato: 512, forma: 'quadrata', scala: 0.9 },
  { file: 'icon-monochrome-512.png', lato: 512, mono: true, scala: 0.8 },
  { file: 'favicon-32.png', lato: 32 },
]

export const SVG = ['icon.svg', 'favicon.svg']

/** I file che fanno riferimento alle icone, con l'impronta nell'indirizzo. */
export const CON_GLI_INDIRIZZI = ['index.html', 'public/manifest.webmanifest', 'src/components/Shell.tsx']

/** L'indirizzo di un'icona, con l'impronta se c'e'. */
export const INDIRIZZO_ICONA = /(\/(?:icon|favicon|apple-touch-icon)[\w-]*\.(?:png|svg))(?:\?v=([0-9a-f]+))?/g

function sfumatura(id, [da, a]) {
  return [
    `    <linearGradient id="${id}" x1="0" y1="0" x2="0.45" y2="1">`,
    `      <stop offset="0" stop-color="${da}"/>`,
    `      <stop offset="1" stop-color="${a}"/>`,
    '    </linearGradient>',
  ]
}

/**
 * Il disegno, in un quadrato di 512. `tonda` ha gli angoli dell'icona, per i
 * browser; `quadrata` e' a filo, per chi gli angoli li taglia da se'.
 * `mono` e' la sagoma per le icone a un colore solo: delle icone conta solo
 * l'alfa, quindi le copertine sono piene e i segni sono buchi.
 */
export function disegno({ forma = 'tonda', scala = 1, mono = false } = {}) {
  // Nella monocroma il disegno e' una maschera: bianco quel che resta, nero i buchi.
  const copertina = (gioco) => (mono ? '#fff' : `url(#${gioco})`)
  const segno = mono ? '#000' : '#fff'
  const tessera = mono ? '#000' : '#fff4dc'
  const lettera = mono ? '#fff' : '#5a3a0c'
  const opaco = (o) => (o < 1 ? ` fill-opacity="${o}"` : '')

  const quadro = (gioco, x, y) =>
    `<rect x="${x}" y="${y}" width="148" height="148" rx="38" fill="${copertina(gioco)}"/>`
  const caselle = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // Le caselle nere stanno sulla diagonale, e sono un bianco appena accennato.
      const [x, y, tono] = [118 + c * 38, 286 + r * 38, opaco(r + c === 2 ? 0.25 : 1)]
      caselle.push(`    <rect x="${x}" y="${y}" width="32" height="32" rx="6" fill="${segno}"${tono}/>`)
    }
  }

  const copertine = [
    '    <!-- Wordle: una riga di tentativi. -->',
    `    ${quadro('wordle', 98, 98)}`,
    ...[113, 155, 197].map(
      (x, i) => `    <rect x="${x}" y="155" width="34" height="34" rx="8" fill="${segno}"${opaco(i === 1 ? 0.5 : 1)}/>`,
    ),
    '',
    '    <!-- Scarabeo: due tessere di legno. -->',
    `    ${quadro('scarabeo', 266, 98)}`,
    '    <g transform="rotate(-10 309 169)">',
    `      <rect x="282" y="142" width="54" height="54" rx="12" fill="${tessera}"/>`,
    `      <rect x="298" y="155" width="9" height="28" rx="3" fill="${lettera}"/>`,
    `      <rect x="298" y="174" width="24" height="9" rx="3" fill="${lettera}"/>`,
    '    </g>',
    '    <g transform="rotate(12 372 176)">',
    `      <rect x="347" y="151" width="50" height="50" rx="11" fill="${tessera}"/>`,
    `      <circle cx="372" cy="176" r="11.5" fill="none" stroke="${lettera}" stroke-width="9"/>`,
    '    </g>',
    '',
    '    <!-- Cruciverba: una griglia con le caselle nere. -->',
    `    ${quadro('cruciverba', 98, 266)}`,
    ...caselle,
    '',
    '    <!-- Battaglia navale: un bersaglio. -->',
    `    ${quadro('battaglia', 266, 266)}`,
    `    <circle cx="340" cy="340" r="44" fill="none" stroke="${segno}" stroke-opacity="0.55" stroke-width="10"/>`,
    `    <circle cx="340" cy="340" r="24" fill="none" stroke="${segno}" stroke-width="10"/>`,
    `    <circle cx="340" cy="340" r="8" fill="${segno}"/>`,
  ]
  const trasforma = scala === 1 ? '' : ` transform="translate(256 256) scale(${scala}) translate(-256 -256)"`

  const righe = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"' +
      ' role="img" aria-label="Giochi">',
    '  <!--',
    "    L'icona dell'app: le copertine dei quattro giochi, come le icone di una",
    "    cartella sulla schermata Home, sull'indaco dell'app. La scrive",
    "    scripts/genera-icone.mjs, che ne fa anche i PNG: si cambia li'.",
    '  -->',
  ]
  if (mono) {
    righe.push(
      '  <defs>',
      '    <mask id="sagoma" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">',
      `      <g id="copertine"${trasforma}>`,
      ...copertine.map((riga) => (riga ? `    ${riga}` : riga)),
      '      </g>',
      '    </mask>',
      '  </defs>',
      '  <rect width="512" height="512" fill="#000" mask="url(#sagoma)"/>',
    )
  } else {
    righe.push(
      '  <defs>',
      ...sfumatura('fondo', FONDO),
      ...Object.entries(COPERTINE).flatMap(([gioco, toni]) => sfumatura(gioco, toni)),
      '  </defs>',
      '',
      `  <rect width="512" height="512"${forma === 'tonda' ? ' rx="114"' : ''} fill="url(#fondo)"/>`,
      '',
      `  <g id="copertine"${trasforma}>`,
      ...copertine,
      '  </g>',
    )
  }
  righe.push('</svg>', '')
  return righe.join('\n')
}

/** L'impronta delle icone: cambia con qualunque dei file, e sta negli indirizzi. */
export function improntaDelleIcone(cartella = PUBBLICO) {
  const hash = createHash('sha256')
  for (const file of [...SVG, ...PNG.map((p) => p.file)]) hash.update(readFileSync(join(cartella, file)))
  return hash.digest('hex').slice(0, 8)
}

async function main() {
  let sharp
  try {
    ;({ default: sharp } = await import('sharp'))
  } catch {
    console.error("Serve sharp, che arriva con wrangler: prima npm install (o, se un giorno mancasse, npm i -D sharp).")
    process.exit(1)
  }

  const svg = disegno()
  for (const file of SVG) writeFileSync(join(PUBBLICO, file), svg)

  for (const { file, lato, ...opzioni } of PNG) {
    // Il disegno e' largo 512: la densita' lo porta al lato del file, senza ridimensionare dopo.
    let immagine = sharp(Buffer.from(disegno(opzioni)), { density: (72 * lato) / 512 })
    if (opzioni.forma === 'quadrata') immagine = immagine.removeAlpha()
    await immagine.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(join(PUBBLICO, file))
  }

  const impronta = improntaDelleIcone()
  for (const file of CON_GLI_INDIRIZZI) {
    const percorso = join(RADICE, file)
    const prima = readFileSync(percorso, 'utf8')
    const dopo = prima.replace(INDIRIZZO_ICONA, (_, indirizzo) => `${indirizzo}?v=${impronta}`)
    if (dopo !== prima) writeFileSync(percorso, dopo)
  }
  console.log(`${SVG.length + PNG.length} icone in public/, impronta ${impronta}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
