// The Help state of Marvin's shell: whether the cheat sheet is open, which suggestions are pinned, and what a click
// does (go to the one chat and drop the prompt in the composer, unsent).
//
// Pins persist through the profile prefs that already exist (PUT /api/me/profile, key help_pins, scope device), so they
// belong to the person AND the device and follow through the stream to a second tab. localStorage is only the first
// paint cache and the fallback when a save fails.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { go } from '@/app/router'
import * as prefs from '@/lib/prefs'
import { effectivePrefs } from '@/lib/profile'
import type { ComposerFill } from '@/thread/Composer'
import type { CheatItem, CheatSection } from './cheatsheet.types'
import { allPrompts, findItem, placePrompt } from './fill'

export interface HelpApi {
  open: boolean
  setOpen: (v: boolean) => void
  sections: CheatSection[]
  // Pinned items in the order they were pinned, only the ones the cheat sheet still has.
  pinned: CheatItem[]
  isPinned: (id: string) => boolean
  togglePin: (id: string) => void
  // Close the sheet, go to the chat and put the prompt in the composer.
  use: (item: CheatItem) => void
}

export const HelpContext = createContext<HelpApi | null>(null)
export const useHelp = (): HelpApi | null => useContext(HelpContext)

// chatId: the one chat's lane id (null when there is none). onChat: the open route already is that chat.
export function useHelpState(sections: CheatSection[], chatId: string | null, onChat: boolean) {
  const { store, saveProfile, toast } = useApp()
  const person = store.me?.person ?? ''
  const eff = effectivePrefs(store.prefs, store.me?.device_id)
  const [open, setOpen] = useState(false)
  const [pins, setPins] = useState<string[]>([])
  const inflight = useRef(0)

  // First paint from this device's cache, then the profile wins (and a second tab follows through the stream).
  useEffect(() => {
    if (person) setPins(prefs.get<string[]>(prefs.keys.helpPins(person), []))
  }, [person])
  const served = eff.help_pins
  useEffect(() => {
    if (!person || !Array.isArray(served) || inflight.current > 0) return
    setPins(served)
    prefs.set(prefs.keys.helpPins(person), served)
  }, [served, person])

  const togglePin = useCallback(
    (id: string) => {
      const next = pins.includes(id) ? pins.filter((x) => x !== id) : pins.concat(id)
      setPins(next)
      if (person) prefs.set(prefs.keys.helpPins(person), next)
      inflight.current += 1
      void saveProfile({ prefs: { scope: 'device', values: { help_pins: next } } })
        .then((r) => {
          if (r.error) toast('Pin kept on this device only')
        })
        .finally(() => {
          inflight.current -= 1
        })
    },
    [pins, person, saveProfile, toast],
  )

  const [fill, setFill] = useState<ComposerFill | undefined>(undefined)
  const token = useRef(0)
  const known = useMemo(() => allPrompts(sections), [sections])
  const use = useCallback(
    (item: CheatItem) => {
      setOpen(false)
      if (!chatId) return
      token.current += 1
      setFill({ token: token.current, apply: (current) => placePrompt(current, item.prompt, known) })
      if (!onChat) go({ name: 'lane', id: chatId })
    },
    [chatId, onChat, known],
  )
  const onFilled = useCallback((t: number) => setFill((f) => (f && f.token === t ? undefined : f)), [])

  const pinned = useMemo(() => pins.map((id) => findItem(sections, id)).filter((i): i is CheatItem => !!i), [pins, sections])
  const api: HelpApi = useMemo(
    () => ({ open, setOpen, sections, pinned, isPinned: (id) => pins.includes(id), togglePin, use }),
    [open, sections, pinned, pins, togglePin, use],
  )
  return { api, fill, onFilled }
}

// "?" opens the cheat sheet when the keys are going nowhere: not in a field, not with a modifier, not over another dialog.
export function useHelpHotkey(open: boolean, setOpen: (v: boolean) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || open) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [open, setOpen])
}
