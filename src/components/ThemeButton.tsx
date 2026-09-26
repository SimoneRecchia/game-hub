import { IconAuto, IconMoon, IconSun } from './Icons'
import { useTheme, type ThemePreference } from '@/lib/theme'
import { haptic } from '@/lib/haptics'
import './BottoneTondo.css'

const ORDER: ThemePreference[] = ['auto', 'light', 'dark']
const LABEL: Record<ThemePreference, string> = {
  auto: 'Tema automatico',
  light: 'Tema chiaro',
  dark: 'Tema scuro',
}

/** Ciclo auto → chiaro → scuro, come il selettore Aspetto di iOS. */
export function ThemeButton() {
  const { preference, setTheme } = useTheme()
  const Icon = preference === 'light' ? IconSun : preference === 'dark' ? IconMoon : IconAuto

  return (
    <button
      type="button"
      className="bottone-barra"
      title={LABEL[preference]}
      aria-label={LABEL[preference]}
      onClick={() => {
        haptic('tap')
        setTheme(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length])
      }}
    >
      <Icon size={20} />
    </button>
  )
}
