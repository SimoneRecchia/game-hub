import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { NUMERI, PALLINE_MS } from '@shared/superenalotto'
import { coloreDellaPallina } from './palline'

/**
 * L'urna del SuperEnalotto in 3D: la sfera di vetro sul piedistallo d'oro, le
 * venti palline che l'aria fa saltare, il tubo da cui esce la pallina estratta
 * e la rotaia davanti, dove le quattro si mettono in fila con il numero verso
 * chi guarda. E' tutta una funzione del tempo della diretta (`tempo`, in
 * millisecondi dall'inizio): chi arriva a meta' trova le palline gia' uscite al
 * loro posto, e quella che sta uscendo dove deve essere. Le palline dentro
 * l'urna invece si muovono con una fisica loro, a caso: due telefoni non le
 * vedono uguali, ed e' giusto cosi', l'urna vera non si ripete.
 *
 * Una scena sola, con pochi oggetti e niente ombre vere: un telefono la fa
 * girare senza scaldarsi. La luce del vetro e dell'oro viene da un ambiente
 * calcolato una volta (`RoomEnvironment`), non da un'immagine da scaricare.
 */

const R = 2
const RB = 0.27
const CENTRO = new Vector3(0, 0.55, 0)
const PIANO = CENTRO.y - R - 0.85
const BINARIO = { y: PIANO + 0.18 + RB, z: 2.35 }
const POSTI_X = [-1.2, -0.4, 0.4, 1.2]
/** Quanto dura il viaggio di una pallina, dall'urna al suo posto sulla rotaia. */
export const VIAGGIO_MS = 3800
/** L'aria soffia dall'inizio della diretta fino a poco dopo l'ultima pallina. */
const SOFFIO = { da: 4500, a: PALLINE_MS[PALLINE_MS.length - 1] + 3500 }

const USCITA = CENTRO.clone().add(new Vector3(0, R + 0.05, 0))
const TUBO = new CatmullRomCurve3([
  USCITA,
  new Vector3(0, CENTRO.y + R + 0.75, 0.35),
  new Vector3(1.5, CENTRO.y + R + 0.55, 1.3),
  new Vector3(2.65, CENTRO.y + 0.1, 2.1),
  new Vector3(2.75, BINARIO.y + 0.6, BINARIO.z),
  new Vector3(2.25, BINARIO.y, BINARIO.z),
])

const liscia = (x: number) => x * x * (3 - 2 * x)
const entro = (x: number) => Math.min(1, Math.max(0, x))

interface Pallina {
  numero: number
  mesh: Mesh
  p: Vector3
  v: Vector3
  /** Uscita: in che posto della rotaia va, e da dove e' partita. */
  fuori: { posto: number; da: Vector3 } | null
}

