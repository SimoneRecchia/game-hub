import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { NUMERI, PALLINE_MS } from '@shared/superenalotto'
import * as fx from './effetti'
import { coloreDellaPallina } from './palline'
import {
  ARRIVO_MS,
  ATTESA_MS,
  REGIA,
  RIEPILOGO_MS,
  RISUCCHIO_MS,
  ROTAIA_MS,
  SOFFIO,
  TUBO_MS,
  VETRINA_MS,
  staccoDi,
  type Ripresa,
} from './tempi'

/**
 * L'urna del SuperEnalotto in 3D, in uno studio televisivo: la sfera di vetro
 * sul piedistallo d'oro, al centro di una pedana di vetro nero che la
 * riflette, le novanta palline che l'aria fa saltare, il tubo da cui esce la
 * pallina estratta e la rotaia davanti, dove le quattro si mettono in fila con
 * il numero verso chi guarda. Attorno i riflettori che si muovono, la parete
 * di luci in fondo, il pulviscolo fuori fuoco.
 *
 * E' tutta una funzione del tempo della diretta (`tempo`, in millisecondi
 * dall'inizio): la regia (la scaletta di `tempi.ts`), le luci, la pallina che
 * esce, i lampi. Chi arriva a meta' trova le palline gia' uscite al loro posto,
 * quella che sta uscendo dove deve essere e la camera dove la mette la regia.
 * Le palline dentro l'urna invece si muovono con una fisica loro, a caso: due
 * telefoni non le vedono uguali, ed e' giusto cosi', l'urna vera non si ripete.
 *
 * Un telefono la deve far girare senza scaldarsi, e quindi: niente ombre vere
 * e niente post-produzione. La profondita' la fanno i riflessi di un ambiente
 * calcolato una volta (`studioDaRiflettere`: uno studio buio con i pannelli
 * dei riflettori, che danno le righe di luce sul vetro e i lampi sull'oro), i
 * fasci e i lampi sono forme che sommano il colore, e il riflesso sulla
 * pedana e' l'urna disegnata capovolta sotto un vetro scuro — il piedistallo,
 * la rotaia, e le palline in un disegno solo (`InstancedMesh`), senza numeri.
 * Le novanta palline hanno una forma sola e un'immagine piccola ciascuna
 * (`LATO_FACCIA`); quella che esce, che si guarda da vicino, cresce nel tubo
 * fino alla misura della rotaia (`RB_FUORI`) e prende un'immagine grande. Nel
 * giro di ogni fotogramma non nasce nessun oggetto: i conti passano da pochi
 * vettori di lavoro.
 */

const R = 2
/** Il raggio di una pallina dentro l'urna, e quello che ha sulla rotaia, dove la si guarda da vicino. */
const RB = 0.19
const RB_FUORI = 0.27
/** Il lato delle immagini dei numeri: piccole nell'urna, grandi per le quattro che escono e si guardano da vicino. */
const LATO_FACCIA = { dentro: 128, fuori: 512 }
const CENTRO = new Vector3(0, 0.55, 0)
const PIANO = CENTRO.y - R - 0.85
const PEDANA = 4.62
const BINARIO = { y: PIANO + 0.18 + RB_FUORI, z: 2.35 }
const POSTI_X = [-1.2, -0.4, 0.4, 1.2]

const USCITA = CENTRO.clone().add(new Vector3(0, R + 0.05, 0))
const TUBO = new CatmullRomCurve3([
  USCITA,
  new Vector3(0, CENTRO.y + R + 0.75, 0.35),
  new Vector3(1.5, CENTRO.y + R + 0.55, 1.3),
  new Vector3(2.65, CENTRO.y + 0.1, 2.1),
  new Vector3(2.75, BINARIO.y + 0.6, BINARIO.z),
  new Vector3(2.25, BINARIO.y, BINARIO.z),
])
const FINE_TUBO_X = TUBO.getPointAt(1).x
/** La velocita' della pallina in fondo al tubo, in unita' al secondo: e' quella con cui entra sulla rotaia. */
const VELOCITA_FINE_TUBO = TUBO.getLength() / (TUBO_MS / 1000)

/** Da dove guarda il numero di una pallina al suo posto: verso la camera della vetrina, un po' dall'alto. */
const FACCIA = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0.1, 0.62, 0.85).normalize())
const ASSE_Y = new Vector3(0, 1, 0)
const ASSE_Z = new Vector3(0, 0, 1)

/** I riflettori: dove stanno, sopra lo studio, e il colore. Quelli dietro si vedono, quelli davanti illuminano. */
const RIFLETTORI: ReadonlyArray<{ da: [number, number, number]; colore: number; fase: number }> = [
  { da: [-7, 9, -5], colore: 0x8fb2ff, fase: 0 },
  { da: [-3, 10, -7.5], colore: 0xffe2b0, fase: 1.7 },
  { da: [3, 10, -7.5], colore: 0x8fb2ff, fase: 3.1 },
  { da: [7, 9, -5], colore: 0xffe2b0, fase: 4.4 },
  { da: [-5.5, 9.5, 5.5], colore: 0xbcd0ff, fase: 2.3 },
  { da: [5.5, 9.5, 5.5], colore: 0xffd59a, fase: 5.6 },
]

const liscia = (x: number) => x * x * (3 - 2 * x)
const entro = (x: number) => Math.min(1, Math.max(0, x))
/** Da 0 a 1 in `su` millisecondi da `da`, e di nuovo a 0 in `giu` da `a`. */
const finestra = (t: number, da: number, su: number, a: number, giu: number) =>
  liscia(entro((t - da) / su)) * (1 - liscia(entro((t - a) / giu)))
/** Un colpo che si spegne: 1 a `da`, poi giu' con la costante `ms`; 0 prima. */
const colpo = (t: number, da: number, ms: number) => (t < da ? 0 : Math.exp(-(t - da) / ms))
/**
 * Il cammino nel tubo, da 0 a 1 in `k`: entra veloce, dalla bocca, rallenta un
 * poco in cima alla curva ed esce alla velocita' di una cosa che scende. E'
 * una curva di Hermite con le pendenze 1,6 e 1, che non torna mai indietro.
 */
const nelTubo = (k: number) => 0.6 * k * k * k - 1.2 * k * k + 1.6 * k

interface Pallina {
  numero: number
  mesh: Mesh
  materiale: MeshStandardMaterial
  p: Vector3
  v: Vector3
  /** Come l'ha girata il rotolare, fotogramma dopo fotogramma. */
  rotola: Quaternion
  /** Uscita: in che posto della rotaia va, e da dove e' partita. */
  fuori: { posto: number; da: Vector3 } | null
}

interface Fascio {
  mesh: Mesh
  materiale: ShaderMaterial
  fase: number
  mira: Vector3
}

/**
 * La faccia di una pallina: il colore, e il numero in un tondo bianco con il
 * filo del suo colore, due volte, davanti e dietro. `lato` e' la larghezza;
 * l'altezza e' la meta'.
 */
