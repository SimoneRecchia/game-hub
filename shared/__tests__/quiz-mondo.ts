/**
 * Un mondo piccolo per provare il quiz: una quarantina di paesi, i cinque
 * oceani, qualche mare con la sua gerarchia, fiumi e laghi. I numeri sono
 * inventati ma verosimili: servono a provare le regole, non la geografia.
 *
 * Non e' un file di test: lo importano i test del quiz.
 */

import type { Continente } from '../quiz'
import type { AcquaQuiz, CittaQuiz, CorsoQuiz, DatiQuiz, PaeseQuiz } from '../quiz-dati'

type Riga = [id: string, n: string, cap: string, k: Continente[], num: string, a: number, f: number, conf: string[], bagna: Record<string, number>, vicine?: string[]]

const ATL = 'Q97'
const PAC = 'Q98'
const IND = 'Q1239'
const ART = 'Q788'
const ANT = 'Q7354'
const MED = 'Q4918'
const TIR = 'Q38882'
const ADR = 'Q13924'
const EGE = 'Q34575'
const NORD = 'Q1693'
const BALT = 'Q545'
const ROSSO = 'Q23406'
const CINESE = 'Q37660'
const GIAPPONE = 'Q27092'
const FILIPPINE = 'Q159183'
const BISCAGLIA = 'Q41573'
const CARAIBI = 'Q1247'
const NERO = 'Q166'
const ARABICO = 'Q58705'
const TASMAN = 'Q33254'

