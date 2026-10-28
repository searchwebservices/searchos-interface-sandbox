import { useEffect, useState } from 'react'
import { MonitorIcon, MoonIcon, SunIcon, TypeIcon } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import * as prefs from '@/lib/prefs'
import type { ThemeChoice } from '@/lib/prefs'
import { effectivePrefs } from '@/lib/profile'
import { useApp } from './AppContext'

// Light, dark, system and the 100/115/130 text size, stored under the same keys as the /w console.
export function useThemeChoice() {
  const [theme, setTheme] = useState<ThemeChoice>(prefs.readTheme)
  const [zoom, setZoom] = useState<number>(prefs.readZoom)
  const { store, saveProfile } = useApp()
  // The profile (per person and device) decides once it is loaded; a change here is saved back to it for this device.
  const eff = effectivePrefs(store.prefs, store.me?.device_id)
  useEffect(() => {
    if (eff.theme) setTheme(eff.theme)
    if (eff.zoom) setZoom(eff.zoom / 100)
  }, [eff.theme, eff.zoom])
  const pick = (c: ThemeChoice) => {
    setTheme(c)
    void saveProfile({ prefs: { scope: 'device', values: { theme: c } } })
    try {
      localStorage.setItem(prefs.keys.theme, c)
    } catch {
      /* this page only */
    }
    prefs.applyTheme(c)
  }
  const pickZoom = (z: number) => {
    setZoom(z)
    void saveProfile({ prefs: { scope: 'device', values: { zoom: Math.round(z * 100) } } })
    try {
      localStorage.setItem(prefs.keys.zoom, String(z))
    } catch {
      /* this page only */
    }
    prefs.applyZoom(z)
  }
  return { theme, zoom, pick, pickZoom }
}

export function ThemeToggle() {
  const { theme, zoom, pick, pickZoom } = useThemeChoice()
  const Icon = theme === 'light' ? SunIcon : theme === 'dark' ? MoonIcon : MonitorIcon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={'Theme: ' + theme}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => pick('light')}>
          <SunIcon /> Light {theme === 'light' && '(on)'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pick('dark')}>
          <MoonIcon /> Dark {theme === 'dark' && '(on)'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pick('system')}>
          <MonitorIcon /> System {theme === 'system' && '(on)'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Text size</DropdownMenuLabel>
        {prefs.ZOOMS.map((z) => (
          <DropdownMenuItem key={z} onSelect={() => pickZoom(z)}>
            <TypeIcon /> {Math.round(z * 100)}% {zoom === z && '(on)'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
