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
 *   - un fondo quasi a tinta unita e il disegno molto piu' chiaro di lui: senza
 *     i colori resta la luminosita', ed e' quella che separa il disegno dal
 *     fondo, e i punti dal dado (un test la misura);
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
 * Le due tessere a ventaglio dietro il dado: il verde e il giallo del Wordle,
 * un tono piu' chiari di quelli del gioco, perche' si stacchino dal fondo anche
 * quando iOS toglie i colori.
 */
export const TESSERE = {
  verde: ['#4fd96a', '#22b45e'],
  giallo: ['#ffc54f', '#f2911f'],
}

/**
 * I punti del cinque, dall'alto a sinistra: i colori di quattro giochi (il
 * Wordle, lo Scarabeo, il cruciverba e il quiz, tokens.css) agli angoli, e in
 * mezzo l'indaco dell'app, che li tiene insieme. Sono i toni scuri dei giochi:
 * sul bianco del dado devono restare punti anche senza i colori.
 */
export const PUNTI = {
  wordle: '#22b45e',
  scarabeo: '#f2911f',
  app: '#4f46e5',
  cruciverba: '#4d8df7',
  quiz: '#f0506e',
}

/**
 * I file, con il disegno di ognuno. `quadrata` e' a filo, senza angoli tondi
 * e senza trasparenze; `scala` rimpicciolisce il disegno attorno al centro,
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
export const CON_GLI_INDIRIZZI = [
  'index.html',
  'public/manifest.webmanifest',
  'src/components/Shell.tsx',
  'src/pages/admin/Admin.tsx',
]

/** L'indirizzo di un'icona, con l'impronta se c'e'. */
export const INDIRIZZO_ICONA = /(\/(?:icon|favicon|apple-touch-icon)[\w-]*\.(?:png|svg))(?:\?v=([0-9a-f]+))?/g

/**
 * Le misure del disegno, in un quadrato di 512. Le usa anche il marchio
 * dell'app (src/components/Marchio.tsx), che lo ridisegna con i pezzi veri.
 */
export const MISURE = {
  tessera: { lato: 172, raggio: 42, x: 52, y: -26, angolo: 17 },
  dado: { lato: 188, raggio: 48, solco: 12 },
  punto: { passo: 50, raggio: 19 },
  centro: { x: 256, y: 270 },
}

function sfumatura(id, [da, a], spazio = '') {
  return [
    `    <linearGradient id="${id}" ${spazio || 'x1="0" y1="0" x2="0.45" y2="1"'}>`,
    `      <stop offset="0" stop-color="${da}"/>`,
    `      <stop offset="1" stop-color="${a}"/>`,
    '    </linearGradient>',
  ]
}

/**
 * Il disegno, in un quadrato di 512: un dado bianco con il cinque, davanti a
 * due tessere aperte a ventaglio come una mano. Il dado dice "si gioca", e i
 * suoi punti hanno i colori dei giochi; le tessere sono quelle delle parole, e
 * aperte cosi' anche le carte. Fra il dado e le tessere c'e' un solco del
 * colore del fondo, che li separa senza un'ombra.
 *
 * `tonda` ha gli angoli dell'icona, per i browser; `quadrata` e' a filo, per
 * chi gli angoli li taglia da se'. `mono` e' la sagoma per le icone a un
 * colore solo: delle icone conta solo l'alfa, quindi il solco e i punti sono
 * buchi.
 */
export function disegno({ forma = 'tonda', scala = 1, mono = false } = {}) {
  const { tessera, dado, punto, centro } = MISURE
  const pieno = (id) => (mono ? '#fff' : `url(#${id})`)
  const buco = (colore) => (mono ? '#000' : colore)

  const unaTessera = (id, verso) => {
    const [cx, cy] = [centro.x + verso * tessera.x, centro.y + tessera.y]
    const [x, y] = [cx - tessera.lato / 2, cy - tessera.lato / 2]
    return (
      `    <rect x="${x}" y="${y}" width="${tessera.lato}" height="${tessera.lato}" rx="${tessera.raggio}"` +
      ` fill="${pieno(id)}" transform="rotate(${verso * tessera.angolo} ${cx} ${cy})"/>`
    )
  }
  const [dx, dy] = [centro.x - dado.lato / 2, centro.y - dado.lato / 2]
  const posti = [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ]
  const punti = Object.values(PUNTI).map((colore, i) => {
    const [px, py] = posti[i]
    const [cx, cy] = [centro.x + px * punto.passo, centro.y + py * punto.passo]
    return `    <circle cx="${cx}" cy="${cy}" r="${punto.raggio}" fill="${buco(colore)}"/>`
  })

  const pezzi = [
    '    <!-- Le tessere, aperte a ventaglio dietro il dado. -->',
    unaTessera('verde', -1),
    unaTessera('giallo', 1),
    '',
    '    <!-- Il dado, con il solco che lo stacca dalle tessere. -->',
    `    <rect x="${dx}" y="${dy}" width="${dado.lato}" height="${dado.lato}" rx="${dado.raggio}"` +
      ` fill="#fff" stroke="${buco('url(#fondo)')}" stroke-width="${dado.solco}"/>`,
    '',
    '    <!-- Il cinque, con i colori dei giochi e quello dell\'app in mezzo. -->',
    ...punti,
  ]
  const trasforma = scala === 1 ? '' : ` transform="translate(256 256) scale(${scala}) translate(-256 -256)"`

  const righe = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"' +
      ' role="img" aria-label="Giochi">',
    '  <!--',
    "    L'icona dell'app: un dado con i punti nei colori dei giochi, davanti a",
    "    due tessere a ventaglio, sull'indaco dell'app. La scrive",
    "    scripts/genera-icone.mjs, che ne fa anche i PNG: si cambia li'.",
    '  -->',
  ]
  if (mono) {
    righe.push(
      '  <defs>',
      '    <mask id="sagoma" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">',
      `      <g id="disegno"${trasforma}>`,
      ...pezzi.map((riga) => (riga ? `    ${riga}` : riga)),
      '      </g>',
      '    </mask>',
      '  </defs>',
      '  <rect width="512" height="512" fill="#000" mask="url(#sagoma)"/>',
    )
  } else {
    righe.push(
      '  <defs>',
      // Nello spazio dell'icona, e non del pezzo: il solco del dado e' dello stesso colore del fondo che ha sotto.
      ...sfumatura('fondo', FONDO, 'gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="230" y2="512"'),
      ...Object.entries(TESSERE).flatMap(([id, toni]) => sfumatura(id, toni)),
      '  </defs>',
      '',
      `  <rect width="512" height="512"${forma === 'tonda' ? ' rx="114"' : ''} fill="url(#fondo)"/>`,
      '',
      `  <g id="disegno"${trasforma}>`,
      ...pezzi,
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