const PAESI: Riga[] = [
  ['IT', 'Italia', 'Roma', ['eu'], '380', 302_068, 0.95, ['FR', 'CH', 'AT', 'SI'], { [TIR]: 100, [MED]: 100, [ADR]: 58 }, [ATL]],
  ['FR', 'Francia', 'Parigi', ['eu'], '250', 551_695, 0.97, ['IT', 'CH', 'DE', 'BE', 'ES'], { [BISCAGLIA]: 100, [MED]: 60, [NORD]: 30 }, [ATL, TIR]],
  ['ES', 'Spagna', 'Madrid', ['eu'], '724', 505_990, 0.93, ['FR', 'PT'], { [MED]: 100, [ATL]: 100, [BISCAGLIA]: 53 }],
  ['PT', 'Portogallo', 'Lisbona', ['eu'], '620', 92_212, 0.8, ['ES'], { [ATL]: 100 }, [BISCAGLIA]],
  ['DE', 'Germania', 'Berlino', ['eu'], '276', 357_588, 0.96, ['FR', 'CH', 'AT', 'PL', 'NL', 'BE'], { [NORD]: 100, [BALT]: 100 }, [ATL]],
  ['AT', 'Austria', 'Vienna', ['eu'], '040', 83_879, 0.77, ['IT', 'DE', 'CH', 'SI'], {}, [ADR, MED, ATL]],
  ['CH', 'Svizzera', 'Berna', ['eu'], '756', 41_291, 0.83, ['IT', 'FR', 'DE', 'AT'], {}, [MED]],
  ['GR', 'Grecia', 'Atene', ['eu'], '300', 131_957, 0.81, ['TR'], { [EGE]: 100, [MED]: 100 }, [ADR, NERO, ATL]],
  ['HR', 'Croazia', 'Zagabria', ['eu'], '191', 56_594, 0.64, ['SI'], { [ADR]: 100, [MED]: 100 }, [ATL]],
  ['SI', 'Slovenia', 'Lubiana', ['eu'], '705', 20_273, 0.55, ['IT', 'AT', 'HR'], { [ADR]: 100, [MED]: 100 }, [ATL]],
  ['NO', 'Norvegia', 'Oslo', ['eu'], '578', 385_207, 0.82, ['SE'], { [ART]: 100, [NORD]: 16 }, [ATL]],
  ['SE', 'Svezia', 'Stoccolma', ['eu'], '752', 450_295, 0.84, ['NO'], { [BALT]: 100 }, [NORD, ATL]],
  ['PL', 'Polonia', 'Varsavia', ['eu'], '616', 312_696, 0.78, ['DE'], { [BALT]: 100 }, [ATL]],
  ['GB', 'Regno Unito', 'Londra', ['eu'], '826', 242_495, 0.94, ['IE'], { [NORD]: 100, [ATL]: 100 }],
  ['IE', 'Irlanda', 'Dublino', ['eu'], '372', 70_273, 0.72, ['GB'], { [ATL]: 100 }],
  ['NL', 'Paesi Bassi', 'Amsterdam', ['eu'], '528', 41_850, 0.86, ['DE', 'BE'], { [NORD]: 100 }, [ATL]],
  ['BE', 'Belgio', 'Bruxelles', ['eu'], '056', 30_528, 0.79, ['FR', 'DE', 'NL'], { [NORD]: 100 }, [ATL]],
  ['EG', 'Egitto', 'Il Cairo', ['af'], '818', 1_010_408, 0.9, [], { [ROSSO]: 100, [MED]: 100 }, [IND, ATL]],
  ['MA', 'Marocco', 'Rabat', ['af'], '504', 446_550, 0.7, [], { [ATL]: 100 }, [MED]],
  ['TN', 'Tunisia', 'Tunisi', ['af'], '788', 163_610, 0.6, [], { [MED]: 100 }, [ATL]],
  ['KE', 'Kenya', 'Nairobi', ['af'], '404', 581_309, 0.72, [], { [IND]: 100 }],
  ['ZA', 'Sudafrica', 'Pretoria', ['af'], '710', 1_221_037, 0.85, [], { [IND]: 100, [ATL]: 90 }],
  ['NG', 'Nigeria', 'Abuja', ['af'], '566', 923_768, 0.8, [], { [ATL]: 100 }],
  ['CN', 'Cina', 'Pechino', ['as'], '156', 9_596_961, 0.99, ['IN'], { [CINESE]: 100, [GIAPPONE]: 20 }, [PAC]],
  ['JP', 'Giappone', 'Tokyo', ['as'], '392', 377_972, 0.98, [], { [GIAPPONE]: 100, [PAC]: 100, [FILIPPINE]: 91 }],
  ['IN', 'India', 'Nuova Delhi', ['as'], '356', 3_287_263, 0.99, ['CN'], { [ARABICO]: 100 }, [IND]],
  ['PH', 'Filippine', 'Manila', ['as'], '608', 300_000, 0.75, [], { [FILIPPINE]: 100, [CINESE]: 90 }, [PAC]],
  ['TR', 'Turchia', 'Ankara', ['as', 'eu'], '792', 783_562, 0.97, ['GR'], { [NERO]: 100, [EGE]: 90, [MED]: 100 }, [ATL]],
  ['US', 'Stati Uniti', 'Washington', ['na'], '840', 9_826_675, 1, ['CA', 'MX'], { [ATL]: 100, [PAC]: 77, [CARAIBI]: 10 }, [ART]],
  ['CA', 'Canada', 'Ottawa', ['na'], '124', 9_984_670, 0.92, ['US'], { [ART]: 100, [ATL]: 18, [PAC]: 17 }],
  ['MX', 'Messico', 'Città del Messico', ['na'], '484', 1_964_375, 0.88, ['US'], { [PAC]: 100, [CARAIBI]: 100 }, [ATL]],
  ['BR', 'Brasile', 'Brasilia', ['sa'], '076', 8_515_767, 0.95, ['AR', 'PE', 'CO'], { [ATL]: 100 }],
  ['AR', 'Argentina', 'Buenos Aires', ['sa'], '032', 2_780_400, 0.9, ['BR', 'CL'], { [ATL]: 100 }, [PAC]],
  ['CL', 'Cile', 'Santiago del Cile', ['sa'], '152', 756_102, 0.85, ['AR', 'PE'], { [PAC]: 100, [ATL]: 11 }],
  ['PE', 'Perù', 'Lima', ['sa'], '604', 1_285_216, 0.8, ['BR', 'CL', 'CO'], { [PAC]: 100 }],
  ['CO', 'Colombia', 'Bogotà', ['sa'], '170', 1_141_748, 0.83, ['BR', 'PE'], { [CARAIBI]: 100, [PAC]: 100 }, [ATL]],
  ['AU', 'Australia', 'Canberra', ['oc'], '036', 7_692_024, 0.92, ['NZ'], { [IND]: 100, [TASMAN]: 80 }, [PAC]],
  ['NZ', 'Nuova Zelanda', 'Wellington', ['oc'], '554', 268_021, 0.8, ['AU'], { [TASMAN]: 100, [PAC]: 100 }],
  ['FJ', 'Figi', 'Suva', ['oc'], '242', 18_274, 0.5, [], { [PAC]: 100 }],
]

