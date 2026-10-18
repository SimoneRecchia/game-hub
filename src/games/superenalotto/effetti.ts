import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type IUniform,
  type Side,
} from 'three'

/**
 * Le luci dello studio della diretta che non sono luci: il fondale, il
 * pavimento, i fasci dei riflettori, il bordo del vetro che si accende, la
 * scia nel tubo, le lampadine della pedana, il pulviscolo e le scintille.
 * Sono tutti materiali piccoli scritti a mano, che il telefono disegna in un
 * passaggio solo: niente post-produzione, niente ombre. I colori sono quelli
 * che si vedono, gia' nello spazio dello schermo, e passano dal tono solo i
 * materiali di three.js. Ognuno prende il tempo della diretta da un `uniform`,
 * cosi' quel che si vede dipende dal momento e non da quanti fotogrammi sono
 * passati.
 */

/** Il rumore del retino, per non vedere i gradini nei fondi scuri sfumati. */
const RETINO = /* glsl */ `
  float retino(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; }
`

type Uniformi = Record<string, IUniform>

function additivo(vertexShader: string, fragmentShader: string, uniforms: Uniformi, side: Side = FrontSide) {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side,
  })
}

/**
 * Il fondale: il buio dello studio, piu' chiaro all'orizzonte e dietro l'urna,
 * e la parete di luci dietro, colonne che si accendono a onde. `uLuce` sono le
 * luci dello studio, `uLampo` il lampo di un'estrazione.
 */
export function fondale() {
  return new ShaderMaterial({
    uniforms: { uTempo: { value: 0 }, uLuce: { value: 0 }, uLampo: { value: 0 } },
    side: BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTempo;
      uniform float uLuce;
      uniform float uLampo;
      varying vec3 vDir;
      ${RETINO}
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(vec3(0.032, 0.06, 0.17), vec3(0.006, 0.011, 0.04), smoothstep(0.0, 0.6, y));
        col = mix(col, vec3(0.018, 0.032, 0.095), smoothstep(0.0, -0.12, y));
        // Dietro l'urna l'aria e' piu' chiara: la luce dello studio che non arriva al fondo.
        float dietro = pow(max(0.0, -d.z), 2.5) * exp(-abs(y - 0.06) * 5.0);
        col += vec3(0.05, 0.1, 0.36) * dietro * (0.3 + 0.7 * uLuce);
        // La parete di luci: colonne sottili in una fascia, che si accendono a onde lente.
        float ang = atan(d.x, -d.z);
        float fascia = smoothstep(-0.02, 0.06, y) * smoothstep(0.46, 0.24, y) * smoothstep(2.4, 1.5, abs(ang));
        float colonne = pow(max(0.0, cos(ang * 38.0)), 10.0);
        float onda = 0.5 + 0.5 * sin(ang * 4.0 - uTempo * 1.1);
        float accese = colonne * fascia * (0.22 + 0.6 * onda * onda) * uLuce + colonne * fascia * uLampo;
        col += vec3(0.32, 0.5, 1.0) * accese;
        // La linea dell'orizzonte, il bordo della pedana di luce in fondo.
        col += vec3(0.06, 0.1, 0.28) * exp(-abs(y + 0.012) * 90.0) * smoothstep(2.6, 1.0, abs(ang)) * uLuce;
        gl_FragColor = vec4(col + retino(gl_FragCoord.xy) / 255.0, 1.0);
      }
    `,
  })
}

/** Il pavimento dello studio attorno alla pedana: scuro, con la pozza di luce ai piedi e il buio in fondo. */
export function pavimento() {
  return new ShaderMaterial({
    uniforms: { uLuce: { value: 0 }, uCalda: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vMondo;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vMondo = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLuce;
      uniform float uCalda;
      varying vec3 vMondo;
      ${RETINO}
      void main() {
        float r = length(vMondo.xz);
        vec3 col = mix(vec3(0.028, 0.05, 0.14), vec3(0.018, 0.032, 0.095), smoothstep(5.0, 24.0, r));
        float piede = exp(-(r - 4.7) * (r - 4.7) * 0.9);
        col += vec3(0.04, 0.09, 0.3) * piede * (0.3 + 0.7 * uLuce);
        col += vec3(0.3, 0.2, 0.05) * piede * uCalda;
        // I cerchi della scenografia, appena incisi.
        float cerchi = smoothstep(0.9, 0.98, abs(fract(r * 0.5) - 0.5) * 2.0) * smoothstep(20.0, 6.0, r);
        col += vec3(0.05, 0.09, 0.24) * cerchi * uLuce;
        gl_FragColor = vec4(col + retino(gl_FragCoord.xy) / 255.0, 1.0);
      }
    `,
  })
}

