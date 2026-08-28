import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { MaybeRef } from 'vue'
import { unref } from 'vue'

export async function validateWithStandardSchema<Schema extends StandardSchemaV1>(
  schema: Schema,
  data: unknown,
): Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<Schema>>> {
  return await schema['~standard'].validate(data)
}

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (
    (typeof value !== 'object' && typeof value !== 'function')
    || value === null
    || !('~standard' in value)
  ) {
    return false
  }

  const standard = value['~standard']
  return typeof standard === 'object'
    && standard !== null
    && 'validate' in standard
    && typeof standard.validate === 'function'
    && 'vendor' in standard
    && typeof standard.vendor === 'string'
    && 'version' in standard
    && standard.version === 1
}

export function unwrapSchema<Schema extends StandardSchemaV1>(schema: MaybeRef<Schema>): Schema {
  const value = unref(schema)
  if (!isStandardSchema(value)) {
    throw new Error('The provided schema is not Standard Schema compliant')
  }
  return value as Schema
}
