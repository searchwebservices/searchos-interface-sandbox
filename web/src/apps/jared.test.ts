// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { JARED_PREFILL_EVENT, askJared, prefillOf } from './jared'

describe('askJared', () => {
  it('dispatches one window event per call with the text and a rising sequence', () => {
    const got: { text: string; n: number }[] = []
    const on = (e: Event) => { const p = prefillOf(e); if (p) got.push(p) }
    window.addEventListener(JARED_PREFILL_EVENT, on)
    askJared('Draft a reminder')
    askJared('Draft a reminder')
    window.removeEventListener(JARED_PREFILL_EVENT, on)
    expect(got.map((g) => g.text)).toEqual(['Draft a reminder', 'Draft a reminder'])
    expect(got[1].n).toBeGreaterThan(got[0].n)
  })
  it('ignores an event without a text', () => {
    expect(prefillOf(new Event(JARED_PREFILL_EVENT))).toBeNull()
  })
})
