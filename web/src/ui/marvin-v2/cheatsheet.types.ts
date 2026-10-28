// The shapes of the cheat sheet. The content lives in cheatsheet.ts and imports these; the Help UI only reads them.
export interface CheatItem {
  id: string
  // One line, what the suggestion is for.
  label: string
  // The text that lands in the composer. A placeholder like <ip> is selected after the click so it can be typed over.
  prompt: string
  // Optional one line on why this is worth asking.
  why?: string
  tags?: string[]
}

export interface CheatSection {
  id: string
  title: string
  blurb: string
  items: CheatItem[]
}
