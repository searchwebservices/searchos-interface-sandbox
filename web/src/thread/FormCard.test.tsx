// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FORM } from '@/lib/forms.fixture'
import type { FormItem } from '@/lib/types'
import { FormCard } from './FormCard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const item = (over: Partial<FormItem> = {}): FormItem => ({ id: 'i1', lane: 'hardware', at: '2026-10-26T10:00:00Z', role: 'form', form: FORM, state: 'pending', ...over })
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
})
const mount = async (node: React.ReactNode) => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(node))
  return el
}
const click = async (e: Element | null | undefined) => {
  expect(e).toBeTruthy()
  await act(async () => (e as HTMLElement).click())
}
const type = async (input: HTMLInputElement, v: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const button = (el: Element, label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === label)
const states = (el: Element) => [...el.querySelectorAll('[data-testid=form-stepper] li')].map((li) => li.getAttribute('data-state'))

describe('FormCard', () => {
  it('two pages: stepper, required check, a when-rule that opens page two, Back, one Submit with the visible answer', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ error: null })
    const el = await mount(<FormCard item={item()} canAnswer people={{}} onSubmit={onSubmit} onCancel={vi.fn()} />)
    expect(el.textContent).toContain('Welcome John')
    expect(states(el)).toEqual(['current']) // page two is not live yet: years only shows when Crestron is yes
    expect(button(el, 'Submit')).toBeTruthy()
    // required on page one
    await click(button(el, 'Submit'))
    expect(el.textContent).toContain('Required')
    expect(onSubmit).not.toHaveBeenCalled()
    await type(el.querySelector('input[type=text]') as HTMLInputElement, 'AV lead')
    // Crestron yes: page two becomes live, the button turns to Continue
    await click(el.querySelectorAll('[role=radio]')[0])
    expect(states(el)).toEqual(['current', 'todo'])
    await click(button(el, 'Continue'))
    expect(states(el)).toEqual(['done', 'current'])
    expect(el.textContent).toContain('Years?')
    expect(button(el, 'Back')).toBeTruthy()
    await click(button(el, 'Submit'))
    expect(el.textContent).toContain('Required')
    expect(onSubmit).not.toHaveBeenCalled()
    await type(el.querySelector('input[type=number]') as HTMLInputElement, '9')
    await click(button(el, 'Submit'))
    expect(onSubmit).toHaveBeenCalledWith({ role_title: 'AV lead', uses_crestron: true, years: 9 })
  })

  it('Cancel calls onCancel; a server failure shows under the card', async () => {
    const onCancel = vi.fn().mockResolvedValue({ error: 'Already answered elsewhere.' })
    const el = await mount(<FormCard item={item()} canAnswer people={{}} onSubmit={vi.fn()} onCancel={onCancel} />)
    await click(button(el, 'Cancel'))
    expect(onCancel).toHaveBeenCalled()
    expect(el.querySelector('[data-testid=form-error]')?.textContent).toBe('Already answered elsewhere.')
  })

  it('every field type renders its control: radio, select, checkboxes, yes/no, number, date, email, uri', async () => {
    const fields: FormItem['form']['fields'] = [
      { key: 'r', type: 'string', title: 'R', options: [{ value: 'a' }, { value: 'b' }] },
      { key: 's', type: 'string', title: 'S', options: Array.from({ length: 6 }, (_, i) => ({ value: 'o' + i })) },
      { key: 'm', type: 'multiselect', title: 'M', options: [{ value: 'x' }, { value: 'y' }] },
      { key: 'b', type: 'boolean', title: 'B' },
      { key: 'n', type: 'number', title: 'N' },
      { key: 'i', type: 'integer', title: 'I' },
      { key: 'd', type: 'string', title: 'D', format: 'date' },
      { key: 'dt', type: 'string', title: 'DT', format: 'date-time' },
      { key: 'e', type: 'string', title: 'E', format: 'email' },
      { key: 'u', type: 'string', title: 'U', format: 'uri' },
      { key: 'l', type: 'string', title: 'L', maxLength: 500 },
    ]
    const el = await mount(<FormCard item={item({ form: { id: 'f', title: 'All', fields, metadata: null } })} canAnswer people={{}} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(el.querySelector('[data-testid=form-stepper]')).toBeNull() // no metadata.pages, no stepper
    expect(el.querySelectorAll('[role=radiogroup]')).toHaveLength(2) // radio + boolean
    expect(el.querySelectorAll('[role=radio]')).toHaveLength(4)
    expect(el.querySelectorAll('[role=combobox]')).toHaveLength(1)
    expect(el.querySelectorAll('[role=checkbox]')).toHaveLength(2)
    expect(el.querySelectorAll('input[type=number]')).toHaveLength(2)
    expect(el.querySelector('input[type=date]')).toBeTruthy()
    expect(el.querySelector('input[type=datetime-local]')).toBeTruthy()
    expect(el.querySelector('input[type=email]')).toBeTruthy()
    expect(el.querySelector('input[type=url]')).toBeTruthy()
    expect(el.querySelector('textarea')).toBeTruthy()
    expect(button(el, 'Submit')).toBeTruthy()
  })

  it('settled: one quiet line, Answered by name N of N, or Cancelled', async () => {
    let el = await mount(<FormCard item={item({ state: 'answered', replied_by: { person: 'john' }, summary: { answered: 3, total: 3 } })} canAnswer people={{ john: 'John' }} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(el.querySelector('[data-testid=form-collapsed]')?.textContent).toContain('Answered by John, 3 of 3')
    expect(el.querySelector('form')).toBeNull()
    act(() => root?.unmount())
    el = await mount(<FormCard item={item({ state: 'cancelled' })} canAnswer people={{}} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(el.textContent).toContain('Cancelled')
  })

  it('a non-member sees the card waiting, with no controls', async () => {
    const el = await mount(<FormCard item={item()} canAnswer={false} people={{}} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(el.textContent).toContain('Waiting on a lane member')
    expect(el.querySelector('button')).toBeNull()
  })
})