const acqua = (id: string, n: string, t: AcquaQuiz['t'], f: number, bb: AcquaQuiz['bb'], p?: string): AcquaQuiz => ({
  id,
  n,
  t,
  f,
  bb,
  ...(p ? { p } : {}),
})

const ACQUE: AcquaQuiz[] = [
  acqua(ATL, 'Oceano Atlantico', 'oceano', 1, [-98, -60, 20, 70]),
  acqua(PAC, 'Oceano Pacifico', 'oceano', 0.99, [-180, -60, 180, 66]),
  acqua(IND, 'Oceano Indiano', 'oceano', 0.97, [20, -60, 147, 30]),
  acqua(ART, 'Oceano Artico', 'oceano', 0.95, [-180, 66, 180, 90]),
  acqua(ANT, 'Oceano Antartico', 'oceano', 0.9, [-180, -85, 180, -60]),
  acqua(MED, 'Mar Mediterraneo', 'mare', 0.96, [-6, 30, 36, 46], ATL),
  acqua(TIR, 'Mar Tirreno', 'mare', 0.8, [9, 37.5, 16, 44], MED),
  acqua(ADR, 'Mare Adriatico', 'mare', 0.82, [12, 39.8, 20, 45.8], MED),
  acqua(EGE, 'Mar Egeo', 'mare', 0.78, [22.5, 35, 28.5, 41], MED),
  acqua(NORD, 'Mare del Nord', 'mare', 0.85, [-4, 51, 9, 61], ATL),
  acqua(BALT, 'Mar Baltico', 'mare', 0.84, [9, 53.5, 30, 66], ATL),
  acqua(ROSSO, 'Mar Rosso', 'mare', 0.83, [32, 12, 44, 30], IND),
  acqua(CINESE, 'Mar Cinese Meridionale', 'mare', 0.75, [99, -3, 121, 25], PAC),
  acqua(GIAPPONE, 'Mar del Giappone', 'mare', 0.74, [127, 33, 142, 52], PAC),
  acqua(FILIPPINE, 'Mare delle Filippine', 'mare', 0.6, [120, 5, 145, 35], PAC),
  acqua(BISCAGLIA, 'Golfo di Biscaglia', 'golfo', 0.7, [-10, 43, 0, 48.5], ATL),
  acqua(CARAIBI, 'Mare Caraibico', 'mare', 0.88, [-88, 9, -60, 22], ATL),
  acqua(NERO, 'Mar Nero', 'mare', 0.87, [27.5, 40.9, 41.8, 46.7], ATL),
  acqua(ARABICO, 'Mar Arabico', 'mare', 0.7, [51, 0, 77, 25], IND),
  acqua(TASMAN, 'Mar di Tasman', 'mare', 0.65, [147, -47, 173, -29], PAC),
]

const corso = (id: string, n: string, p: string[], f: number): CorsoQuiz => ({ id, n, p, f })

const FIUMI: CorsoQuiz[] = [
  corso('F1', 'Danubio', ['DE', 'AT', 'HR'], 1),
  corso('F2', 'Reno', ['CH', 'AT', 'DE', 'FR', 'NL'], 0.98),
  corso('F3', 'Senna', ['FR'], 0.95),
  corso('F4', 'Loira', ['FR'], 0.93),
  corso('F5', 'Tamigi', ['GB'], 0.94),
  corso('F6', 'Po', ['IT'], 0.9),
  corso('F7', 'Tevere', ['IT'], 0.89),
  corso('F8', 'Nilo', ['EG', 'KE'], 0.99),
  corso('F9', 'Rio delle Amazzoni', ['BR', 'PE', 'CO'], 0.99),
  corso('F10', 'Mississippi', ['US'], 0.97),
  corso('F11', 'Gange', ['IN'], 0.96),
  corso('F12', 'Fiume Azzurro', ['CN'], 0.95),
  corso('F13', 'Tago', ['ES', 'PT'], 0.85),
  corso('F14', 'Elba', ['DE'], 0.86),
  corso('F15', 'Vistola', ['PL'], 0.84),
  corso('F16', 'Paraná', ['AR', 'BR'], 0.8),
  corso('F17', 'Murray', ['AU'], 0.8),
  corso('F18', 'Niger', ['NG'], 0.9),
  corso('F19', 'Orange', ['ZA'], 0.75),
  corso('F20', 'San Lorenzo', ['US', 'CA'], 0.85),
  corso('F21', 'Rio Grande', ['US', 'MX'], 0.83),
  corso('F22', 'Ebro', ['ES'], 0.8),
  corso('F23', 'Rodano', ['CH', 'FR'], 0.88),
  corso('F24', 'Adige', ['IT'], 0.7),
  corso('F25', 'Arno', ['IT'], 0.72),
]

