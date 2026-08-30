import { expect, test } from '@playwright/test'

test('keyboard submission focuses the first invalid named control with a visible outline', async ({ page }) => {
  await page.goto('/guide/core/advanced-schemas.html')

  const displayName = page.getByRole('textbox', { name: 'Display name' })
  const submit = page.getByRole('button', { name: 'Validate advanced form' })

  await displayName.fill('')
  await submit.focus()
  await submit.press('Enter')

  await expect(displayName).toHaveAttribute('aria-invalid', 'true')
  await expect(displayName).toBeFocused()

  const outline = await displayName.evaluate((control) => {
    const styles = getComputedStyle(control)
    return {
      colour: styles.outlineColor,
      style: styles.outlineStyle,
      width: Number.parseFloat(styles.outlineWidth),
    }
  })

  expect(outline.style).not.toBe('none')
  expect(outline.width).toBeGreaterThan(0)
  expect(outline.colour).not.toBe('transparent')
  expect(outline.colour).not.toBe('rgba(0, 0, 0, 0)')
})

const narrowExamples = [
  {
    name: 'basic',
    path: '/guide/',
    submitName: 'Validate account',
  },
  {
    name: 'form controls',
    path: '/guide/core/form-controls.html',
    submitName: 'Validate preferences',
  },
  {
    name: 'advanced',
    path: '/guide/core/advanced-schemas.html',
    submitName: 'Validate advanced form',
  },
] as const

for (const example of narrowExamples) {
  test(`${example.name} example fits a 320-pixel viewport`, async ({ page }) => {
    await page.goto(example.path)
    await expect(page.getByRole('button', { name: example.submitName })).toBeVisible()

    const layout = await page.evaluate(async () => {
      await document.fonts.ready

      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        viewportWidth: window.innerWidth,
      }
    })

    expect(layout.viewportWidth).toBe(320)
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
  })
}
