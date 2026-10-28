import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VARIANT, VARIANTS, resetVariantLog, resolveVariant } from './variants'
import { MarvinV1Shell } from './marvin-v1'
import { BayV1Shell } from './bay-v1'
import { MarvinV2Shell } from './marvin-v2'

describe('resolveVariant', () => {
  beforeEach(() => resetVariantLog())

  it('returns the registered shell for a known id', () => {
    expect(resolveVariant('marvin-v1')).toBe(MarvinV1Shell)
    expect(resolveVariant('bay-v1')).toBe(BayV1Shell)
    expect(resolveVariant('marvin-v2')).toBe(MarvinV2Shell)
  })

  it('treats a missing id as marvin-v1 without logging', () => {
    const log = vi.fn()
    expect(resolveVariant(undefined, log)).toBe(MarvinV1Shell)
    expect(resolveVariant(null, log)).toBe(MarvinV1Shell)
    expect(resolveVariant('', log)).toBe(MarvinV1Shell)
    expect(log).not.toHaveBeenCalled()
  })

  it('falls back to marvin-v1 for an unknown id and logs once per id', () => {
    const log = vi.fn()
    expect(resolveVariant('dani-v1', log)).toBe(MarvinV1Shell)
    expect(resolveVariant('dani-v1', log)).toBe(MarvinV1Shell)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('dani-v1')
    resolveVariant('borja-v1', log)
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('keeps the default in the registry and bay-v1 as its own shell', () => {
    expect(VARIANTS[DEFAULT_VARIANT]).toBe(MarvinV1Shell)
    expect(BayV1Shell).not.toBe(MarvinV1Shell)
    expect(Object.keys(VARIANTS).sort()).toEqual(['bay-v1', 'marvin-v1', 'marvin-v2'])
  })
})