const LAGHI: CorsoQuiz[] = [
  corso('L1', 'lago di Garda', ['IT'], 0.9),
  corso('L2', 'lago di Como', ['IT'], 0.88),
  corso('L3', 'lago Maggiore', ['IT', 'CH'], 0.87),
  corso('L4', 'lago Lemano', ['CH', 'FR'], 0.9),
  corso('L5', 'lago di Costanza', ['DE', 'AT', 'CH'], 0.9),
  corso('L6', 'lago Vittoria', ['KE'], 0.97),
  corso('L7', 'Titicaca', ['PE'], 0.96),
  corso('L8', 'lago Superiore', ['US', 'CA'], 0.95),
  corso('L9', 'lago Ontario', ['US', 'CA'], 0.94),
  corso('L10', 'lago Michigan', ['US'], 0.93),
  corso('L11', 'lago Biwa', ['JP'], 0.7),
  corso('L12', 'Loch Ness', ['GB'], 0.85),
  corso('L13', 'Vänern', ['SE'], 0.8),
  corso('L14', 'lago Taupo', ['NZ'], 0.7),
  corso('L15', 'lago Eyre', ['AU'], 0.75),
  corso('L16', 'lago di Van', ['TR'], 0.8),
  corso('L17', 'lago Trasimeno', ['IT'], 0.6),
]

/** Le capitali sulla cartina: verosimili, e basta. */
const CAPITALI_QUI: Record<string, [number, number]> = {
  IT: [12.48, 41.89],
  FR: [2.35, 48.86],
  ES: [-3.7, 40.42],
  DE: [13.38, 52.52],
  AT: [16.37, 48.21],
  GR: [23.73, 37.98],
  GB: [-0.13, 51.51],
  EG: [31.24, 30.04],
  JP: [139.69, 35.69],
  US: [-77.04, 38.9],
  BR: [-47.88, -15.79],
  AU: [149.13, -35.28],
}

/**
 * I confinanti sicuri: tutti quelli di terra, tranne la Spagna per la Francia e
 * viceversa — un confine che la prova vuole "non principale", per vedere che
 * resti fuori dalle risposte di "con chi confina" ma anche dagli errori.
 */
const NON_PRINCIPALI = new Set(['FR-ES', 'ES-FR'])

function paese([id, n, cap, k, num, a, f, conf, bagna, vicine = []]: Riga): PaeseQuiz {
  const ordinate = Object.entries(bagna).sort((x, y) => y[1] - x[1])
  const cm = conf.filter((v) => !NON_PRINCIPALI.has(`${id}-${v}`))
  return {
    id,
    n,
    cap,
    k,
    num,
    a,
    f,
    conf,
    ...(cm.length > 0 ? { cm } : {}),
    ...(CAPITALI_QUI[id] ? { cc: CAPITALI_QUI[id] } : {}),
    // Senza mare: l'Austria e la Svizzera, che non hanno coste e non ne sfiorano.
    ...(id === 'AT' || id === 'CH' ? { ch: 1 as const } : {}),
    bagna: ordinate.map(([q]) => q),
    peso: ordinate.map(([, w]) => w),
    vicine,
  }
}

/** Le città: qualcuna d'Italia con la regione, e qualcuna nel mondo, con un nome ripetuto. */
const citta = (id: string, n: string, p: string, pt: [number, number], f: number, r?: [string, string]): CittaQuiz => ({
  id,
  n,
  p,
  pt,
  f,
  ...(r ? { r: r[0], rn: r[1] } : {}),
})
const LOMBARDIA: [string, string] = ['R1', 'Lombardia']
const LAZIO: [string, string] = ['R2', 'Lazio']
const CAMPANIA: [string, string] = ['R3', 'Campania']
const TOSCANA: [string, string] = ['R4', 'Toscana']
const PUGLIA: [string, string] = ['R5', 'Puglia']
const VALLE_D_AOSTA: [string, string] = ['R6', 'Valle d’Aosta']

