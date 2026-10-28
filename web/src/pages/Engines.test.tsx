// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { EnginesTable, engineAlive, sortEngines } from './Engines'
import type { Engine } from './Engines'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const e = (lane: string, pid_alive: boolean, status = pid_alive ? 'running' : 'dead'): Engine => ({ lane, owner: 'bay', status, pid_alive, last_event: 'stop', checked_at: new Date().toISOString() })

async function render(body: Parameters<typeof EnginesTable>[0]['body']) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<EnginesTable body={body} />) })
  return { el, root }
}

describe('engines', () => {
  it('sorts alive first, then by lane', () => {
    const out = sortEngines([e('zeta', true), e('beta', false), e('alpha', false), e('gamma', true)])
    expect(out.map((x) => x.lane)).toEqual(['gamma', 'zeta', 'alpha', 'beta'])
  })
  it('a live pid with a dead status is dead', () => {
    expect(engineAlive(e('x', true, 'stopped'))).toBe(false)
    expect(engineAlive(e('x', true))).toBe(true)
  })
  it('renders rows in that order with alive and dead pills', async () => {
    const { el, root } = await render({ engines: [e('b', false), e('a', true)] })
    const rows = [...el.querySelectorAll('[data-testid=engine-row]')]
    expect(rows.map((r) => r.getAttribute('data-lane'))).toEqual(['a', 'b'])
    expect(rows.map((r) => r.querySelector('[data-testid=engine-status]')?.textContent)).toEqual(['alive', 'dead'])
    await act(async () => root.unmount())
  })
  it('says the grant is missing for not_granted', async () => {
    const { el, root } = await render({ engines: [], error: 'not_granted' })
    expect(el.querySelector('[data-testid=engines-empty]')?.textContent).toContain('grant is missing')
    await act(async () => root.unmount())
  })
  it('says no engines reported for an empty list', async () => {
    const { el, root } = await render({ engines: [] })
    expect(el.querySelector('[data-testid=engines-empty]')?.textContent).toBe('No engines reported.')
    await act(async () => root.unmount())
  })
})
