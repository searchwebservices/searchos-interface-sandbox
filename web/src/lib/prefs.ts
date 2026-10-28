// localStorage behind try/catch. The page works with it blocked or full; the server stays the source of truth.
export function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
export function set(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
export function del(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

// Same keys as the /w console where they exist, so a device keeps its drafts and read marks.
export const keys = {
  read: (person: string) => 'sov.read.v1.' + person,
  draft: (person: string, lane: string) => 'sov.draft.v1.' + person + '.' + lane,
  dockDefaults: (person: string, lane: string) => 'sov.dock.defaults.v1.' + person + '.' + lane,
  pinned: (person: string) => 'sov.pinned.v1.' + person,
  rail: (person: string) => 'sov.rail.v1.' + person,
  railOrder: (person: string) => 'sov.rail.order.v1.' + person,
  dock: (person: string, lane: string) => 'sov.dock.v1.' + person + '.' + lane,
  theme: 'sov.theme',
  zoom: 'sov.zoom',
  font: 'sov.font',
  motion: 'sov.motion',
  sidebar: 'sov.v2.sidebar',
  filesView: 'sov.files.view',
  // Marvin's pinned cheat sheet suggestions: first paint cache, the profile prefs (per person and device) are the source.
  helpPins: (person: string) => 'sov.help.pins.v1.' + person,
  // The LAN page: lenses and node spacing, per person on this device.
  lan: (person: string) => 'sov.lan.v1.' + person,
}

export type ThemeChoice = 'light' | 'dark' | 'system'
export const ZOOMS = [1, 1.15, 1.3] as const
export const ZOOM_DEFAULT = 1.15

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(keys.theme)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}
export function readZoom(): number {
  try {
    const v = parseFloat(localStorage.getItem(keys.zoom) ?? '')
    return (ZOOMS as readonly number[]).includes(v) ? v : ZOOM_DEFAULT
  } catch {
    return ZOOM_DEFAULT
  }
}

// Applies the stored theme and zoom to the document. Called before first paint and by the toggle.
export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  // The browser chrome and the home-screen status bar follow the paper token of the active theme.
  try {
    const meta = document.querySelector('meta[name="theme-color"]')
    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--g-paper').trim()
    if (meta && rgb) meta.setAttribute('content', 'rgb(' + rgb.split(/\s+/).join(',') + ')')
  } catch { /* no document styles (tests) */ }
}
export function applyZoom(zoom: number): void {
  // Zoom is the root font size: every rem in the tree follows it.
  document.documentElement.style.fontSize = Math.round(zoom * 100) + '%'
}

export type FilesView = 'grid' | 'list'
// The Lane files and Library view, per device. Grid unless the device chose the list.
export function readFilesView(): FilesView {
  return get<string>(keys.filesView, 'grid') === 'list' ? 'list' : 'grid'
}
export function writeFilesView(v: FilesView): void {
  set(keys.filesView, v)
}

// Font choice and reduced motion: cached here for first paint, the profile (per person and device) is the source of truth.
export type FontKey = 'system' | 'montserrat' | 'space-grotesk'
export const FONTS: readonly FontKey[] = ['system', 'montserrat', 'space-grotesk']
export const FONT_DEFAULT: FontKey = 'montserrat'
export function readFont(): FontKey {
  const v = get<string>(keys.font, FONT_DEFAULT)
  return (FONTS as readonly string[]).includes(v) ? (v as FontKey) : FONT_DEFAULT
}
export function applyFont(font: FontKey): void {
  document.documentElement.dataset.font = font
}
// 'reduce' or 'allow' when the person chose, '' to follow the operating system.
export type MotionKey = 'reduce' | 'allow' | ''
export function readMotion(): MotionKey {
  const v = get<string>(keys.motion, '')
  return v === 'reduce' || v === 'allow' ? v : ''
}
export function applyMotion(m: MotionKey): void {
  if (m) document.documentElement.dataset.motion = m
  else delete document.documentElement.dataset.motion
}
