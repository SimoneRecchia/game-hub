import { Route, Routes } from 'react-router-dom'
import { Splash } from './components/Splash'
import { useAuth } from './lib/auth'
import Hub from './pages/Hub'
import NotFound from './pages/NotFound'
import Placeholder from './pages/Placeholder'
import Profilo from './pages/Profilo'
import Welcome from './pages/Welcome'
import Wordle from './pages/Wordle'

export default function App() {
  const { player, checking } = useAuth()

  // Prima di sapere se la sessione salvata e' valida non mostriamo nulla:
  // meglio un istante di splash che far lampeggiare la schermata di accesso
  // a chi e' già dentro.
  if (checking && !player) return <Splash />

  // Nessuna rotta e' raggiungibile senza un giocatore: l'hub esiste per
  // tenere i punteggi, e senza nickname non ci sono punteggi da tenere.
  if (!player) return <Welcome />

  return (
    <Routes>
      <Route path="/" element={<Hub />} />
      <Route path="/wordle" element={<Wordle />} />
      <Route
        path="/classifica"
        element={
          <Placeholder title="Classifica" message="La classifica arriva nel prossimo passo." />
        }
      />
      <Route path="/profilo" element={<Profilo />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