/**
 * Un fascio di luce, o la colonna che si alza da un posto della rotaia: un
 * cono aperto disegnato con il colore che si somma, piu' forte verso la
 * sorgente e al centro, sfumato sui bordi. Le due facce insieme fanno lo
 * spessore. `uv.y` vale 1 alla sorgente.
 */
export function fascio(colore: Color) {
  return additivo(
    /* glsl */ `
      varying float vLungo;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vLungo = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    /* glsl */ `
      uniform vec3 uColore;
      uniform float uForza;
      varying float vLungo;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float centro = abs(dot(normalize(vN), normalize(vV)));
        float a = centro * centro * (0.32 + 0.68 * pow(vLungo, 1.6)) * uForza;
        gl_FragColor = vec4(uColore * a, a);
      }
    `,
    { uColore: { value: colore }, uForza: { value: 0 } },
    DoubleSide,
  )
}

/** Il bordo di una sfera che si accende quando la si guarda di taglio: il vetro dell'urna. */
export function bordo(colore: Color, forza: number) {
  return additivo(
    /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    /* glsl */ `
      uniform vec3 uColore;
      uniform float uForza;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = (pow(f, 4.0) * 0.9 + pow(f, 14.0) * 1.6) * uForza;
        gl_FragColor = vec4(uColore * a, a);
      }
    `,
    { uColore: { value: colore }, uForza: { value: forza } },
  )
}

/**
 * La scia nel tubo: il tubo si accende dove passa la pallina, e dietro di lei
 * resta una coda che si spegne. `uPos` e' dove sta la pallina, da 0 a 1 lungo
 * il tubo, come `uv.x` della sua forma.
 */
export function scia(colore: Color) {
  return additivo(
    /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    /* glsl */ `
      uniform vec3 uColore;
      uniform float uPos;
      uniform float uForza;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float d = vUv.x - uPos;
        float testa = exp(-d * d * 700.0);
        float coda = d < 0.0 ? exp(d * 9.0) * 0.5 : 0.0;
        float taglio = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = (testa + coda) * (0.25 + 0.75 * taglio) * uForza;
        gl_FragColor = vec4(uColore * a, a);
      }
    `,
    { uColore: { value: colore }, uPos: { value: 0 }, uForza: { value: 0 } },
    DoubleSide,
  )
}

/**
 * Le lampadine di un anello, che si rincorrono: un anello di `quante` luci
 * sulla forma di un toro, accese a onde che girano a `uVelocita`. `uForza` le
 * accende tutte insieme, nel lampo di un arrivo.
 */
export function lampadine(colore: Color, quante: number) {
  return new ShaderMaterial({
    uniforms: {
      uColore: { value: colore },
      uTempo: { value: 0 },
      uVelocita: { value: 1.5 },
      uLuce: { value: 0 },
      uForza: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPiano;
      void main() {
        vPiano = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColore;
      uniform float uTempo;
      uniform float uVelocita;
      uniform float uLuce;
      uniform float uForza;
      varying vec2 vPiano;
      void main() {
        float ang = atan(vPiano.y, vPiano.x);
        float k = abs(fract(ang / 6.2831853 * ${quante.toFixed(1)}) - 0.5);
        float lampada = smoothstep(0.32, 0.12, k);
        float corsa = pow(0.5 + 0.5 * sin(ang * 3.0 - uTempo * uVelocita), 5.0);
        float accesa = lampada * clamp((0.18 + 0.82 * corsa) * uLuce + uForza, 0.0, 1.6);
        vec3 spenta = vec3(0.09, 0.07, 0.03);
        gl_FragColor = vec4(mix(spenta, uColore, min(1.0, accesa)) + uColore * max(0.0, accesa - 1.0), 1.0);
      }
    `,
  })
}

