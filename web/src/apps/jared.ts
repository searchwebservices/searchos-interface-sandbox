// "Ask Jared about this": any app page can hand the dock a draft. AppPage listens, opens the dock and passes the text to
// the composer; the person still presses send. One window event, so a tab deep inside a page does not need a prop chain.
export const JARED_PREFILL_EVENT = 'jared:prefill'

export interface JaredPrefill { text: string; n: number }

let seq = 0
export function askJared(text: string): void {
  seq += 1
  window.dispatchEvent(new CustomEvent<JaredPrefill>(JARED_PREFILL_EVENT, { detail: { text, n: seq } }))
}

export const prefillOf = (e: Event): JaredPrefill | null => {
  const d = (e as CustomEvent<JaredPrefill>).detail
  return d && typeof d.text === 'string' ? d : null
}
