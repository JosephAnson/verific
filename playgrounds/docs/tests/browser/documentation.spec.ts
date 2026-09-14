import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

async function expectNarrowPage(page: Page) {
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
}

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

    await expectNarrowPage(page)
  })
}

test('homepage and quickstart links reach the live form and controls guide by keyboard', async ({ page }) => {
  await page.goto('/')
  await expectNarrowPage(page)

  const firstForm = page.getByRole('link').filter({
    has: page.getByRole('heading', { name: 'Validate one form', exact: true }),
  })
  await firstForm.focus()
  await firstForm.press('Enter')

  await expect(page).toHaveURL(/\/guide\/#basic-validation-demo$/)
  await expect(page.getByRole('heading', { name: 'Try validation in the browser' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Validate account' })).toBeVisible()

  const nextPage = page.getByRole('navigation', { name: 'Pager' })
    .getByRole('link', { name: 'Next page Binding form controls' })
  await nextPage.focus()
  await nextPage.press('Enter')

  await expect(page).toHaveURL(/\/guide\/core\/form-controls\.html$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Binding form controls' })).toBeVisible()
  await expectNarrowPage(page)
})

test('factory references are discoverable from the API overview and mobile sidebar', async ({ page }) => {
  await page.goto('/guide/api.html')
  const overview = page.getByRole('main')
  for (const name of ['createVerific', 'createCatalogueMessages', 'vueI18nMessages', 'i18nextMessages', 'paraglideMessages']) {
    await expect(overview.getByRole('link', { name, exact: true })).toHaveAttribute('href', /reference\//)
  }

  const plugin = overview.getByRole('link', { name: 'createVerific', exact: true })
  await plugin.focus()
  await plugin.press('Enter')

  await expect(page).toHaveURL(/\/guide\/reference\/create-verific\.html$/)
  await expect(page.getByRole('heading', { level: 1, name: 'createVerific' })).toBeVisible()

  for (const reference of [
    { name: 'createCatalogueMessages', route: /\/reference\/catalogue-messages\.html$/ },
    { name: 'Locale adapter factories', route: /\/reference\/locale-adapters\.html$/ },
  ]) {
    const menu = page.getByRole('button', { name: 'Menu', exact: true })
    await menu.focus()
    await menu.press('Enter')
    await expect(menu).toHaveAttribute('aria-expanded', 'true')

    const link = page.getByRole('navigation', { name: 'Sidebar Navigation' })
      .getByRole('link', { name: reference.name, exact: true })
    await link.focus()
    await link.press('Enter')

    await expect(page).toHaveURL(reference.route)
    await expect(page.getByRole('heading', { level: 1, name: reference.name })).toBeVisible()
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
  }

  await expectNarrowPage(page)
})

test('troubleshooting links a visible symptom to its exact reference by keyboard', async ({ page }) => {
  await page.goto('/guide/api.html')
  const troubleshooting = page.getByRole('main').getByRole('link', { name: 'Troubleshooting guide' })
  await troubleshooting.focus()
  await troubleshooting.press('Enter')

  await expect(page).toHaveURL(/\/guide\/troubleshooting\.html$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Troubleshooting' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A nested error exists but my selector returns nothing' })).toBeVisible()
  await expectNarrowPage(page)

  const paths = page.getByRole('main').getByRole('link', { name: 'Paths and selectors', exact: true })
  await paths.focus()
  await paths.press('Enter')

  await expect(page).toHaveURL(/\/guide\/reference\/use-validation\.html#paths-and-selectors$/)
  await expect(page.getByRole('heading', { name: 'Paths and selectors' })).toBeInViewport()
  await expectNarrowPage(page)
})
