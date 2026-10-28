import { describe, expect, it } from 'vitest'
import { CHEATSHEET } from './cheatsheet'

// Pins are saved by item id and the server accepts [A-Za-z0-9_.:-]{1,64}, so ids must be unique and in that shape.
describe('the real cheat sheet', () => {
  const items = CHEATSHEET.flatMap((s) => s.items)
  it('has sections with items, each with a label and a prompt', () => {
    expect(CHEATSHEET.length).toBeGreaterThan(0)
    for (const s of CHEATSHEET) {
      expect(s.items.length, s.id).toBeGreaterThan(0)
      expect(s.title.trim(), s.id).not.toBe('')
    }
    for (const i of items) {
      expect(i.label.trim(), i.id).not.toBe('')
      expect(i.prompt.trim(), i.id).not.toBe('')
    }
  })
  it('has unique ids the server will accept', () => {
    const ids = [...CHEATSHEET.map((s) => s.id), ...items.map((i) => i.id)]
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(new Set(CHEATSHEET.map((s) => s.id)).size).toBe(CHEATSHEET.length)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/)
  })
  it('uses no em dash', () => {
    expect(JSON.stringify(CHEATSHEET)).not.toContain(String.fromCharCode(8212))
  })
})