/** La faccia di una pallina: il colore, e il numero in un tondo bianco, due volte, davanti e dietro. */
function facciaDi(n: number): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = coloreDellaPallina(n)
  g.fillRect(0, 0, 256, 128)
  for (const x of [64, 192]) {
    g.fillStyle = '#fbfbf7'
    g.beginPath()
    g.ellipse(x, 64, 34, 38, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#16161c'
    g.font = '800 46px system-ui, -apple-system, sans-serif'
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

/** Un alone tondo, per l'ombra sotto l'urna e le luci sulla pedana. */
function alone(colore: string): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, colore)
  r.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

export class Urna {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(40, 1, 0.1, 100)
  private readonly palline: Pallina[] = []
  private readonly luceInViaggio = new PointLight(0xffd27a, 0, 4, 1.5)
  private readonly luceAlta: SpotLight
  private readonly posti: Mesh[] = []
  private readonly daButtare: Array<BufferGeometry | Material | Texture> = []
  private estratti: number[] | null = null
  private frame = 0
  private prima = 0
  private distanza = 10
  private readonly occhio = new Vector3(0, 4, 18)
  private readonly guarda = new Vector3(0, 0, 0)
  private readonly fermo: boolean
  private primo = true
  private readonly lavoro = new Vector3()
  private readonly lavoro2 = new Vector3()
  private readonly identita = new Quaternion()

  constructor(
    canvas: HTMLCanvasElement,
    private readonly tempo: () => number,
  ) {
    this.fermo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = SRGBColorSpace

    const pmrem = new PMREMGenerator(this.renderer)
    const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = ambiente
    this.daButtare.push(ambiente)

    this.scene.add(new AmbientLight(0x2a3a66, 0.7))
    this.luceAlta = new SpotLight(0xffffff, 3.2, 0, 0.5, 0.55, 0)
    this.luceAlta.position.set(0, 10, 4)
    this.luceAlta.target.position.copy(CENTRO)
    this.scene.add(this.luceAlta, this.luceAlta.target)
    const blu = new PointLight(0x3d7bff, 2.2, 0, 0)
    blu.position.set(-5, 1.5, 3)
    const calda = new PointLight(0xffb347, 1.4, 0, 0)
    calda.position.set(5, -0.5, 4)
    this.scene.add(blu, calda, this.luceInViaggio)

    this.costruisci()
    this.mettiPalline()
  }

  private tieni<T extends BufferGeometry | Material | Texture>(x: T): T {
    this.daButtare.push(x)
    return x
  }

  /** La pedana, il piedistallo, la sfera di vetro, il tubo e la rotaia. */
  private costruisci() {
    const oro = this.tieni(new MeshStandardMaterial({ color: 0xd9a94a, metalness: 1, roughness: 0.28 }))
    const oroScuro = this.tieni(new MeshStandardMaterial({ color: 0x8a6420, metalness: 1, roughness: 0.4 }))
    const vetro = this.tieni(
      new MeshPhysicalMaterial({
        color: 0xdfefff,
        metalness: 0,
        roughness: 0.04,
        transparent: true,
        opacity: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 2.2,
        depthWrite: false,
      }),
    )
    const vetroDentro = this.tieni(
      new MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.05, side: DoubleSide, depthWrite: false }),
    )

    // La pedana: un disco scuro, con l'orlo d'oro che si accende.
    const pedana = new Mesh(
      this.tieni(new CylinderGeometry(4.6, 4.85, 0.26, 72)),
      this.tieni(new MeshStandardMaterial({ color: 0x0d1a3d, metalness: 0.6, roughness: 0.45 })),
    )
    pedana.position.y = PIANO - 0.13
    const orlo = new Mesh(
      this.tieni(new TorusGeometry(4.66, 0.045, 10, 120)),
      this.tieni(new MeshBasicMaterial({ color: 0xffd27a })),
    )
    orlo.rotation.x = Math.PI / 2
    orlo.position.y = PIANO
    const ombra = new Mesh(
      this.tieni(new PlaneGeometry(4.6, 4.6)),
      this.tieni(
        new MeshBasicMaterial({ map: this.tieni(alone('rgba(0,0,0,0.75)')), transparent: true, depthWrite: false }),
      ),
    )
    ombra.rotation.x = -Math.PI / 2
    ombra.position.y = PIANO + 0.005
    const pozza = new Mesh(
      this.tieni(new PlaneGeometry(9, 9)),
      this.tieni(
        new MeshBasicMaterial({ map: this.tieni(alone('rgba(80,140,255,0.35)')), transparent: true, depthWrite: false }),
      ),
    )
    pozza.rotation.x = -Math.PI / 2
    pozza.position.y = PIANO + 0.004
    this.scene.add(pedana, orlo, pozza, ombra)

    // Il piedistallo d'oro, a gradini, e l'anello che tiene la sfera.
    const piede = new Mesh(this.tieni(new CylinderGeometry(1.15, 1.55, 0.6, 48)), oroScuro)
    piede.position.y = PIANO + 0.3
    const collo = new Mesh(this.tieni(new CylinderGeometry(0.7, 1.05, 0.35, 48)), oro)
    collo.position.y = PIANO + 0.75
    const anello = new Mesh(this.tieni(new TorusGeometry(1.05, 0.08, 16, 72)), oro)
    anello.rotation.x = Math.PI / 2
    anello.position.y = CENTRO.y - R * 0.86
    const equatore = new Mesh(this.tieni(new TorusGeometry(R + 0.02, 0.05, 12, 120)), oro)
    equatore.rotation.x = Math.PI / 2
    equatore.position.copy(CENTRO)
    const meridiano = new Mesh(this.tieni(new TorusGeometry(R + 0.02, 0.025, 8, 120)), oro)
    meridiano.position.copy(CENTRO)
    const sfera = new Mesh(this.tieni(new SphereGeometry(R, 64, 40)), vetro)
    sfera.position.copy(CENTRO)
    sfera.renderOrder = 2
    const dentro = new Mesh(this.tieni(new SphereGeometry(R * 0.995, 48, 32)), vetroDentro)
    dentro.position.copy(CENTRO)
    this.scene.add(piede, collo, anello, equatore, meridiano, dentro, sfera)

    // Il tubo di vetro, dall'uscita in cima alla rotaia, piu' leggero della sfera, e la sua bocca d'oro.
    const vetroTubo = this.tieni(vetro.clone())
    vetroTubo.opacity = 0.07
    vetroTubo.envMapIntensity = 1.4
    const tubo = new Mesh(this.tieni(new TubeGeometry(TUBO, 96, RB * 1.18, 16, false)), vetroTubo)
    tubo.renderOrder = 2
    const bocca = new Mesh(this.tieni(new TorusGeometry(RB * 1.4, 0.06, 12, 40)), oro)
    bocca.rotation.x = Math.PI / 2
    bocca.position.copy(USCITA)
    this.scene.add(tubo, bocca)

    // La rotaia: la barra d'oro, le due guide, e un anello per posto che si accende quando la pallina arriva.
    const rotaia = new Group()
    const barra = new Mesh(this.tieni(new CylinderGeometry(0.06, 0.06, 4.6, 12)), oro)
    barra.rotation.z = Math.PI / 2
    for (const dz of [-0.3, 0.3]) {
      const guida = barra.clone()
      guida.position.set(0.5, BINARIO.y - RB * 0.72, BINARIO.z + dz * 1.1)
      rotaia.add(guida)
    }
    const fondo = new Mesh(this.tieni(new BoxGeometry(4.6, 0.18, 0.78)), oroScuro)
    fondo.position.set(0.5, BINARIO.y - RB - 0.09, BINARIO.z)
    rotaia.add(fondo)
    POSTI_X.forEach((x) => {
      const posto = new Mesh(
        this.tieni(new TorusGeometry(RB * 0.95, 0.035, 8, 40)),
        this.tieni(new MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb02e, emissiveIntensity: 0.15 })),
      )
      posto.rotation.x = Math.PI / 2
      posto.position.set(x, BINARIO.y - RB * 0.75, BINARIO.z)
      this.posti.push(posto)
      rotaia.add(posto)
    })
    this.scene.add(rotaia)
  }

  /** Le venti palline, ferme sul fondo dell'urna. */
  private mettiPalline() {
    const forma = this.tieni(new SphereGeometry(RB, 32, 20))
    for (let n = 1; n <= NUMERI; n += 1) {
      const materiale = this.tieni(
        new MeshStandardMaterial({ map: this.tieni(facciaDi(n)), roughness: 0.22, metalness: 0, envMapIntensity: 1.2 }),
      )
      const mesh = new Mesh(forma, materiale)
      const p = CENTRO.clone().add(
        new Vector3((Math.random() - 0.5) * 2.4, -R + RB + Math.random() * 1.2, (Math.random() - 0.5) * 2.4),
      )
      mesh.position.copy(p)
      mesh.quaternion.setFromAxisAngle(new Vector3(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6)
      this.scene.add(mesh)
      this.palline.push({ numero: n, mesh, p, v: new Vector3(), fuori: null })
    }
    // Un attimo di fisica senz'aria, perche' si posino senza compenetrarsi.
    for (let i = 0; i < 240; i += 1) this.fisica(1 / 120, false, 0)
  }

  /** I numeri estratti, nell'ordine: arrivano con l'inizio della diretta. */
  imposta(estratti: number[] | null) {
    this.estratti = estratti
  }

  ridimensiona(larghezza: number, altezza: number) {
    if (larghezza <= 0 || altezza <= 0) return
    this.renderer.setSize(larghezza, altezza, false)
    const aspetto = larghezza / altezza
    this.camera.aspect = aspetto
    this.camera.fov = aspetto < 0.8 ? 46 : 38
    this.camera.updateProjectionMatrix()
    // Abbastanza lontano perche' ci stiano l'urna, il tubo e la rotaia, anche su un telefono in piedi.
    const mezzo = Math.tan(((this.camera.fov / 2) * Math.PI) / 180)
    this.distanza = Math.max(9.5, 3.4 / (mezzo * aspetto), 3.6 / mezzo)
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
    this.renderer.dispose()
  }

  /**
   * Le palline dentro l'urna: la gravita', l'aria dal fondo quando soffia, le
   * pareti e gli urti fra loro. Due vettori di lavoro per tutti i conti: a
   * sessanta fotogrammi, un vettore nuovo per coppia sarebbero ventimila
   * oggetti al secondo da raccogliere.
   */
  private fisica(dt: number, soffia: boolean, forza: number) {
    const dentro = this.palline.filter((b) => !b.fuori)
    const limite = R - RB
    const d = this.lavoro
    for (const b of dentro) {
      b.v.y -= 9.8 * dt
      if (soffia) {
        // L'aria entra dal fondo: lancia in alto chi ci arriva, e in alto non basta a tenerle su. E' una fontana.
        const basso = entro((CENTRO.y - b.p.y) / R + 0.35)
        b.v.y += (4 + 32 * basso * basso * basso) * forza * dt * (0.6 + Math.random() * 0.8)
        b.v.x += (Math.random() - 0.5) * 26 * forza * dt
        b.v.z += (Math.random() - 0.5) * 26 * forza * dt
      }
      b.v.multiplyScalar(1 - (soffia ? 0.5 : 2.5) * dt)
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

  /** Dove sta una pallina uscita, a un punto del suo viaggio (`k` da 0 a 1). */
  private viaggio(b: Pallina, k: number): Vector3 {
    const { posto, da } = b.fuori!
    if (k < 0.16) {
      // Risucchiata verso l'uscita in cima.
      const q = liscia(k / 0.16)
      return da.clone().lerp(USCITA, q * q)
    }
    if (k < 0.68) return TUBO.getPointAt(liscia((k - 0.16) / 0.52))
    const q = entro((k - 0.68) / 0.22)
    // Rotola sulla rotaia fino al suo posto, e ci si ferma con un piccolo ritorno.
    const x0 = TUBO.getPointAt(1).x
    const x1 = POSTI_X[posto]
    const rientro = Math.sin(q * Math.PI) * 0.06 * (1 - q)
    return new Vector3(x0 + (x1 - x0) * (1 - Math.pow(1 - q, 3)) - rientro, BINARIO.y, BINARIO.z)
  }

  private disegna() {
    const ora = performance.now()
    const dt = Math.min(0.05, (ora - this.prima) / 1000)
    this.prima = ora
    const t = this.tempo()

    // Le palline che escono: quando e' il loro momento lasciano l'urna.
    if (this.estratti) {
      this.estratti.forEach((n, posto) => {
        const b = this.palline.find((x) => x.numero === n)
        if (b && !b.fuori && t >= PALLINE_MS[posto]) b.fuori = { posto, da: b.p.clone() }
      })
    }
    const soffia = t >= SOFFIO.da && t < SOFFIO.a
    const forza = soffia ? entro((t - SOFFIO.da) / 1500) * entro((SOFFIO.a - t) / 1200 + 0.2) : 0
    const passi = 2
    for (let i = 0; i < passi; i += 1) this.fisica(dt / passi, soffia, this.fermo ? forza * 0.3 : forza)

    let inViaggio: Vector3 | null = null
    for (const b of this.palline) {
      const prima = b.mesh.position.clone()
      if (b.fuori) {
        const k = entro((t - PALLINE_MS[b.fuori.posto]) / VIAGGIO_MS)
        b.mesh.position.copy(this.viaggio(b, k))
        if (k < 1) inViaggio = b.mesh.position
        ;(this.posti[b.fuori.posto].material as MeshStandardMaterial).emissiveIntensity = k >= 0.9 ? 1.4 : 0.15
        if (k >= 0.9) {
          // Al suo posto si gira con il numero verso chi guarda.
          b.mesh.quaternion.slerp(this.identita, Math.min(1, dt * 6))
          continue
        }
      } else {
        b.mesh.position.copy(b.p)
      }
      // Rotola: gira attorno all'asse orizzontale perpendicolare a dove va.
      const passo = b.mesh.position.clone().sub(prima)
      const l = passo.length()
      if (l > 1e-4) {
        const asse = new Vector3(passo.z, 0, -passo.x)
        if (asse.lengthSq() > 1e-8) b.mesh.rotateOnWorldAxis(asse.normalize(), l / RB)
      }
    }

    // La luce che accompagna la pallina in viaggio.
    if (inViaggio) {
      this.luceInViaggio.position.copy(inViaggio).add(new Vector3(0, 0.5, 0.6))
      this.luceInViaggio.intensity = 6
    } else {
      this.luceInViaggio.intensity = Math.max(0, this.luceInViaggio.intensity - dt * 8)
    }
    this.luceAlta.intensity = 3.2 + (soffia ? Math.sin(ora / 90) * 0.25 : 0)

    this.inquadra(t, dt)
    this.renderer.render(this.scene, this.camera)
  }

  /** La regia: l'arrivo dall'alto, l'urna, ogni pallina da vicino quando arriva, e alla fine la rotaia. */
  private inquadra(t: number, dt: number) {
    const D = this.distanza
    const occhio = new Vector3(0, 1.1, D)
    const guarda = new Vector3(0.3, -0.15, 0.6)
    if (!this.fermo) {
      // Prima della diretta, e mentre si mescola, la camera gira piano attorno all'urna.
      const giro = Math.sin(t / 5200) * 0.14
      occhio.set(Math.sin(giro) * D, 1.1, Math.cos(giro) * D)
      if (t > -500 && t < 4500) {
        const q = liscia(entro(t / 4500))
        occhio.lerp(new Vector3(0, 1.1, D), q)
        occhio.add(new Vector3(0, 4 * (1 - q), D * 0.5 * (1 - q)))
      }
      PALLINE_MS.forEach((t0, posto) => {
        // Da quando la pallina esce dal tubo a un paio di secondi dopo che si e' fermata.
        const dentro = liscia(entro((t - t0 - VIAGGIO_MS * 0.55) / 700)) * (1 - liscia(entro((t - t0 - VIAGGIO_MS - 1700) / 900)))
        if (dentro <= 0) return
        const x = POSTI_X[posto]
        occhio.lerp(new Vector3(x * 0.6 + 0.6, BINARIO.y + 1.6, BINARIO.z + D * 0.42), dentro)
        guarda.lerp(new Vector3(x, BINARIO.y + 0.05, BINARIO.z), dentro)
      })
      const fine = PALLINE_MS[PALLINE_MS.length - 1] + VIAGGIO_MS + 2600
      if (t > fine) {
        const q = liscia(entro((t - fine) / 1500))
        occhio.lerp(new Vector3(0, BINARIO.y + 2.4, BINARIO.z + D * 0.62), q)
        guarda.lerp(new Vector3(0, BINARIO.y + 0.4, BINARIO.z - 0.5), q)
      }
    }
    // La camera insegue la regia, cosi' chi arriva a meta' non vede un salto.
    const segui = this.primo ? 1 : 1 - Math.exp(-dt * 3.2)
    this.primo = false
    this.occhio.lerp(occhio, segui)
    this.guarda.lerp(guarda, segui)
    this.camera.position.copy(this.occhio)
    this.camera.lookAt(this.guarda)
  }
}
