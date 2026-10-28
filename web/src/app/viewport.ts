// Phones: the app is as tall as the visual viewport, so the composer sits just above the on-screen keyboard instead of
// under it (iOS shrinks the visual viewport and leaves the layout viewport alone). --app-h and --app-top feed the shell.
import { useEffect, useState } from 'react'

const KEYBOARD_PX = 120

export function useAppViewport(enabled: boolean): { keyboard: boolean } {
  const [keyboard, setKeyboard] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement
    const vv = window.visualViewport
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight
      const top = vv ? vv.offsetTop : 0
      root.style.setProperty('--app-h', Math.round(h) + 'px')
      root.style.setProperty('--app-top', Math.round(top) + 'px')
      setKeyboard(window.innerHeight - h > KEYBOARD_PX)
    }
    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('resize', apply)
    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
      root.style.removeProperty('--app-h')
      root.style.removeProperty('--app-top')
    }
  }, [enabled])
  return { keyboard }
}
