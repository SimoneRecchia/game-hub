import { Route, Routes } from 'react-router-dom'
import Hub from './pages/Hub'
import NotFound from './pages/NotFound'
import Placeholder from './pages/Placeholder'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Hub />} />
      <Route
        path="/wordle"
        element={<Placeholder title="Wordle" message="Il gioco arriva nel prossimo passo." />}
      />
      <Route
        path="/classifica"
        element={
          <Placeholder title="Classifica" message="La classifica arriva nel prossimo passo." />
        }
      />
      <Route
        path="/profilo"
        element={<Placeholder title="Profilo" message="Il profilo arriva nel prossimo passo." />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
