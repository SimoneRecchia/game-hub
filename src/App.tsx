import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ROTTE } from './app/rotte'
import { Shell } from './components/Shell'
import { Splash } from './components/Splash'
import { useAuth } from './lib/auth'
import { PresenzaProvider } from './lib/presenza'
import { CoopGate } from './games/wordle/coop/CoopGate'
import { BattagliaGate } from './games/battaglia/BattagliaGate'
import { QuizGate } from './games/quiz/sfida/QuizGate'
import { IndovinaGate } from './games/indovina/IndovinaGate'
import Home from './pages/Home'
import Gioco from './pages/Gioco'
import Classifica from './pages/Classifica'
import Profilo from './pages/Profilo'
import NotFound from './pages/NotFound'
import VerifyEmail from './pages/VerifyEmail'
import Welcome from './pages/Welcome'
import Wordle from './pages/Wordle'
import WordleLibero from './pages/WordleLibero'
import WordleInsieme from './pages/WordleInsieme'
import Scarabeo from './pages/Scarabeo'
import ScarabeoLibero from './pages/ScarabeoLibero'
import Cruciverba from './pages/Cruciverba'
import CruciverbaLibero from './pages/CruciverbaLibero'
import Sudoku from './pages/Sudoku'
import SudokuLibero from './pages/SudokuLibero'
import BattagliaClassificata from './pages/BattagliaClassificata'
import BattagliaLibera from './pages/BattagliaLibera'
import BattagliaPartita from './pages/BattagliaPartita'
import BattagliaInvito from './pages/BattagliaInvito'
import Quiz from './pages/Quiz'
import QuizLibero from './pages/QuizLibero'
import QuizDuello from './pages/QuizDuello'
import QuizInvito from './pages/QuizInvito'
import IndovinaChi from './pages/IndovinaChi'
import IndovinaPartita from './pages/IndovinaPartita'
import IndovinaInvito from './pages/IndovinaInvito'
import IndovinaSet from './pages/IndovinaSet'

/** Un invito col link aperto da chi non ha ancora un account: la registrazione lo sa. */
const INVITO = /^\/(?:battaglia-navale\/invito|quiz\/sfida|indovina-chi\/invito)\/([a-z0-9]+)\/?$/

export default function App() {
  const { player, checking, config } = useAuth()
  const { pathname } = useLocation()

  // Prima di sapere se la sessione salvata e' valida non mostriamo nulla:
  // meglio un istante di splash che far lampeggiare la schermata di accesso
  // a chi e' già dentro.
  if (checking && !player) return <Splash />

  /*
   * Nessuna rotta e' raggiungibile senza un giocatore: l'app esiste per tenere
   * i punteggi. L'indirizzo pero' resta quello aperto — per esempio un invito a
   * una battaglia — e dopo l'accesso o la registrazione si arriva lì.
   */
  const invito = INVITO.exec(pathname)?.[1] ?? null
  if (!player) return <Welcome invito={invito} />

  /*
   * Email da confermare: si mostra solo la schermata del codice. Il vincolo
   * vero e' lato server (requireVerified): questo evita di far vedere un'app
   * dove ogni cosa risponderebbe 403.
   */
  if (config?.emailVerificationRequired && !player.emailVerified) return <VerifyEmail invito={invito} />

  return (
    <PresenzaProvider>
      {/* Gli avvisi degli inviti vivono fuori dalle rotte: devono poter
          comparire da qualunque schermata. Leggono lo stesso giro di
          controllo, che fa anche da presenza. */}
      <CoopGate />
      <BattagliaGate />
      <QuizGate />
      <IndovinaGate />
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/classifica" element={<Classifica />} />
          <Route path="/classifica/:gioco" element={<Classifica />} />
          <Route path="/profilo" element={<Profilo />} />

          <Route path="/wordle/classificata" element={<Wordle />} />
          <Route path="/wordle/libera" element={<WordleLibero />} />
          <Route path="/wordle/insieme/:roomId" element={<WordleInsieme />} />

          <Route path="/scarabeo/classificata" element={<Scarabeo />} />
          <Route path="/scarabeo/libera" element={<ScarabeoLibero />} />

          <Route path="/cruciverba/classificata" element={<Cruciverba />} />
          <Route path="/cruciverba/libera" element={<CruciverbaLibero />} />
          <Route path="/cruciverba/libera/:id" element={<Cruciverba />} />

          <Route path="/sudoku/classificata" element={<Sudoku />} />
          <Route path="/sudoku/libera" element={<SudokuLibero />} />

          <Route path="/battaglia-navale/classificata" element={<BattagliaClassificata />} />
          <Route path="/battaglia-navale/libera" element={<BattagliaLibera />} />
          <Route path="/battaglia-navale/partita/:id" element={<BattagliaPartita />} />
          <Route path="/battaglia-navale/invito/:codice" element={<BattagliaInvito />} />

          <Route path="/quiz/classificata" element={<Quiz />} />
          <Route path="/quiz/libera" element={<QuizLibero />} />
          <Route path="/quiz/duello/:id" element={<QuizDuello />} />
          <Route path="/quiz/sfida/:codice" element={<QuizInvito />} />

          <Route path="/indovina-chi" element={<IndovinaChi />} />
          <Route path="/indovina-chi/partita/:id" element={<IndovinaPartita />} />
          <Route path="/indovina-chi/invito/:codice" element={<IndovinaInvito />} />
          <Route path="/indovina-chi/set/:id" element={<IndovinaSet />} />

          {/* La pagina di ogni gioco: /wordle, /scarabeo, /cruciverba, /battaglia-navale, /quiz. */}
          <Route path="/:gioco" element={<Gioco />} />

          {/* I vecchi indirizzi, perché i link salvati e le icone sulla Home non si rompano. */}
          <Route path="/insieme/:roomId" element={<Vecchio verso={(p) => ROTTE.insieme(p.roomId ?? '')} />} />
          <Route path="/battaglia" element={<Navigate to={ROTTE.gioco('battaglia')} replace />} />
          <Route path="/battaglia/:id" element={<Vecchio verso={(p) => ROTTE.partitaBattaglia(p.id ?? '')} />} />
          {/* Le cinque parole di prima: ora la classificata e' una parola sola. */}
          <Route path="/wordle/classificata/:slot" element={<Navigate to={ROTTE.classificata('wordle')} replace />} />
          <Route path="/wordle/:slot" element={<Navigate to={ROTTE.classificata('wordle')} replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </PresenzaProvider>
  )
}

/** Un indirizzo di prima, che porta a quello di adesso. */
function Vecchio({ verso }: { verso: (parametri: Readonly<Record<string, string | undefined>>) => string }) {
  const parametri = useParams()
  return <Navigate to={verso(parametri)} replace />
}