function facciaDi(n: number, lato: number): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = lato
  c.height = lato / 2
  const g = c.getContext('2d')!
  g.scale(lato / 256, lato / 256)
  const colore = coloreDellaPallina(n)
  g.fillStyle = colore
  g.fillRect(0, 0, 256, 128)
  for (const x of [64, 192]) {
    g.fillStyle = '#fbfbf7'
    g.beginPath()
    g.ellipse(x, 64, 37, 41, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(0, 0, 0, 0.16)'
    g.lineWidth = 2.5
    g.beginPath()
    g.ellipse(x, 64, 33, 37, 0, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#14141a'
    g.font = `800 ${n >= 10 ? 40 : 46}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(n), x, 67)
    if (n === 6 || n === 9) g.fillRect(x - 12, 92, 24, 4)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

export class Urna {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 200)
  private readonly palline: Pallina[] = []
  /** Le palline ancora nell'urna, quelle che la fisica muove. */
  private readonly dentro: Pallina[] = []
  private readonly daButtare: Array<BufferGeometry | Material | Texture> = []
  private estratti: number[] | null = null
  private frame = 0
  private prima = 0
  private readonly fermo: boolean

  // Le misure: la tela, e la parte che le scritte lasciano libera (`campo`), dove la regia mette quel che conta.
  private larghezza = 1
  private altezza = 1
  private readonly campo = { sopra: 0, sotto: 0 }
  private readonly campoVisto = { sopra: 0, sotto: 0 }

  // La camera: dove la vuole la regia, e lo scarto che resta dopo un salto (una finestra ridimensionata).
  private primo = true
  private readonly occhio = new Vector3()
  private readonly guarda = new Vector3()
  private readonly occhioPrima = new Vector3()
  private readonly guardaPrima = new Vector3()
  private readonly voluto = { occhio: new Vector3(), guarda: new Vector3() }
  private readonly scarto = { occhio: new Vector3(), guarda: new Vector3() }

  // Le luci.
  private readonly ambiente = new AmbientLight(0x2a3a66, 0.6)
  private readonly chiave = new SpotLight(0xffffff, 3.2, 0, 0.5, 0.55, 0)
  private readonly blu = new PointLight(0x3d7bff, 2.2, 0, 0)
  private readonly calda = new PointLight(0xffb347, 1.4, 0, 0)
  private readonly seguito = new PointLight(0xffd27a, 0, 5, 1.5)

  // Lo studio, e quel che si accende.
  private readonly sfondo: Mesh
  private readonly sfondoMateriale: ShaderMaterial
  private readonly pavimentoMateriale: ShaderMaterial
  private readonly lampadine: ShaderMaterial[] = []
  private readonly fasci: Fascio[] = []
  private readonly posti: MeshStandardMaterial[] = []
  private readonly aureole: Sprite[] = []
  private readonly meridiani = new Group()
  private readonly meridianiRiflessi = new Group()
  private bordoMateriale!: ShaderMaterial
  private sciaMateriale!: ShaderMaterial
  private gettoMateriale!: ShaderMaterial
  private colonna!: Mesh
  private colonnaMateriale!: ShaderMaterial
  private pulviscolo!: ShaderMaterial
  private scintille!: ShaderMaterial
  private lampo!: Sprite
  private onda!: Sprite
  private quadranteMateriale!: MeshBasicMaterial
  private pozzaMateriale!: MeshBasicMaterial
  private pozzaCaldaMateriale!: MeshBasicMaterial
  private riflesse!: InstancedMesh

  // I vettori di lavoro: nel giro di un fotogramma non nasce niente.
  private readonly lavoro = new Vector3()
  private readonly lavoro2 = new Vector3()
  private readonly lavoro3 = new Vector3()
  private readonly palla = new Vector3()
  private readonly posto = new Vector3()
  private readonly origineScintille = new Vector3()
  private readonly q = new Quaternion()
  private readonly q2 = new Quaternion()
  private readonly matrice = new Matrix4()

  constructor(
    canvas: HTMLCanvasElement,
    private readonly tempo: () => number,
  ) {
    this.fermo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.setClearColor(0x02040c)

    const pmrem = new PMREMGenerator(this.renderer)
    const studio = fx.studioDaRiflettere()
    const ambiente = pmrem.fromScene(studio.scena, 0.035).texture
    studio.butta()
    pmrem.dispose()
    this.scene.environment = ambiente
    this.daButtare.push(ambiente)

    this.chiave.position.set(0, 10, 4)
    this.chiave.target.position.copy(CENTRO)
    this.blu.position.set(-5, 1.5, 3)
    this.calda.position.set(5, -0.5, 4)
    this.scene.add(this.ambiente, this.chiave, this.chiave.target, this.blu, this.calda, this.seguito)

    this.sfondoMateriale = this.tieni(fx.fondale())
    this.sfondo = new Mesh(this.tieni(new SphereGeometry(60, 48, 24)), this.sfondoMateriale)
    this.sfondo.renderOrder = -10
    this.sfondo.frustumCulled = false
    this.pavimentoMateriale = this.tieni(fx.pavimento())
    this.scene.add(this.sfondo)

    const riflesso = new Group()
    riflesso.scale.y = -1
    riflesso.position.y = 2 * PIANO
    this.scene.add(riflesso)

    this.costruisciStudio()
    this.costruisciUrna(riflesso)
    this.costruisciEffetti()
    this.mettiPalline(riflesso)
  }

  private tieni<T extends BufferGeometry | Material | Texture>(x: T): T {
    this.daButtare.push(x)
    return x
  }

  /**
   * Il pavimento, e la pedana: un pozzo con le pareti scure e sopra un vetro
   * nero, attraverso cui si vede l'urna capovolta, cioe' il suo riflesso. Il
   * pozzo e' profondo quanto l'urna e' alta, cosi' il riflesso ci sta tutto;
   * da fuori se ne vede solo l'orlo, il resto e' sotto il pavimento.
   */
  private costruisciStudio() {
    const pavimento = new Mesh(this.tieni(new RingGeometry(PEDANA, 44, 96, 1)), this.pavimentoMateriale)
    pavimento.rotation.x = -Math.PI / 2
    pavimento.position.y = PIANO - 0.32

    const scuro = this.tieni(
      new MeshStandardMaterial({ color: 0x0a1430, metalness: 0.75, roughness: 0.32, side: DoubleSide }),
    )
    const parete = new Mesh(this.tieni(new CylinderGeometry(PEDANA, PEDANA, 6.2, 96, 1, true)), scuro)
    parete.position.y = PIANO - 3.1
    const fondo = new Mesh(
      this.tieni(new CircleGeometry(PEDANA, 48)),
      this.tieni(new MeshBasicMaterial({ color: 0x01030a })),
    )
    fondo.rotation.x = -Math.PI / 2
    fondo.position.y = PIANO - 6.2

    const vetroNero = new Mesh(
      this.tieni(new CircleGeometry(PEDANA, 96)),
      this.tieni(
        new MeshStandardMaterial({
          color: 0x03060f,
          metalness: 0.1,
          roughness: 0.1,
          transparent: true,
          opacity: 0.86,
          envMapIntensity: 1.6,
          depthWrite: false,
        }),
      ),
    )
    vetroNero.rotation.x = -Math.PI / 2
    vetroNero.position.y = PIANO
    vetroNero.renderOrder = 1

    // Il quadrante inciso sul vetro, l'ombra sotto l'urna e le due pozze di luce, quella blu e quella d'oro della
    // rotaia.
    const disco = (lato: number, materiale: MeshBasicMaterial, z: number, ordine: number) => {
      const m = new Mesh(this.tieni(new PlaneGeometry(lato, lato)), materiale)
      m.rotation.x = -Math.PI / 2
      m.position.set(0, PIANO + 0.004 * ordine, z)
      m.renderOrder = 1 + ordine
      return m
    }
    const quadrante = this.tieni(fx.quadrante())
    quadrante.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.quadranteMateriale = this.tieni(
      new MeshBasicMaterial({
        map: quadrante,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        opacity: 0.3,
      }),
    )
    this.pozzaMateriale = this.tieni(
      new MeshBasicMaterial({
        map: this.tieni(fx.alone('rgba(70,130,255,0.5)')),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    )
    this.pozzaCaldaMateriale = this.tieni(
      new MeshBasicMaterial({
        map: this.tieni(fx.alone('rgba(255,190,90,0.6)')),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        opacity: 0,
      }),
    )
    const ombra = this.tieni(
      new MeshBasicMaterial({ map: this.tieni(fx.alone('rgba(0,0,0,0.6)')), transparent: true, depthWrite: false }),
    )
    const pozzaCalda = disco(4.2, this.pozzaCaldaMateriale, BINARIO.z, 4)
    pozzaCalda.scale.set(1.3, 0.55, 1)

    // Le lampadine sull'orlo della pedana, e un anello piu' piccolo attorno al piede.
    const orlo = (raggio: number, spessore: number, quante: number, y: number) => {
      const materiale = this.tieni(fx.lampadine(new Color(0xffd27a), quante))
      this.lampadine.push(materiale)
      const m = new Mesh(this.tieni(new TorusGeometry(raggio, spessore, 8, Math.max(120, quante * 3))), materiale)
      m.rotation.x = Math.PI / 2
      m.position.y = y
      return m
    }
    this.scene.add(
      pavimento,
      parete,
      fondo,
      vetroNero,
      disco(PEDANA * 2, this.quadranteMateriale, 0, 1),
      disco(10, this.pozzaMateriale, 0, 2),
      disco(4, ombra, 0, 3),
      pozzaCalda,
      orlo(PEDANA, 0.055, 120, PIANO),
      orlo(1.82, 0.03, 48, PIANO + 0.01),
    )
  }

  /** Il piedistallo, la sfera di vetro con gli anelli, il tubo e la rotaia; e, capovolti, i loro riflessi. */
  private costruisciUrna(riflesso: Group) {
    const oro = this.tieni(new MeshStandardMaterial({ color: 0xe0b053, metalness: 1, roughness: 0.24 }))
    const oroScuro = this.tieni(new MeshStandardMaterial({ color: 0x8a6420, metalness: 1, roughness: 0.36 }))
    // Il vetro: liscio, quasi trasparente, e lucido dei pannelli dello studio. Senza lo strato di vernice del
    // materiale fisico, che costa un secondo riflesso per pixel e qui, con la sfera a tutto schermo, si pagherebbe.
    const vetro = this.tieni(
      new MeshStandardMaterial({
        color: 0xdfefff,
        metalness: 0,
        roughness: 0.035,
        transparent: true,
        opacity: 0.12,
        envMapIntensity: 2.8,
        depthWrite: false,
      }),
    )
    const vetroDentro = this.tieni(
      new MeshBasicMaterial({
        color: 0x9fc4ff,
        transparent: true,
        opacity: 0.045,
        side: DoubleSide,
        depthWrite: false,
      }),
    )
    // Quel che si riflette sulla pedana: le stesse forme, con gli stessi materiali, nel gruppo capovolto. Le copie si
    // disegnano prima del vetro nero della pedana, che le scurisce: il vetro trasparente, disegnato dopo, ci
    // passerebbe sopra intero.
    const anche = (...cose: Object3D[]) => {
      this.scene.add(...cose)
      for (const c of cose) {
        const copia = c.clone()
        copia.traverse((o) => (o.renderOrder = 0))
        riflesso.add(copia)
      }
    }

    const piede = new Mesh(this.tieni(new CylinderGeometry(1.15, 1.55, 0.6, 64)), oroScuro)
    piede.position.y = PIANO + 0.3
    const fascia = new Mesh(this.tieni(new TorusGeometry(1.36, 0.035, 8, 96)), oro)
    fascia.rotation.x = Math.PI / 2
    fascia.position.y = PIANO + 0.42
    const collo = new Mesh(this.tieni(new CylinderGeometry(0.7, 1.05, 0.35, 64)), oro)
    collo.position.y = PIANO + 0.75
    const anello = new Mesh(this.tieni(new TorusGeometry(1.05, 0.08, 16, 96)), oro)
    anello.rotation.x = Math.PI / 2
    anello.position.y = CENTRO.y - R * 0.86
    const equatore = new Mesh(this.tieni(new TorusGeometry(R + 0.02, 0.05, 12, 160)), oro)
    equatore.rotation.x = Math.PI / 2
    equatore.position.copy(CENTRO)
    anche(piede, fascia, collo, anello, equatore)

    // I due meridiani girano attorno alla sfera, piano, e piu' svelti quando l'aria soffia.
    const meridiano = this.tieni(new TorusGeometry(R + 0.03, 0.022, 8, 160))
    for (const giro of [0, Math.PI / 2]) {
      const m = new Mesh(meridiano, oro)
      m.rotation.y = giro
      this.meridiani.add(m)
      this.meridianiRiflessi.add(m.clone())
    }
    this.meridiani.position.copy(CENTRO)
    this.meridianiRiflessi.position.copy(CENTRO)
    this.scene.add(this.meridiani)
    riflesso.add(this.meridianiRiflessi)

    const sfera = new Mesh(this.tieni(new SphereGeometry(R, 64, 40)), vetro)
    sfera.position.copy(CENTRO)
    sfera.renderOrder = 5
    const dentro = new Mesh(this.tieni(new SphereGeometry(R * 0.995, 48, 32)), vetroDentro)
    dentro.position.copy(CENTRO)
    dentro.renderOrder = 4
    this.bordoMateriale = this.tieni(fx.bordo(new Color(0xbfd6ff), 0.8))
    const bordo = new Mesh(this.tieni(new SphereGeometry(R * 1.004, 64, 40)), this.bordoMateriale)
    bordo.position.copy(CENTRO)
    bordo.renderOrder = 6
    anche(dentro, sfera, bordo)

    // Il soffio dal fondo: un cono di luce appena visibile, dove l'aria entra.
    this.gettoMateriale = this.tieni(fx.fascio(new Color(0x9cc4ff)))
    const gettoForma = this.tieni(new CylinderGeometry(0.12, 1.15, 2.3, 32, 1, true))
    gettoForma.rotateX(Math.PI)
    const getto = new Mesh(gettoForma, this.gettoMateriale)
    getto.position.y = CENTRO.y - R + 1.2
    getto.renderOrder = 4
    const grata = new Mesh(this.tieni(new CylinderGeometry(0.32, 0.36, 0.05, 32)), oroScuro)
    grata.position.y = CENTRO.y - R + 0.06
    this.scene.add(getto, grata)

    // La bocca in cima, con il collare d'oro, e il tubo di vetro fino alla rotaia, con la scia e i suoi anelli.
    const bocca = new Mesh(this.tieni(new TorusGeometry(RB_FUORI * 1.4, 0.06, 12, 48)), oro)
    bocca.rotation.x = Math.PI / 2
    bocca.position.copy(USCITA)
    const collare = new Mesh(this.tieni(new CylinderGeometry(RB_FUORI * 1.32, RB_FUORI * 1.5, 0.2, 40, 1, true)), oro)
    collare.position.copy(USCITA).y -= 0.08
    const vetroTubo = this.tieni(vetro.clone())
    vetroTubo.opacity = 0.1
    vetroTubo.envMapIntensity = 2
    const tuboForma = this.tieni(new TubeGeometry(TUBO, 128, RB_FUORI * 1.18, 16, false))
    const tubo = new Mesh(tuboForma, vetroTubo)
    tubo.renderOrder = 5
    // Il bordo del tubo che prende la luce: senza, un tubo di vetro sottile al buio non si vede, e i fermagli d'oro
    // resterebbero sospesi nell'aria.
    const tuboBordo = new Mesh(tuboForma, this.tieni(fx.bordo(new Color(0xbfd6ff), 0.55)))
    tuboBordo.renderOrder = 6
    this.sciaMateriale = this.tieni(fx.scia(new Color(0xffc45e)))
    const scia = new Mesh(this.tieni(new TubeGeometry(TUBO, 128, RB_FUORI * 1.24, 16, false)), this.sciaMateriale)
    scia.renderOrder = 6
    this.scene.add(bocca, collare, tubo, tuboBordo, scia)
    const fermaglio = this.tieni(new TorusGeometry(RB_FUORI * 1.24, 0.032, 8, 32))
    for (const u of [0.32, 0.6, 0.85, 1]) {
      const f = new Mesh(fermaglio, oro)
      TUBO.getPointAt(u, f.position)
      f.quaternion.setFromUnitVectors(ASSE_Z, TUBO.getTangentAt(u, this.lavoro))
      this.scene.add(f)
    }

    // La rotaia: la base laccata di blu notte, le due guide d'oro, e un anello per posto che si accende quando la
    // pallina arriva. Si guarda da vicino a ogni pallina: dev'essere sottile e scura, e lasciare la luce alle palline.
    const rotaia = new Group()
    const barra = new Mesh(this.tieni(new CylinderGeometry(0.042, 0.042, 4.7, 16)), oro)
    barra.rotation.z = Math.PI / 2
    for (const dz of [-0.31, 0.31]) {
      const guida = barra.clone()
      guida.position.set(0.5, BINARIO.y - RB_FUORI * 0.7, BINARIO.z + dz)
      rotaia.add(guida)
    }
    const laccato = this.tieni(new MeshStandardMaterial({ color: 0x0c1840, metalness: 0.55, roughness: 0.2 }))
    const base = new Mesh(this.tieni(new BoxGeometry(4.7, 0.12, 0.74)), laccato)
    base.position.set(0.5, PIANO + 0.06, BINARIO.z)
    rotaia.add(base)
    const filo = new Mesh(this.tieni(new BoxGeometry(4.7, 0.02, 0.02)), oro)
    filo.position.set(0.5, PIANO + 0.12, BINARIO.z + 0.37)
    rotaia.add(filo)
    const forma = this.tieni(new TorusGeometry(RB_FUORI * 0.95, 0.035, 8, 40))
    POSTI_X.forEach((x) => {
      const materiale = this.tieni(
        new MeshStandardMaterial({
          color: 0xffd27a,
          emissive: 0xffb02e,
          emissiveIntensity: 0.12,
          metalness: 0.6,
          roughness: 0.3,
        }),
      )
      const posto = new Mesh(forma, materiale)
      posto.rotation.x = Math.PI / 2
      posto.position.set(x, BINARIO.y - RB_FUORI * 0.75, BINARIO.z)
      this.posti.push(materiale)
      rotaia.add(posto)
    })
    anche(rotaia)
  }

  /** I riflettori, il pulviscolo, le scintille, il lampo e l'onda, la colonna di luce e le aureole della rotaia. */
  private costruisciEffetti() {
    const cono = this.tieni(new CylinderGeometry(0.06, 1.05, 18, 32, 1, true))
    // La punta nell'origine, il cono lungo +z: cosi' `lookAt` lo punta dove deve.
    cono.translate(0, -9, 0)
    cono.rotateX(-Math.PI / 2)
    for (const r of RIFLETTORI) {
      const materiale = this.tieni(fx.fascio(new Color(r.colore)))
      const mesh = new Mesh(cono, materiale)
      mesh.position.set(...r.da)
      mesh.renderOrder = 7
      mesh.frustumCulled = false
      this.fasci.push({ mesh, materiale, fase: r.fase, mira: new Vector3() })
      this.scene.add(mesh)
    }

    // La colonna di luce che si alza dal posto dove arriva una pallina.
    this.colonnaMateriale = this.tieni(fx.fascio(new Color(0xffc861)))
    const colonnaForma = this.tieni(new CylinderGeometry(0.3, 0.46, 3.2, 32, 1, true))
    colonnaForma.translate(0, -1.6, 0)
    colonnaForma.rotateX(Math.PI)
    this.colonna = new Mesh(colonnaForma, this.colonnaMateriale)
    this.colonna.renderOrder = 7
    this.scene.add(this.colonna)

    // Un caso fisso: il pulviscolo e le scintille sono sempre gli stessi, su ogni telefono.
    let seme = 20261019
    const caso = () => {
      seme = (seme * 1664525 + 1013904223) >>> 0
      return seme / 4294967296
    }
    const polvere = fx.pulviscolo(170, caso)
    this.pulviscolo = this.tieni(polvere.materiale)
    const punti = new Points(this.tieni(polvere.forma), this.pulviscolo)
    punti.frustumCulled = false
    punti.renderOrder = 8
    const colpi = fx.scintille(80, caso)
    this.scintille = this.tieni(colpi.materiale)
    this.scintille.uniforms.uOrigine.value = this.origineScintille
    const faville = new Points(this.tieni(colpi.forma), this.scintille)
    faville.frustumCulled = false
    faville.renderOrder = 9
    this.scene.add(punti, faville)

    const sprite = (mappa: Texture, colore: number, ordine: number, profondita = true) => {
      const s = new Sprite(
        this.tieni(
          new SpriteMaterial({
            map: mappa,
            color: colore,
            transparent: true,
            depthWrite: false,
            depthTest: profondita,
            blending: AdditiveBlending,
            opacity: 0,
          }),
        ),
      )
      s.renderOrder = ordine
      this.scene.add(s)
      return s
    }
    const luce = this.tieni(fx.alone('rgba(255,244,214,1)'))
    const cerchio = this.tieni(fx.anelloDiLuce())
    this.lampo = sprite(luce, 0xffe2a8, 10, false)
    this.onda = sprite(cerchio, 0xffd27a, 10)
    POSTI_X.forEach((x) => {
      const a = sprite(luce, 0xffc45e, 6)
      a.position.set(x, BINARIO.y + 0.02, BINARIO.z - 0.12)
      this.aureole.push(a)
    })
  }

  /** Le novanta palline, ferme sul fondo dell'urna, e il loro riflesso, in un disegno solo. */
  private mettiPalline(riflesso: Group) {
    const forma = this.tieni(new SphereGeometry(RB, 24, 16))
    this.riflesse = new InstancedMesh(
      this.tieni(new SphereGeometry(RB, 12, 8)),
      this.tieni(new MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.35, metalness: 0, envMapIntensity: 0.6 })),
      NUMERI,
    )
    this.riflesse.frustumCulled = false
    riflesso.add(this.riflesse)
    const colore = new Color()
    for (let n = 1; n <= NUMERI; n += 1) {
      const materiale = this.tieni(
        new MeshStandardMaterial({
          map: this.tieni(facciaDi(n, LATO_FACCIA.dentro)),
          roughness: 0.17,
          metalness: 0,
          envMapIntensity: 1.35,
        }),
      )
      const mesh = new Mesh(forma, materiale)
      const p = CENTRO.clone().add(
        new Vector3((Math.random() - 0.5) * 2.6, -R + RB + Math.random() * 1.8, (Math.random() - 0.5) * 2.6),
      )
      mesh.position.copy(p)
      const rotola = new Quaternion().setFromAxisAngle(
        new Vector3(Math.random(), Math.random(), Math.random()).normalize(),
        Math.random() * 6,
      )
      mesh.quaternion.copy(rotola)
      this.scene.add(mesh)
      const b: Pallina = { numero: n, mesh, materiale, p, v: new Vector3(), rotola, fuori: null }
      this.palline.push(b)
      this.dentro.push(b)
      this.riflesse.setColorAt(n - 1, colore.set(coloreDellaPallina(n)))
    }
    // Un attimo di fisica senz'aria, perche' si posino senza compenetrarsi.
    for (let i = 0; i < 240; i += 1) this.fisica(1 / 120, 0)
  }

  /** I numeri estratti, nell'ordine: arrivano con l'inizio della diretta. */
  imposta(estratti: number[] | null) {
    this.estratti = estratti
  }

  ridimensiona(larghezza: number, altezza: number) {
    if (larghezza <= 0 || altezza <= 0) return
    this.renderer.setSize(larghezza, altezza, false)
    this.larghezza = larghezza
    this.altezza = altezza
  }

  /**
   * Quanto coprono le scritte, sopra e sotto, in pixel: la regia mette quel che
   * conta nel mezzo che resta. Quando cambia (il riepilogo che arriva) la
   * camera ci scivola, invece di saltare.
   */
  inquadratura(sopra: number, sotto: number) {
    this.campo.sopra = Math.max(0, sopra)
    this.campo.sotto = Math.max(0, sotto)
  }

  avvia() {
    this.prima = performance.now()
    const giro = () => {
      this.disegna()
      this.frame = requestAnimationFrame(giro)
    }
    this.frame = requestAnimationFrame(giro)
  }

  distruggi() {
    cancelAnimationFrame(this.frame)
    for (const x of this.daButtare) x.dispose()
    this.riflesse.dispose()
    this.renderer.dispose()
  }

  /**
   * Le palline dentro l'urna: la gravita', l'aria dal fondo quando soffia, che
   * le fa anche girare attorno all'asse dell'urna, le pareti e gli urti fra
   * loro. Due vettori di lavoro per tutti i conti: a sessanta fotogrammi, un
   * vettore nuovo per coppia sarebbero ventimila oggetti al secondo da raccogliere.
   */
  private fisica(dt: number, forza: number) {
    const dentro = this.dentro
    const limite = R - RB
    const d = this.lavoro
    for (const b of dentro) {
      b.v.y -= 9.8 * dt
      if (forza > 0) {
        // L'aria entra dal fondo: lancia in alto chi ci arriva, e in alto non basta a tenerle su. E' una fontana.
        const basso = entro((CENTRO.y - b.p.y) / R + 0.35)
        b.v.y += (4 + 34 * basso * basso * basso) * forza * dt * (0.6 + Math.random() * 0.8)
        b.v.x += ((Math.random() - 0.5) * 26 - (b.p.z - CENTRO.z) * 3) * forza * dt
        b.v.z += ((Math.random() - 0.5) * 26 + (b.p.x - CENTRO.x) * 3) * forza * dt
      }
      b.v.multiplyScalar(1 - (forza > 0 ? 0.5 : 2.5) * dt)
      const v = b.v.length()
      if (v > 9) b.v.multiplyScalar(9 / v)
      b.p.addScaledVector(b.v, dt)
      d.subVectors(b.p, CENTRO)
      const l = d.length()
      if (l > limite) {
        d.divideScalar(l)
        b.p.copy(CENTRO).addScaledVector(d, limite)
        const vn = b.v.dot(d)
        if (vn > 0) b.v.addScaledVector(d, -1.75 * vn)
      }
    }
    for (let i = 0; i < dentro.length; i += 1) {
      for (let j = i + 1; j < dentro.length; j += 1) {
        const a = dentro[i]
        const b = dentro[j]
        d.subVectors(b.p, a.p)
        const l = d.length()
        if (l >= RB * 2 || l === 0) continue
        d.divideScalar(l)
        const spinta = (RB * 2 - l) / 2
        a.p.addScaledVector(d, -spinta)
        b.p.addScaledVector(d, spinta)
        const rel = this.lavoro2.subVectors(a.v, b.v).dot(d)
        if (rel > 0) {
          a.v.addScaledVector(d, -rel * 0.95)
          b.v.addScaledVector(d, rel * 0.95)
        }
      }
    }
  }

  /** La pallina che esce lascia l'urna, e si guarda da vicino: il suo numero passa all'immagine grande. */
  private esce(b: Pallina, posto: number) {
    b.fuori = { posto, da: b.p.clone() }
    this.dentro.splice(this.dentro.indexOf(b), 1)
    const piccola = b.materiale.map
    b.materiale.map = this.tieni(facciaDi(b.numero, LATO_FACCIA.fuori))
    b.materiale.needsUpdate = true
    piccola?.dispose()
  }

  /**
   * Dove sta la pallina del posto `posto`, `ms` dopo la sua uscita: risucchiata
   * dal suo punto nell'urna (`da`; senza, dalla bocca) fin su alla bocca, giu'
   * per il tubo, e sulla rotaia fino al suo posto, dove entra con la
   * velocita' che aveva in fondo al tubo e si ferma.
   */
  private percorso(posto: number, ms: number, da: Vector3 | null, out: Vector3): Vector3 {
    if (ms < RISUCCHIO_MS) {
      if (!da) return out.copy(USCITA)
      const q = liscia(entro(ms / RISUCCHIO_MS))
      return out.copy(da).lerp(USCITA, q * q)
    }
    if (ms < RISUCCHIO_MS + TUBO_MS) return TUBO.getPointAt(nelTubo((ms - RISUCCHIO_MS) / TUBO_MS), out)
    const q = entro((ms - RISUCCHIO_MS - TUBO_MS) / ROTAIA_MS)
    const strada = FINE_TUBO_X - POSTI_X[posto]
    // Hermite: parte con la pendenza della velocita' d'arrivo, e arriva ferma. Se arriva veloce, va un filo oltre e
    // torna.
    const m0 = Math.min(4, (VELOCITA_FINE_TUBO * (ROTAIA_MS / 1000)) / strada)
    const f = m0 * (q * q * q - 2 * q * q + q) + (3 * q * q - 2 * q * q * q)
    return out.set(FINE_TUBO_X - strada * f, BINARIO.y, BINARIO.z)
  }

  /** Il giro di un fotogramma: la fisica, le palline, le luci, gli effetti, la camera. */
  private disegna() {
    const ora = performance.now()
    const passato = (ora - this.prima) / 1000
    const dt = Math.min(0.05, passato)
    this.prima = ora
    const t = this.tempo()
    const s = t / 1000

    // Le palline che escono: quando e' il loro momento lasciano l'urna.
    let usciti = 0
    if (this.estratti) {
      for (let posto = 0; posto < this.estratti.length; posto += 1) {
        const b = this.palline[this.estratti[posto] - 1]
        if (b && !b.fuori && t >= PALLINE_MS[posto]) this.esce(b, posto)
        if (t >= PALLINE_MS[posto] + ARRIVO_MS) usciti += 1
      }
    }

    // Il momento: la pallina di cui si parla, e le sue fasi.
    let i = 0
    while (i + 1 < PALLINE_MS.length && t >= PALLINE_MS[i + 1] - ATTESA_MS) i += 1
    const t0 = PALLINE_MS[i]
    const ms = t - t0
    const accese = t < 0 ? 0 : liscia(entro(t / 1400))
    const sospeso = finestra(t, t0 - ATTESA_MS, 1700, t0 + RISUCCHIO_MS, 900)
    const lampo = colpo(t, t0 + RISUCCHIO_MS, 260) * (this.fermo ? 0.3 : 1)
    const arrivo = colpo(t, t0 + ARRIVO_MS, 520) * (this.fermo ? 0.4 : 1)
    const inTubo = finestra(t, t0 + RISUCCHIO_MS - 150, 200, t0 + RISUCCHIO_MS + TUBO_MS, 450)
    const inVetrina = finestra(t, t0 + RISUCCHIO_MS + TUBO_MS - 150, 700, t0 + ARRIVO_MS + VETRINA_MS, 1300)
    const finale = liscia(entro((t - RIEPILOGO_MS + 600) / 2200))
    // Lo studio cala nell'attesa, e un po' anche quando la pallina e' in vetrina: la luce va a lei.
    const luce = 0.3 + 0.7 * accese * (1 - 0.6 * sospeso) * (1 - 0.3 * inVetrina) + 0.35 * lampo
    this.percorso(i, ms, null, this.palla)
    this.posto.set(POSTI_X[i], BINARIO.y, BINARIO.z)

    // La fisica: l'aria si alza piano, e soffia piu' forte nell'attesa.
    const soffia = t >= SOFFIO.da && t < SOFFIO.a
    let forza = soffia ? entro((t - SOFFIO.da) / 1500) * entro((SOFFIO.a - t) / 1200 + 0.2) : 0
    forza *= (1 + 0.35 * sospeso) * (this.fermo ? 0.3 : 1)
    for (let k = 0; k < 2; k += 1) this.fisica(dt / 2, forza)

    this.muoviPalline(t)

    // Le luci: lo studio si accende all'inizio, cala nell'attesa, e lampeggia quando la pallina entra nel tubo.
    this.scene.environmentIntensity = 0.55 + 0.45 * luce + 0.5 * lampo
    this.ambiente.intensity = 0.7 * luce
    this.chiave.intensity = 3.2 * (0.55 + 0.45 * luce) + 2 * lampo
    this.blu.intensity = 2.2 * luce
    this.calda.intensity = 1.4 * luce + 1.2 * finale
    this.seguito.position.copy(inVetrina > inTubo ? this.posto : this.palla).add(this.lavoro.set(0.3, 0.8, 0.9))
    this.seguito.intensity = 3.5 * inTubo + 1.6 * inVetrina + 2.5 * arrivo

    const fermo = this.fermo
    const tempoLuci = fermo ? 0 : s
    this.sfondoMateriale.uniforms.uTempo.value = tempoLuci
    this.sfondoMateriale.uniforms.uLuce.value = luce
    this.sfondoMateriale.uniforms.uLampo.value = 0.8 * lampo + 0.5 * arrivo
    this.pavimentoMateriale.uniforms.uLuce.value = luce
    this.pavimentoMateriale.uniforms.uCalda.value = 0.06 * usciti + 0.3 * arrivo
    this.quadranteMateriale.opacity = 0.1 + 0.22 * luce + 0.35 * arrivo
    this.pozzaMateriale.opacity = 0.75 * luce
    this.pozzaCaldaMateriale.opacity = 0.18 * usciti + 0.5 * arrivo + 0.2 * finale
    for (const l of this.lampadine) {
      l.uniforms.uTempo.value = tempoLuci
      l.uniforms.uVelocita.value = 1.6 + 7 * sospeso
      l.uniforms.uLuce.value = 0.15 + 0.85 * accese
      l.uniforms.uForza.value = 1.1 * arrivo + 0.6 * lampo + (fermo ? 0 : 0.25 * finale * (0.5 + 0.5 * Math.sin(s * 5)))
    }
    this.bordoMateriale.uniforms.uForza.value = 0.45 + 0.4 * luce + 0.8 * lampo
    this.gettoMateriale.uniforms.uForza.value = 0.22 * forza
    const nelTuboOra = finestra(t, t0 + RISUCCHIO_MS - 60, 160, t0 + RISUCCHIO_MS + TUBO_MS, 700)
    this.sciaMateriale.uniforms.uForza.value = 1.4 * nelTuboOra
    this.sciaMateriale.uniforms.uPos.value = nelTubo(entro((ms - RISUCCHIO_MS) / TUBO_MS))
    this.pulviscolo.uniforms.uTempo.value = tempoLuci
    this.pulviscolo.uniforms.uLuce.value = 0.35 + 0.65 * accese
    // I meridiani: un giro lento, che accelera mentre l'aria soffia; e' l'integrale della velocita', quindi del tempo.
    const giro = 0.12 * s + 0.5 * entro((t - SOFFIO.da) / (SOFFIO.a - SOFFIO.da)) * ((SOFFIO.a - SOFFIO.da) / 1000)
    this.meridiani.rotation.y = fermo ? 0 : giro
    this.meridianiRiflessi.rotation.y = this.meridiani.rotation.y

    // La rotaia: ogni posto si accende all'arrivo della sua pallina, e resta acceso, con l'aureola dietro.
    for (let k = 0; k < PALLINE_MS.length; k += 1) {
      const x = PALLINE_MS[k]
      const arrivata = this.estratti !== null && t >= x + ARRIVO_MS
      const suo = colpo(t, x + ARRIVO_MS, 650)
      const attesa = k === i ? sospeso : 0
      const pulsa = fermo ? 1 : 0.6 + 0.4 * Math.sin(s * 9)
      this.posti[k].emissiveIntensity = arrivata ? 1.1 + 2.6 * suo : 0.12 + 0.9 * attesa * pulsa
      const a = this.aureole[k]
      a.material.opacity = arrivata ? 0.3 + 0.45 * suo + 0.18 * finale : 0
      a.scale.setScalar(1.15 + 0.4 * suo)
    }

    this.effettiDiColpo(t, i, lampo, arrivo)
    this.colonna.position.copy(this.posto).y -= RB_FUORI * 0.75
    this.colonnaMateriale.uniforms.uForza.value = 1.3 * arrivo + 0.22 * inVetrina

    // I riflettori: girano da soli, e nell'attesa si stringono sulla bocca, poi seguono la pallina e la aspettano al
    // suo posto.
    for (let k = 0; k < this.fasci.length; k += 1) {
      const f = this.fasci[k]
      const w = 0.55 + 0.25 * Math.sin(tempoLuci * 0.21 + f.fase)
      f.mira.set(
        Math.sin(tempoLuci * 0.33 * w + f.fase) * 3.6,
        PIANO,
        Math.cos(tempoLuci * 0.27 * w + f.fase * 1.3) * 2.6 + 0.4,
      )
      if (finale > 0) f.mira.lerp(this.lavoro.set((k - 2.5) * 0.9, BINARIO.y, BINARIO.z), 0.6 * finale)
      f.mira.lerp(this.lavoro.copy(USCITA).add(this.lavoro2.set((k - 2.5) * 0.12, 0, 0)), sospeso)
      f.mira.lerp(this.palla, inTubo)
      f.mira.lerp(this.posto, inVetrina)
      f.mesh.lookAt(f.mira)
      // All'inizio si accendono uno dopo l'altro, con un colpo.
      const acceso = t < 0 ? 0.04 : entro((t - 120 * k) / 90)
      const colpoDiAccensione = t < 0 ? 0 : colpo(t, 120 * k, 260) * (fermo ? 0 : 1)
      f.materiale.uniforms.uForza.value =
        acceso * (0.3 + 0.12 * sospeso + 0.14 * inTubo + 0.16 * inVetrina + 0.1 * finale) +
        0.5 * colpoDiAccensione +
        0.22 * lampo +
        0.2 * arrivo
    }

    this.inquadra(t, passato)
    this.sfondo.position.copy(this.camera.position)
    this.renderer.render(this.scene, this.camera)
  }

  /** Le palline: quelle nell'urna dove le mette la fisica, quelle uscite lungo il loro viaggio; e i loro riflessi. */
  private muoviPalline(t: number) {
    for (const b of this.palline) {
      const prima = this.lavoro.copy(b.mesh.position)
      let k = 1
      if (b.fuori) {
        const ms = t - PALLINE_MS[b.fuori.posto]
        this.percorso(b.fuori.posto, ms, b.fuori.da, b.mesh.position)
        // Nel tubo cresce fino alla misura della rotaia.
        b.mesh.scale.setScalar(1 + (RB_FUORI / RB - 1) * liscia(entro((ms - RISUCCHIO_MS) / TUBO_MS)))
        k = b.mesh.scale.x
      } else {
        b.mesh.position.copy(b.p)
      }
      // Rotola: gira attorno all'asse orizzontale perpendicolare a dove va.
      const passo = this.lavoro2.subVectors(b.mesh.position, prima)
      const l = passo.length()
      if (l > 1e-4 && l < 1) {
        const asse = this.lavoro3.set(passo.z, 0, -passo.x)
        if (asse.lengthSq() > 1e-8) b.rotola.premultiply(this.q.setFromAxisAngle(asse.normalize(), l / (RB * k)))
      }
      if (b.fuori) this.orienta(b, t - PALLINE_MS[b.fuori.posto])
      else b.mesh.quaternion.copy(b.rotola)
      // Il riflesso: la stessa posizione nel gruppo capovolto, senza girarla, che non ha numeri.
      this.matrice.makeScale(b.mesh.scale.x, b.mesh.scale.x, b.mesh.scale.x).setPosition(b.mesh.position)
      this.riflesse.setMatrixAt(b.numero - 1, this.matrice)
    }
    this.riflesse.instanceMatrix.needsUpdate = true
  }

  /**
   * Come gira la pallina che esce. Nel tubo rotola come vuole; verso la fine
   * passa a rotolare come deve, cosi' che sulla rotaia giri come una ruota con
   * il numero verso chi guarda, e arrivi al suo posto dritta, con il numero
   * verso la camera della vetrina: e' il momento in cui la si mostra.
   */
  private orienta(b: Pallina, ms: number) {
    const { posto } = b.fuori!
    const x = b.mesh.position.x
    const sullaRotaia = ms >= RISUCCHIO_MS + TUBO_MS
    // Rotolando verso sinistra di una strada d, una palla gira di d/r attorno all'asse che guarda chi la guarda.
    const ruota = ((POSTI_X[posto] - (sullaRotaia ? x : FINE_TUBO_X)) / RB_FUORI) * (this.fermo ? 0 : 1)
    const voluta = this.q.setFromAxisAngle(ASSE_Z, ruota).multiply(FACCIA)
    // Arrivata, si assesta nel suo posto: un dondolio che si spegne, e un saltello. Il numero resta a chi guarda.
    const dopo = (ms - ARRIVO_MS) / 1000
    if (!this.fermo && dopo > 0 && dopo < 1.6) {
      const smorza = (1 - dopo / 1.6) ** 2
      voluta.premultiply(this.q2.setFromAxisAngle(ASSE_Y, 0.32 * Math.sin(dopo * 9) * smorza))
      b.mesh.position.y += 0.05 * Math.abs(Math.sin(dopo * 7)) * smorza
    }
    const w = liscia(entro((ms - RISUCCHIO_MS - TUBO_MS * 0.5) / (TUBO_MS * 0.5)))
    if (w >= 1) b.mesh.quaternion.copy(voluta)
    else b.mesh.quaternion.copy(b.rotola).slerp(voluta, w)
    // Dopo che si e' fermata, il rotolare non conta piu': la prossima volta riparte da qui.
    if (w >= 1) b.rotola.copy(voluta)
  }

  /** Il lampo e l'onda alla bocca quando la pallina entra nel tubo, e al suo posto quando arriva; e le scintille. */
  private effettiDiColpo(t: number, i: number, lampo: number, arrivo: number) {
    const t0 = PALLINE_MS[i]
    const alArrivo = t >= t0 + ARRIVO_MS
    // All'arrivo il lampo sta dietro la pallina, che lo copre: e' una luce alle spalle, non un velo sul numero.
    const dove = alArrivo ? this.lavoro.copy(this.posto).add(this.lavoro2.set(0, 0.05, -0.4)) : this.lavoro.copy(USCITA)
    const da = alArrivo ? t0 + ARRIVO_MS : t0 + RISUCCHIO_MS
    const eta = (t - da) / 1000
    const forte = alArrivo ? arrivo : lampo
    this.lampo.position.copy(dove)
    this.lampo.material.opacity = Math.min(1, forte * (alArrivo ? 0.7 : 0.85))
    this.lampo.material.depthTest = alArrivo
    this.lampo.scale.setScalar((alArrivo ? 1.4 : 0.6) + (1 - forte) * (alArrivo ? 2 : 1.6))
    const onda = eta >= 0 && eta < 0.9 ? 1 - eta / 0.9 : 0
    this.onda.position.copy(dove)
    this.onda.material.opacity = (this.fermo ? 0.3 : 0.9) * onda * onda
    this.onda.scale.setScalar(0.4 + (1 - onda) * (alArrivo ? 2.6 : 2.2))
    this.origineScintille.copy(dove)
    this.scintille.uniforms.uEta.value = this.fermo || t < t0 ? -1 : eta
  }

  /**
   * La regia: la scaletta (`REGIA`) dice quale ripresa vale adesso e da quanto,
   * e nel passaggio la camera va dall'una all'altra, tutte e due vive. Una
   * scaletta che e' una funzione del tempo non ha salti, e quindi la camera
   * la segue senza ritardo; un salto c'e' solo quando cambia la finestra, o
   * quando il telefono si era fermato, e allora la camera ci arriva in un
   * attimo invece di saltare. Il primo fotogramma, per chi arriva a meta',
   * e' gia' quello giusto.
   */
  private inquadra(t: number, passato: number) {
    // Il campo libero fra le scritte, che scivola quando cambia.
    const segui = this.primo || this.fermo ? 1 : 1 - Math.exp(-passato * 4)
    this.campoVisto.sopra += (this.campo.sopra - this.campoVisto.sopra) * segui
    this.campoVisto.sotto += (this.campo.sotto - this.campoVisto.sotto) * segui
    const alto = Math.max(this.altezza * 0.4, this.altezza - this.campoVisto.sopra - this.campoVisto.sotto)
    const aspetto = this.larghezza / alto
    this.camera.fov = 46 - 8 * entro((aspetto - 0.6) / 0.8)
    // Il centro della proiezione e' il centro del campo libero, e l'angolo e' quello del campo.
    this.camera.setViewOffset(this.larghezza, alto, 0, -this.campoVisto.sopra, this.larghezza, this.altezza)
    const tanV = Math.tan(((this.camera.fov / 2) * Math.PI) / 180)
    const scala = (alto * this.renderer.getPixelRatio()) / (2 * tanV)
    this.pulviscolo.uniforms.uScala.value = scala
    this.scintille.uniforms.uScala.value = scala

    const { occhio, guarda } = this.voluto
    if (this.fermo) {
      this.posa('largo', 0, 0, aspetto, tanV, occhio, guarda)
    } else {
      const k = staccoDi(t)
      const ora = REGIA[k]
      this.posa(ora.ripresa, ora.pallina, t, aspetto, tanV, occhio, guarda)
      const w = liscia(entro((t - ora.da) / ora.passaggio))
      if (w < 1 && k > 0) {
        const prima = REGIA[k - 1]
        this.posa(prima.ripresa, prima.pallina, t, aspetto, tanV, this.lavoro, this.lavoro2)
        occhio.lerpVectors(this.lavoro, occhio, w)
        guarda.lerpVectors(this.lavoro2, guarda, w)
      }
    }

    if (this.primo) {
      this.scarto.occhio.set(0, 0, 0)
      this.scarto.guarda.set(0, 0, 0)
    } else {
      // Un passo piu' lungo di quanto la regia si muova da sola e' un salto: lo si assorbe.
      const soglia = Math.max(0.6, 15 * passato)
      if (occhio.distanceTo(this.occhioPrima) > soglia || guarda.distanceTo(this.guardaPrima) > soglia) {
        this.scarto.occhio.add(this.lavoro.subVectors(this.occhioPrima, occhio))
        this.scarto.guarda.add(this.lavoro.subVectors(this.guardaPrima, guarda))
      }
      const resta = Math.exp(-passato * 3)
      this.scarto.occhio.multiplyScalar(resta)
      this.scarto.guarda.multiplyScalar(resta)
    }
    this.primo = false
    this.occhioPrima.copy(occhio)
    this.guardaPrima.copy(guarda)
    this.occhio.copy(occhio).add(this.scarto.occhio)
    this.guarda.copy(guarda).add(this.scarto.guarda)
    this.camera.position.copy(this.occhio)
    this.camera.lookAt(this.guarda)
  }

  /**
   * Una ripresa, al tempo `t`: dove sta la camera e dove guarda. Le distanze
   * vengono da quel che deve starci (`adatta`: mezza larghezza e mezza
   * altezza), con l'aspetto del campo libero: su un telefono in piedi la
   * camera sta piu' indietro.
   */
  private posa(
    ripresa: Ripresa,
    pallina: number,
    t: number,
    aspetto: number,
    tanV: number,
    occhio: Vector3,
    guarda: Vector3,
  ) {
    const s = t / 1000
    // Quanto stare lontani perche' ci stia quel che deve, mezza larghezza e mezza altezza, nel campo libero.
    const k = tanV * aspetto
    const adatta = (mezzaL: number, mezzaA: number) => (mezzaA / tanV > mezzaL / k ? mezzaA / tanV : mezzaL / k)
    const t0 = PALLINE_MS[pallina]
    switch (ripresa) {
      case 'studio': {
        // Prima dell'inizio: lo studio dall'alto, nella penombra, che gira piano.
        const a = 0.35 * Math.sin(s * 0.05) - 0.25
        const d = adatta(4.4, 3.6) * 1.05
        guarda.set(0, 0.5, 0.6)
        occhio.set(Math.sin(a) * d * 0.85, 6.6, Math.cos(a) * d * 0.85)
        return
      }
      case 'largo': {
        const a = this.fermo ? 0.12 : 0.22 * Math.sin(s / 7 + 0.6)
        const d = adatta(2.55, 2.75)
        guarda.set(0.35, 0.15, 0.6)
        const su = 1.05 + (this.fermo ? 0 : 0.3 * Math.sin(s / 5))
        occhio.set(guarda.x + Math.sin(a) * d, guarda.y + su, guarda.z + Math.cos(a) * d)
        return
      }
      case 'dettaglio': {
        // L'urna da vicino e dal basso, mentre l'aria soffia: le palline volano davanti all'obiettivo.
        const a = (pallina % 2 === 0 ? 0.5 : -0.5) + 0.15 * Math.sin(s * 0.2)
        const d = Math.max(3.5, adatta(1.75, 1.55))
        guarda.copy(CENTRO).y -= 0.3
        occhio.set(CENTRO.x + Math.sin(a) * d, CENTRO.y - 0.7, CENTRO.z + Math.cos(a) * d)
        return
      }
      case 'bocca': {
        // L'attesa: si sale alla bocca, e ci si avvicina piano.
        const d = Math.max(2.8, adatta(1.4, 1.25)) * (1 - 0.14 * entro((t - t0 + ATTESA_MS) / ATTESA_MS))
        guarda.copy(USCITA).y -= 0.3
        occhio.copy(USCITA).add(this.lavoro3.set(0.36, 0.24, 0.9).normalize().multiplyScalar(d))
        return
      }
      case 'inseguimento': {
        this.percorso(pallina, t - t0, null, guarda)
        const d = Math.max(2.1, adatta(0.95, 0.8))
        occhio.copy(guarda).add(this.lavoro3.set(-0.22, 0.38, 1).normalize().multiplyScalar(d))
        return
      }
      case 'vetrina': {
        // La pallina al suo posto, da vicino e dall'alto, con il buio della pedana dietro: la camera le gira
        // attorno di un arco, e la tiene un po' sopra il centro, dove il sottopancia non arriva.
        const x = POSTI_X[pallina]
        const d = Math.min(3.7, Math.max(2.2, adatta(1, 0.8)))
        const arco = entro((t - t0 - RISUCCHIO_MS - TUBO_MS) / (ROTAIA_MS + VETRINA_MS))
        const a = 0.34 - 0.46 * liscia(arco)
        guarda.set(x, BINARIO.y - 0.16 * d, BINARIO.z - 0.1 * d)
        occhio.set(x + Math.sin(a) * d * 0.8, BINARIO.y + 0.62 * d, BINARIO.z + Math.cos(a) * d * 0.8)
        return
      }
      case 'finale': {
        // Le quattro sulla rotaia, con l'urna dietro; la camera ondeggia appena.
        const a = 0.12 * Math.sin(s / 6)
        const d = adatta(1.85, 0.6)
        guarda.set(0, BINARIO.y + 0.05, BINARIO.z - 0.2)
        occhio.set(Math.sin(a) * d, BINARIO.y + 0.3 * d, BINARIO.z + Math.cos(a) * d)
        return
      }
    }
  }
}