export const CITTA: CittaQuiz[] = [
  citta('C1', 'Milano', 'IT', [9.19, 45.46], 0.97, LOMBARDIA),
  citta('C2', 'Bergamo', 'IT', [9.67, 45.69], 0.7, LOMBARDIA),
  citta('C3', 'Brescia', 'IT', [10.21, 45.54], 0.72, LOMBARDIA),
  citta('C4', 'Roma', 'IT', [12.48, 41.89], 0.99, LAZIO),
  citta('C5', 'Latina', 'IT', [12.9, 41.47], 0.5, LAZIO),
  citta('C6', 'Napoli', 'IT', [14.25, 40.85], 0.95, CAMPANIA),
  citta('C7', 'Salerno', 'IT', [14.77, 40.68], 0.66, CAMPANIA),
  citta('C8', 'Firenze', 'IT', [11.25, 43.77], 0.96, TOSCANA),
  citta('C9', 'Pisa', 'IT', [10.4, 43.72], 0.8, TOSCANA),
  citta('C10', 'Bari', 'IT', [16.87, 41.12], 0.78, PUGLIA),
  citta('C11', 'Lecce', 'IT', [18.17, 40.35], 0.64, PUGLIA),
  citta('C12', 'Parigi', 'FR', [2.35, 48.86], 1),
  citta('C13', 'Lione', 'FR', [4.84, 45.76], 0.85),
  citta('C14', 'Marsiglia', 'FR', [5.37, 43.3], 0.84),
  citta('C15', 'Berlino', 'DE', [13.38, 52.52], 0.98),
  citta('C16', 'Monaco di Baviera', 'DE', [11.58, 48.14], 0.9),
  citta('C17', 'Amburgo', 'DE', [9.99, 53.55], 0.88),
  citta('C18', 'Madrid', 'ES', [-3.7, 40.42], 0.97),
  citta('C19', 'Barcellona', 'ES', [2.17, 41.39], 0.96),
  citta('C20', 'Valencia', 'ES', [-0.38, 39.47], 0.83),
  citta('C21', 'Valencia', 'US', [-118.6, 34.4], 0.3),
  citta('C22', 'New York', 'US', [-74, 40.71], 1),
  citta('C23', 'Chicago', 'US', [-87.63, 41.88], 0.9),
  citta('C24', 'Los Angeles', 'US', [-118.24, 34.05], 0.95),
  citta('C25', 'Tokyo', 'JP', [139.69, 35.69], 0.99),
  citta('C26', 'Osaka', 'JP', [135.5, 34.69], 0.85),
  citta('C27', 'San Paolo', 'BR', [-46.63, -23.55], 0.93),
  citta('C28', 'Rio de Janeiro', 'BR', [-43.2, -22.9], 0.95),
  citta('C29', 'Sydney', 'AU', [151.2, -33.87], 0.94),
  citta('C30', 'Melbourne', 'AU', [144.96, -37.81], 0.9),
  citta('C31', 'Il Cairo', 'EG', [31.24, 30.04], 0.95),
  citta('C32', 'Alessandria', 'EG', [29.92, 31.2], 0.8),
  // Due nomi che dicono la risposta: lo stato, la regione.
  citta('C33', 'Città del Messico', 'MX', [-99.13, 19.43], 0.97),
  citta('C34', 'Aosta', 'IT', [7.32, 45.74], 0.6, VALLE_D_AOSTA),
]

export const MONDO: DatiQuiz = {
  versione: 'prova',
  paesi: PAESI.map(paese).map((p) => (p.id === 'AU' ? { ...p, trap: 'Sydney' } : p)),
  acque: ACQUE,
  // Fiumi e laghi sulla cartina: tutti con la linea, tranne l'Arno; il Trasimeno ha solo un punto.
  fiumi: FIUMI.map((f) => (f.n === 'Arno' ? f : { ...f, g: 1 as const })),
  laghi: LAGHI.map((l) =>
    l.n === 'lago Trasimeno' ? { ...l, pt: [12.1, 43.13] as [number, number] } : { ...l, g: 1 as const },
  ),
}

export const ID = { ATL, PAC, IND, ART, ANT, MED, TIR, ADR, NORD, BISCAGLIA, FILIPPINE }
