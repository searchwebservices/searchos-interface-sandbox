import { describe, expect, it } from 'vitest'
import { CARTERA } from './fixtures'
import { groupCartera, filterCartera, moneyOf, pageCount, pageOf, payKinds, todayMz } from './money'

const all = [...CARTERA.groups.activos, ...CARTERA.groups.desarrollo]
describe('money helpers', () => {
  it('formats MXN with thousands separators and marks USD', () => {
    expect(moneyOf(12500)).toBe('$12,500 MXN')
    expect(moneyOf(1234.5)).toBe('$1,234.50 MXN')
    expect(moneyOf(900, 'USD')).toBe('$900 USD')
    expect(moneyOf(null)).toBe('-')
  })
  it('reads today in America/Mazatlan', () => {
    expect(todayMz(Date.parse('2026-11-01T03:00:00Z'))).toBe('2026-10-31')
  })
  it('filters by bucket, semaphore and text', () => {
    expect(filterCartera(all, { bucket: 'desarrollo', semaphore: 'all', q: '' }).map((r) => r.id)).toEqual(['e5'])
    expect(filterCartera(all, { bucket: 'all', semaphore: 'rojo', q: '' }).map((r) => r.id)).toEqual(['e4', 'e5'])
    expect(filterCartera(all, { bucket: 'all', semaphore: 'all', q: 'transfer' }).map((r) => r.id)).toEqual(['e1'])
  })
  it('pages 50 at a time', () => {
    const rows = Array.from({ length: 120 }, (_, i) => i)
    expect(pageOf(rows, 0)).toHaveLength(50)
    expect(pageOf(rows, 2)).toHaveLength(20)
    expect(pageCount(120)).toBe(3)
  })
  it('offers only the payments still open', () => {
    const e2 = all.find((r) => r.id === 'e2')!
    expect(payKinds(e2)).toEqual([{ kind: 'monthly', amount: 12500 }, { kind: 'build_final', amount: 15000 }])
    expect(payKinds(all.find((r) => r.id === 'e1')!)).toEqual([])
    expect(payKinds(all.find((r) => r.id === 'e5')!)).toEqual([{ kind: 'build_deposit', amount: 5000 }])
  })
})

describe('groupCartera', () => {
  const F = { bucket: 'all', semaphore: 'all' as const, q: '' }
  const r = (id: string, bucket: string) => ({ ...CARTERA.groups.activos[0], id, bucket, company_name: id })
  it('orders activos, desarrollo, cerrado, then any other bucket by its own name; cerrado starts collapsed', () => {
    const g = groupCartera({ activos: [r('a', 'activos')], desarrollo: [], cerrado: [r('c', 'cerrado')], pausa: [r('p', 'pausa')] }, F)
    expect(g.map((x) => [x.key, x.label, x.collapsed])).toEqual([['activos', 'Activos', false], ['desarrollo', 'Desarrollo', false], ['cerrado', 'Cerrados', true], ['pausa', 'Pausa', false]])
  })
  it('hides empty cerrado and other buckets but never merges cerrado into desarrollo', () => {
    const g = groupCartera({ activos: [], desarrollo: [r('d', 'desarrollo')], cerrado: [] }, F)
    expect(g.map((x) => x.key)).toEqual(['activos', 'desarrollo'])
    const h = groupCartera({ activos: [], desarrollo: [r('d', 'desarrollo')], cerrado: [r('c', 'cerrado')] }, F)
    expect(h.find((x) => x.key === 'desarrollo')!.rows.map((x) => x.id)).toEqual(['d'])
    expect(h.find((x) => x.key === 'cerrado')!.rows.map((x) => x.id)).toEqual(['c'])
  })
})