/**
 * Il pulviscolo dello studio: punti di luce sfocati che galleggiano attorno e
 * dietro la pedana, come le luci fuori fuoco di una ripresa. Si muovono con il
 * tempo, nella scheda grafica: nessun conto per fotogramma.
 */
export function pulviscolo(quanti: number, caso: () => number) {
  const posizioni = new Float32Array(quanti * 3)
  const taglie = new Float32Array(quanti)
  const fasi = new Float32Array(quanti)
  const colori = new Float32Array(quanti * 3)
  const oro = new Color(0xffc970)
  const blu = new Color(0x7fa8ff)
  for (let i = 0; i < quanti; i += 1) {
    // Attorno e dietro la scena, su un guscio largo: davanti alla camera ne passa qualcuno, grande e sfocato.
    const a = caso() * Math.PI * 2
    const r = 5.5 + caso() * 12
    posizioni[i * 3] = Math.sin(a) * r
    posizioni[i * 3 + 1] = -1.5 + caso() * 9
    posizioni[i * 3 + 2] = -Math.abs(Math.cos(a)) * r * (caso() < 0.82 ? 1 : -0.7)
    taglie[i] = 0.05 + caso() * caso() * 0.22
    fasi[i] = caso() * 100
    const c = caso() < 0.45 ? oro : blu
    colori.set([c.r, c.g, c.b], i * 3)
  }
  const forma = new BufferGeometry()
  forma.setAttribute('position', new BufferAttribute(posizioni, 3))
  forma.setAttribute('aTaglia', new BufferAttribute(taglie, 1))
  forma.setAttribute('aFase', new BufferAttribute(fasi, 1))
  forma.setAttribute('aColore', new BufferAttribute(colori, 3))
  const materiale = additivo(
    /* glsl */ `
      attribute float aTaglia;
      attribute float aFase;
      attribute vec3 aColore;
      uniform float uTempo;
      uniform float uScala;
      uniform float uLuce;
      varying vec3 vColore;
      varying float vAlfa;
      void main() {
        vec3 p = position + vec3(
          sin(uTempo * 0.11 + aFase) * 0.7,
          sin(uTempo * 0.08 + aFase * 1.7) * 0.5,
          cos(uTempo * 0.09 + aFase * 0.6) * 0.7
        );
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(0.5, -mv.z);
        // Piu' e' lontano dal fuoco, piu' e' grande e tenue: lo sfocato dell'obiettivo.
        float sfocato = clamp(abs(dist - 9.0) / 9.0, 0.0, 1.0);
        gl_PointSize = clamp(aTaglia * uScala * (1.0 + sfocato * 1.5) / dist, 1.5, 90.0);
        float luccica = 0.55 + 0.45 * sin(uTempo * (0.7 + fract(aFase) * 1.3) + aFase * 5.0);
        vAlfa = luccica * uLuce * mix(0.55, 0.18, sfocato);
        vColore = aColore;
      }
    `,
    /* glsl */ `
      varying vec3 vColore;
      varying float vAlfa;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float disco = smoothstep(0.5, 0.36, d) * 0.55 + smoothstep(0.36, 0.0, d) * 0.45;
        float a = disco * vAlfa;
        gl_FragColor = vec4(vColore * a, a);
      }
    `,
    { uTempo: { value: 0 }, uScala: { value: 400 }, uLuce: { value: 0 } },
  )
  return { forma, materiale }
}

