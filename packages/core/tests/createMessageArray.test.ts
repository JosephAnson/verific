import { describe, expect, it } from 'vitest'
import { createMessageArray } from '../src/utils/createMessageArray'

describe('createMessageArray', () => {
  it('normalises the documented false value to no messages', () => {
    expect(createMessageArray(false)).toEqual([])
  })

  it('discards unsupported runtime values', () => {
    expect(createMessageArray(true as never)).toEqual([])
    expect(createMessageArray(42 as never)).toEqual([])
    expect(createMessageArray([true, 'Visible'] as never)).toEqual(['Visible'])
  })
})
