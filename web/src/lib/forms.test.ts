import { describe, expect, it } from 'vitest'
import { answerOf, controlOf, fieldError, firstBadPage, isVisible, livePages, pageErrors, pagesOf, serverErrors, settledLine, stepperOf } from './forms'
import type { FormDef, FormItem } from './types'

import { FORM } from './forms.fixture'

describe('pages', () => {
  it('uses metadata.pages, appends a page for forgotten fields, and falls back to one page', () => {
    expect(pagesOf(FORM).map((p) => p.heading)).toEqual(['You', 'Skills'])
    const partial: FormDef = { ...FORM, metadata: { pages: [{ heading: 'A', keys: ['role_title'] }] } }
    const p = pagesOf(partial)
    expect(p).toHaveLength(2)
    expect(p[1]).toMatchObject({ heading: 'More', keys: ['uses_crestron', 'years'] })
    expect(pagesOf({ ...FORM, metadata: null })).toEqual([{ heading: '', intro: '', keys: ['role_title', 'uses_crestron', 'years'] }])
  })
})

describe('when rules', () => {
  const years = FORM.fields[2]
  it('eq needs the controlling answer to match, an unanswered field equals nothing', () => {
    expect(isVisible(years, {})).toBe(false)
    expect(isVisible(years, { uses_crestron: false })).toBe(false)
    expect(isVisible(years, { uses_crestron: true })).toBe(true)
  })
  it('neq holds while unanswered; hidden fields never show', () => {
    expect(isVisible({ key: 'k', type: 'string', when: [{ key: 'a', op: 'neq', value: 'x' }] }, {})).toBe(true)
    expect(isVisible({ key: 'k', type: 'string', when: [{ key: 'a', op: 'neq', value: 'x' }] }, { a: 'x' })).toBe(false)
    expect(isVisible({ key: 'k', type: 'string', hidden: true }, {})).toBe(false)
  })
  it('a page with only hidden-by-when fields is not live, so the stepper and Next skip it', () => {
    expect(livePages(FORM, {})).toEqual([0])
    expect(livePages(FORM, { uses_crestron: true })).toEqual([0, 1])
  })
  it('the answer carries only visible, answered fields', () => {
    expect(answerOf(FORM, { role_title: 'AV', uses_crestron: false, years: 9 })).toEqual({ role_title: 'AV', uses_crestron: false })
    expect(answerOf(FORM, { role_title: 'AV', uses_crestron: true, years: 9 })).toEqual({ role_title: 'AV', uses_crestron: true, years: 9 })
  })
})

describe('validation', () => {
  it('required is checked per page, only for visible fields', () => {
    expect(pageErrors(FORM, 0, {})).toEqual({ role_title: 'Required' })
    expect(pageErrors(FORM, 0, { role_title: 'x' })).toEqual({})
    expect(pageErrors(FORM, 1, {})).toEqual({}) // years is not visible
    expect(pageErrors(FORM, 1, { uses_crestron: true })).toEqual({ years: 'Required' })
  })
  it('submit looks at every live page and points at the first bad one', () => {
    expect(firstBadPage(FORM, { role_title: 'x', uses_crestron: true })).toBe(1)
    expect(firstBadPage(FORM, {})).toBe(0)
    expect(firstBadPage(FORM, { role_title: 'x', uses_crestron: true, years: 3 })).toBe(-1)
  })
  it('checks formats, lengths and ranges', () => {
    expect(fieldError({ key: 'e', type: 'string', format: 'email' }, 'nope')).toBe('Not a valid email')
    expect(fieldError({ key: 'e', type: 'string', format: 'email' }, 'a@b.co')).toBeNull()
    expect(fieldError({ key: 'u', type: 'string', format: 'uri' }, 'x y')).toBe('Not a valid link')
    expect(fieldError({ key: 's', type: 'string', minLength: 3 }, 'ab')).toBe('At least 3 characters')
    expect(fieldError({ key: 'i', type: 'integer' }, 1.5)).toBe('A whole number')
    expect(fieldError({ key: 'n', type: 'number', maximum: 10 }, 11)).toBe('At most 10')
    expect(fieldError({ key: 'm', type: 'multiselect', minItems: 2 }, ['a'])).toBe('Pick at least 2')
    expect(fieldError({ key: 'b', type: 'boolean', required: true }, false)).toBeNull() // false is an answer
  })
  it('server errors name the field and select its page', () => {
    const r = serverErrors(FORM, { years: 'is required' })
    expect(r.errors.years).toBe('Years? is required')
    expect(r.page).toBe(1)
  })
})

describe('controls', () => {
  const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: 'v' + i }))
  it('under six options is radio, six or more select, multiselect checkboxes', () => {
    expect(controlOf({ key: 'a', type: 'string', options: opts(5) })).toBe('radio')
    expect(controlOf({ key: 'a', type: 'string', options: opts(6) })).toBe('select')
    expect(controlOf({ key: 'a', type: 'multiselect', options: opts(2) })).toBe('multiselect')
    expect(controlOf({ key: 'a', type: 'boolean' })).toBe('boolean')
    expect(controlOf({ key: 'a', type: 'integer' })).toBe('number')
    expect(controlOf({ key: 'a', type: 'string', maxLength: 500 })).toBe('textarea')
    expect(controlOf({ key: 'a', type: 'string', format: 'date' })).toBe('text')
  })
})

describe('stepper', () => {
  it('numbers the live pages: earlier done, current, later todo', () => {
    const v = { uses_crestron: true }
    expect(stepperOf(FORM, v, 0).map((s) => s.state)).toEqual(['current', 'todo'])
    expect(stepperOf(FORM, v, 1).map((s) => s.state)).toEqual(['done', 'current'])
    expect(stepperOf(FORM, v, 1).map((s) => s.label)).toEqual(['You', 'Skills'])
    expect(stepperOf(FORM, {}, 0)).toHaveLength(1)
  })
})

describe('settled line', () => {
  const item = (over: Partial<FormItem>): FormItem => ({ id: 'i', lane: 'hardware', at: 'x', role: 'form', form: FORM, state: 'answered', ...over })
  it('says who and N of N, or Cancelled', () => {
    expect(settledLine(item({ replied_by: { person: 'john' }, summary: { answered: 3, total: 3 } }), { john: 'John' })).toBe('Answered by John, 3 of 3')
    expect(settledLine(item({ replied_by: { via: 'opencode' }, summary: { answered: 1, total: 1 } }), {})).toBe('Answered by OpenCode, 1 of 1')
    expect(settledLine(item({ state: 'cancelled', replied_by: { person: 'bay' } }), {})).toBe('Cancelled by bay')
    expect(settledLine(item({ state: 'cancelled' }), {})).toBe('Cancelled')
  })
})
