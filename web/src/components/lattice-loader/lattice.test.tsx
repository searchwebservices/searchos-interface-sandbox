// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { CROSS_ERROR, Loader, MAGNIFIER_DONE } from './index'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function render(status: 'working' | 'done' | 'error') {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<Loader status={status} showTimer={false} cellSize={6} />) })
  const span = el.querySelector('.lattice-loader') as HTMLElement
  const layer = el.querySelector('.lattice-loader__mark') as HTMLElement
  const on = [...layer.children].flatMap((c, i) => (c.hasAttribute('data-on') ? [i] : []))
  return { el, root, span, cells: layer.children.length, on }
}

describe('the Search working animation', () => {
  it('runs on a 4x4 grid and the done state lights exactly the magnifier mask', async () => {
    const r = await render('done')
    expect(r.cells).toBe(16)
    expect(r.span.style.getPropertyValue('--ll-n')).toBe('4')
    expect(r.on).toEqual(MAGNIFIER_DONE)
    // a ring in the top-left 3x3 with a dark centre, and the handle on the bottom-right diagonal
    expect(r.on).not.toContain(5)
    expect(r.on).toContain(15)
    expect(r.span.style.getPropertyValue('--ll-mark')).toBe('rgb(var(--g-mark))')
    await act(async () => r.root.unmount())
  })
  it('the error state keeps the cross in the danger token', async () => {
    const r = await render('error')
    expect(r.on).toEqual(CROSS_ERROR)
    expect(r.span.style.getPropertyValue('--ll-mark')).toBe('rgb(var(--g-danger))')
    await act(async () => r.root.unmount())
  })
  it('while working the run layer has a dark centre and no done mark yet', async () => {
    const r = await render('working')
    const holes = r.el.querySelectorAll('.lattice-loader__run [data-hole]')
    expect(holes.length).toBe(7)
    await act(async () => r.root.unmount())
  })
})