/**
 * Le scintille di un colpo: partono tutte da `uOrigine` quando `uEta` passa lo
 * zero, rallentano nell'aria e cadono. Le direzioni sono fisse, scelte una
 * volta, quindi lo stesso colpo e' sempre lo stesso.
 */
export function scintille(quante: number, caso: () => number) {
  const direzioni = new Float32Array(quante * 3)
  const velocita = new Float32Array(quante)
  const vite = new Float32Array(quante)
  for (let i = 0; i < quante; i += 1) {
    const u = caso() * 2 - 1
    const a = caso() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    direzioni.set([Math.cos(a) * s, Math.abs(u) * 0.8 + 0.2, Math.sin(a) * s], i * 3)
    velocita[i] = 1.4 + caso() * 3.2
    vite[i] = 0.55 + caso() * 0.75
  }
  const forma = new BufferGeometry()
  // Le posizioni le calcola la scheda grafica: questa serve solo a dire quanti punti sono.
  forma.setAttribute('position', new BufferAttribute(new Float32Array(quante * 3), 3))
  forma.setAttribute('aDir', new BufferAttribute(direzioni, 3))
  forma.setAttribute('aVel', new BufferAttribute(velocita, 1))
  forma.setAttribute('aVita', new BufferAttribute(vite, 1))
  const materiale = additivo(
    /* glsl */ `
      attribute vec3 aDir;
      attribute float aVel;
      attribute float aVita;
      uniform vec3 uOrigine;
      uniform float uEta;
      uniform float uScala;
      varying float vAlfa;
      void main() {
        float e = uEta;
        float viva = step(0.0, e) * step(e, aVita);
        vec3 p = uOrigine + aDir * aVel * (1.0 - exp(-e * 3.2)) / 3.2 - vec3(0.0, 1.6 * e * e, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float resta = 1.0 - e / aVita;
        gl_PointSize = viva * clamp(uScala * 0.045 * resta / max(0.3, -mv.z), 1.0, 28.0);
        vAlfa = viva * resta;
      }
    `,
    /* glsl */ `
      varying float vAlfa;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlfa;
        vec3 col = mix(vec3(1.0, 0.62, 0.18), vec3(1.0, 0.96, 0.85), smoothstep(0.25, 0.0, d));
        gl_FragColor = vec4(col * a, a);
      }
    `,
    { uOrigine: { value: new Vector3() }, uEta: { value: -1 }, uScala: { value: 400 } },
  )
  return { forma, materiale }
}

/** Un alone tondo che sfuma: l'ombra sotto l'urna, le pozze di luce, il lampo. */
export function alone(colore: string): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, colore)
  r.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** Un anello di luce sfumato: l'onda di un colpo, l'aureola della pallina al suo posto. */
