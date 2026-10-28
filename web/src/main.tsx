import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyFont, applyMotion, applyTheme, applyZoom, readFont, readMotion, readTheme, readZoom } from './lib/prefs'

// Theme and zoom before first paint: system follows the device, zoom is the root font size.
applyTheme(readTheme())
applyZoom(readZoom())
applyFont(readFont())
applyMotion(readMotion())
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (readTheme() === 'system') applyTheme('system')
})

// After a deploy the open page still references the previous build's chunk hashes. Vite raises
// vite:preloadError when a lazy chunk is gone; reload once to pick up the new index.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  let done = false
  try { done = sessionStorage.getItem('sov.reloaded') === '1'; if (!done) sessionStorage.setItem('sov.reloaded', '1') } catch { /* ignore */ }
  if (!done) window.location.reload()
})
try { if (sessionStorage.getItem('sov.reloaded') === '1') setTimeout(() => { try { sessionStorage.removeItem('sov.reloaded') } catch { /* ignore */ } }, 5000) } catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
