import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { App } from 'vue'
import type { IssueNormaliser, RegistrationResult, ValidationController, ValidationData } from '../src/main'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { createApp, defineComponent } from 'vue'
import { useValidation } from '../src/main'
import { loadValibot, loadZod, valibotVersion, zodVersion } from './fixtures/pinnedValidators'

const mountedApps: App[] = []

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
})

const describePasswordMismatch: IssueNormaliser = ({ raw }) => {
  const vendorIssue = raw as unknown as {
    code?: string
    message?: string
    params?: { rule?: string }
    type?: string
  }

  if (
    (vendorIssue.code === 'custom' && vendorIssue.params?.rule === 'passwordMismatch')
    || (vendorIssue.type === 'partial_check' && vendorIssue.message === 'Passwords must match')
  ) {
    return { identifier: 'passwordMismatch', values: {} }
  }
}

describe('advanced Standard Schema vendor behaviour', () => {
  it('preserves a Zod custom issue and its explicit cross-field path', async () => {
    expect(zodVersion).toBe('4.5.4')
    const z = await loadZod()
    const schema = z.object({
      password: z.string(),
      confirmation: z.string(),
    }).superRefine((
      value: { password: string, confirmation: string },
      context: { addIssue: (issue: Record<string, unknown>) => void },
    ) => {
      if (value.password !== value.confirmation) {
        context.addIssue({
          code: 'custom',
          message: 'Passwords must match',
          params: { rule: 'passwordMismatch' },
          path: ['confirmation'],
        })
      }
    })
    const validation = mountValidation(schema, {
      password: 'correct horse',
      confirmation: 'wrong battery',
    })

    await validation.validate()

    const issue = validation.issuesFor('confirmation')[0]!
    expect(issue.vendor).toBe('zod')
    expect(issue.localPath).toEqual(['confirmation'])
    expect(issue.semantic).toEqual({ identifier: 'passwordMismatch', values: {} })
    expect(issue.raw).toMatchObject({
      code: 'custom',
      message: 'Passwords must match',
      params: { rule: 'passwordMismatch' },
      path: ['confirmation'],
    })
  })

  it('normalises Valibot forwarding while retaining its structured path items', async () => {
    expect(valibotVersion).toBe('1.4.2')
    const v = await loadValibot()
    const schema = v.pipe(
      v.object({
        password: v.string(),
        confirmation: v.string(),
      }),
      v.forward(
        v.partialCheck(
          [['password'], ['confirmation']],
          (value: { password: string, confirmation: string }) => value.password === value.confirmation,
          'Passwords must match',
        ),
        ['confirmation'],
      ),
    )
    const validation = mountValidation(schema, {
      password: 'correct horse',
      confirmation: 'wrong battery',
    })

    await validation.validate()

    const issue = validation.issuesFor('confirmation')[0]!
    expect(issue.vendor).toBe('valibot')
    expect(issue.localPath).toEqual(['confirmation'])
    expect(issue.semantic).toEqual({ identifier: 'passwordMismatch', values: {} })
    expect(issue.raw).toMatchObject({
      type: 'partial_check',
      message: 'Passwords must match',
      path: [expect.objectContaining({ key: 'confirmation' })],
    })
  })

  it('types transformed output and commits it only after full validation', async () => {
    interface Input { quantity: string }
    interface Output { quantity: number }

    const z = await loadZod()
    const runtimeSchema = z.object({
      quantity: z.string(),
    }).transform((value: Input) => ({ quantity: Number(value.quantity) }))
    const schema = runtimeSchema as unknown as StandardSchemaV1<Input, Output>
    const raw: Input = { quantity: '42' }
    const validation = mountValidation(schema, raw)

    expectTypeOf(validation.result.value).toEqualTypeOf<RegistrationResult<Output>>()

    await validation.validateAt('quantity')
    expect(validation.result.value).toEqual({ status: 'idle' })

    await validation.validate()
    expect(validation.result.value).toEqual({ status: 'valid', value: { quantity: 42 } })
    expect(raw).toEqual({ quantity: '42' })
  })
})

function mountValidation<Schema extends StandardSchemaV1>(
  schema: Schema,
  model: ValidationData<Schema>,
): ValidationController<Schema> {
  let validation!: ValidationController<Schema>
  const app = createApp(defineComponent({
    setup() {
      validation = useValidation(schema, model, {
        describeIssue: describePasswordMismatch,
      })
      return () => null
    },
  }))
  app.mount(document.createElement('div'))
  mountedApps.push(app)
  return validation
}