export function anelloDiLuce(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  r.addColorStop(0, 'rgba(255,255,255,0)')
  r.addColorStop(0.62, 'rgba(255,255,255,0)')
  r.addColorStop(0.8, 'rgba(255,255,255,1)')
  r.addColorStop(0.86, 'rgba(255,255,255,0.35)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 256, 256)
  return new CanvasTexture(c)
}

/**
 * Il disegno inciso sulla pedana, visto dall'alto: i cerchi, le tacche del
 * quadrante sul bordo e i raggi, in oro. Si somma al vetro scuro della
 * pedana, e si accende con le luci dello studio.
 */
export function quadrante(): CanvasTexture {
  const lato = 1024
  const c = document.createElement('canvas')
  c.width = c.height = lato
  const g = c.getContext('2d')!
  const m = lato / 2
  g.translate(m, m)
  g.strokeStyle = 'rgba(255, 210, 122, 1)'
  const cerchio = (r: number, spessore: number, alfa: number) => {
    g.globalAlpha = alfa
    g.lineWidth = spessore
    g.beginPath()
    g.arc(0, 0, r * m, 0, Math.PI * 2)
    g.stroke()
  }
  cerchio(0.985, 3, 0.9)
  cerchio(0.955, 1.5, 0.55)
  cerchio(0.62, 2, 0.5)
  cerchio(0.6, 1, 0.35)
  cerchio(0.42, 1.5, 0.3)
  for (let i = 0; i < 120; i += 1) {
    const a = (i / 120) * Math.PI * 2
    const lunga = i % 10 === 0
    g.globalAlpha = lunga ? 0.8 : 0.4
    g.lineWidth = lunga ? 3 : 1.5
    g.beginPath()
    g.moveTo(Math.cos(a) * m * (lunga ? 0.87 : 0.9), Math.sin(a) * m * (lunga ? 0.87 : 0.9))
    g.lineTo(Math.cos(a) * m * 0.945, Math.sin(a) * m * 0.945)
    g.stroke()
  }
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2 + Math.PI / 24
    g.globalAlpha = 0.16
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(Math.cos(a) * m * 0.63, Math.sin(a) * m * 0.63)
    g.lineTo(Math.cos(a) * m * 0.86, Math.sin(a) * m * 0.86)
    g.stroke()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/**
 * Lo studio che si riflette sul vetro, sull'oro e sulle palline: una stanza
 * buia con i pannelli di luce dei riflettori — due lunghi ai lati, uno grande
 * sopra, una striscia blu dietro e una calda davanti, in basso. Sono quei
 * pannelli a fare le righe di luce sul vetro e i lampi sull'oro; l'ambiente
 * grigio di prima li spegneva. Serve una volta, per l'ambiente: poi si butta.
 */
export function studioDaRiflettere(): { scena: Scene; butta: () => void } {
  const scena = new Scene()
  const forme: BufferGeometry[] = []
  const materiali: MeshBasicMaterial[] = []
  const stanzaForma = new SphereGeometry(30, 32, 16)
  // La stanza: blu notte, piu' chiara in basso, dove la pedana rimanda la luce.
  const colori = new Float32Array(stanzaForma.attributes.position.count * 3)
  const alto = new Color(0x02040c)
  const basso = new Color(0x0c1a44)
  const c = new Color()
  for (let i = 0; i < stanzaForma.attributes.position.count; i += 1) {
    const y = stanzaForma.attributes.position.getY(i) / 30
    c.copy(basso).lerp(alto, Math.min(1, Math.max(0, (y + 0.2) / 0.9)))
    colori.set([c.r, c.g, c.b], i * 3)
  }
  stanzaForma.setAttribute('color', new BufferAttribute(colori, 3))
  const stanza = new MeshBasicMaterial({ side: BackSide, vertexColors: true })
  scena.add(new Mesh(stanzaForma, stanza))
  forme.push(stanzaForma)
  materiali.push(stanza)
  const pannello = (l: number, a: number, colore: number, forza: number, x: number, y: number, z: number) => {
    const forma = new PlaneGeometry(l, a)
    const materiale = new MeshBasicMaterial({ color: new Color(colore).multiplyScalar(forza), side: DoubleSide })
    const m = new Mesh(forma, materiale)
    m.position.set(x, y, z)
    m.lookAt(0, 0, 0)
    scena.add(m)
    forme.push(forma)
    materiali.push(materiale)
  }
  pannello(16, 4, 0xffffff, 5, 0, 14, 3)
  pannello(2.4, 12, 0xe4ecff, 4, -12, 2, 5)
  pannello(2.4, 12, 0xffe6bf, 4, 12, 2, 5)
  pannello(18, 1.4, 0x4f84ff, 4, 0, 1.5, -14)
  pannello(12, 1.2, 0xffc46b, 2.5, 0, -4, 12)
  pannello(1.2, 8, 0xffffff, 6, -6, 6, 11)
  return {
    scena,
    butta: () => {
      for (const f of forme) f.dispose()
      for (const m of materiali) m.dispose()
    },
  }
}
