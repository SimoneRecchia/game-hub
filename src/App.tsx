import { Route, Routes } from 'react-router-dom'
import { Splash } from './components/Splash'
import { useAuth } from './lib/auth'
import { useHostEntry } from './lib/useHostEntry'
import Classifica from './pages/Classifica'
import Hub from './pages/Hub'
import NotFound from './pages/NotFound'
import Profilo from './pages/Profilo'
import VerifyEmail from './pages/VerifyEmail'
import Welcome from './pages/Welcome'
import Wordle from './pages/Wordle'
import WordleInsieme from './pages/WordleInsieme'
import { CoopGate } from './games/wordle/coop/CoopGate'

export default function App() {
  const { player, checking, config } = useAuth()

  // Arrivando da wordle.simonerecchia.com si entra direttamente nel gioco.
  useHostEntry()

  // Prima di sapere se la sessione salvata e' valida non mostriamo nulla:
  // meglio un istante di splash che far lampeggiare la schermata di accesso
  // a chi e' già dentro.
  if (checking && !player) return <Splash />

  // Nessuna rotta e' raggiungibile senza un giocatore: l'hub esiste per
  // tenere i punteggi, e senza nickname non ci sono punteggi da tenere.
  if (!player) return <Welcome />

  /*
   * Email da confermare: si mostra solo la schermata del codice. Il vincolo
   * vero e' lato server (requireVerified): questo evita di far vedere un hub
   * dove ogni cosa risponderebbe 403.
   */
  if (config?.emailVerificationRequired && !player.emailVerified) return <VerifyEmail />

  return (
    <>
      {/* L'avviso degli inviti vive fuori dalle rotte: deve poter comparire
          da qualunque schermata, non solo dall'hub. */}
      <CoopGate />
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="/wordle" element={<Wordle />} />
        <Route path="/insieme/:roomId" element={<WordleInsieme />} />
        <Route path="/classifica" element={<Classifica />} />
        <Route path="/profilo" element={<Profilo />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
