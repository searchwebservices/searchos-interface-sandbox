// Golden screenshots of every /v2 route as Marvin, light and dark, at 1280 and 390 wide. marvin-v1 changes only for
// fixes, never for layout, so any diff here is either a fix being reviewed or a layout change that belongs in a new
// variant. Update with: npx playwright test --update-snapshots (see e2e/goldens/marvin-v1/README.md).
//
// The device cookie comes from the throwaway console's dev bootstrap (CONSOLE_DEV=1, ?dev_as=marvin), a stand-in for
// Marvin's approved device. It proves the layout, not the device-approval flow, which console/test/smoke.sh covers.
import { expect, test } from '@playwright/test'

const ROUTES: { name: string; hash: string }[] = [
  { name: 'home', hash: '#/' },
  { name: 'lane-dm-marvin', hash: '#/lanes/dm-marvin' },
  { name: 'lane-hardware', hash: '#/lanes/hardware' },
  { name: 'devices', hash: '#/devices' },
  { name: 'lan', hash: '#/lan' },
  { name: 'health', hash: '#/health' },
  { name: 'library', hash: '#/library' },
  { name: 'profile', hash: '#/profile' },
]
const WIDTHS = [1280, 390]
const SCHEMES = ['light', 'dark'] as const

for (const scheme of SCHEMES) {
  for (const width of WIDTHS) {
    test.describe(`${scheme} ${width}`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height: width > 600 ? 800 : 844 }, reducedMotion: 'reduce' })

      for (const r of ROUTES) {
        test(`/v2 ${r.name}`, async ({ page }) => {
          // Mint the dev device cookie for Marvin, then open the route.
          await page.goto('/?dev_as=marvin')
          await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') })
          await page.goto('/v2/' + r.hash)
          await page.waitForLoadState('networkidle')
          await expect(page).toHaveScreenshot(`${r.name}-${scheme}-${width}.png`, {
            animations: 'disabled',
            maxDiffPixelRatio: 0.002,
            fullPage: false,
          })
        })
      }
    })
  }
}
