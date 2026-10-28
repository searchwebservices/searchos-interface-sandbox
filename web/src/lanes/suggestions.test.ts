import { describe, expect, it } from 'vitest'
import lanes from '../../../console/data/lanes.json'
import { LANE_EMPTY, emptyFor } from './suggestions'

describe('suggestions map', () => {
  it('covers every lane id in console/data/lanes.json with a purpose and 2 or 3 cards', () => {
    for (const l of lanes as { id: string }[]) {
      const e = LANE_EMPTY[l.id]
      expect(e, l.id).toBeDefined()
      expect(e.purpose.length, l.id).toBeGreaterThan(10)
      expect(e.suggestions.length, l.id).toBeGreaterThanOrEqual(2)
      expect(e.suggestions.length, l.id).toBeLessThanOrEqual(3)
    }
  })
  it('has no entry for a lane that does not exist', () => {
    const ids = new Set((lanes as { id: string }[]).map((l) => l.id))
    for (const k of Object.keys(LANE_EMPTY)) expect(ids.has(k), k).toBe(true)
  })
  it('an unknown lane falls back to a plain purpose with no cards', () => {
    expect(emptyFor('nope').suggestions).toEqual([])
  })
  it('uses the spec cards for hardware', () => {
    expect(LANE_EMPTY.hardware.suggestions).toEqual(['What changed on the LAN since yesterday', 'Link speed on the rack uplink', 'Backups: when was the last restore test'])
  })
})
