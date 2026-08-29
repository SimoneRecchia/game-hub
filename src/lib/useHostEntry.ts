import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { routeForHost } from '@shared/hosts'

/**
 * Entra direttamente nel gioco quando si arriva dal suo sottodominio.
 *
 * `wordle.simonerecchia.com` apre il Wordle, `giochi.simonerecchia.com` apre
 * l'hub: è lo stesso sito, cambia solo la schermata da cui si entra.
 *
 * Scatta **una volta sola**, al primo caricamento. Se scattasse a ogni
 * passaggio su `/`, toccare "Giochi" nella tab bar da un sottodominio di gioco
 * rimbalzerebbe subito indietro, e l'hub diventerebbe irraggiungibile.
 */
export function useHostEntry() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true

    if (pathname !== '/') return
    const route = routeForHost(window.location.hostname)
    if (route) navigate(route, { replace: true })
  }, [navigate, pathname])
}
