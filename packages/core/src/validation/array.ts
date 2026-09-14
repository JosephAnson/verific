import type { Ref } from 'vue'
import { isReadonly } from 'vue'

export interface ValidationArray<Item> {
  insert: (index: number, item: Item) => void
  remove: (index: number) => void
  move: (from: number, to: number) => void
}

export function createArrayHelpers<Item>(
  items: Ref<Item[]>,
  prepare: () => void,
  remap: (order: readonly (number | null)[], updateModel: () => void) => void,
): ValidationArray<Item> {
  function check(index: number, maximum: number): void {
    if (!Number.isInteger(index) || index < 0 || index > maximum)
      throw new RangeError('Array index is out of bounds')
  }

  function update(order: readonly (number | null)[], next: Item[]): void {
    if (isReadonly(items))
      throw new TypeError('Array helpers require a writable ref')
    prepare()
    remap(order, () => {
      items.value = next
    })
  }

  return {
    insert(index, item) {
      check(index, items.value.length)
      const order: (number | null)[] = items.value.map((_, position) => position)
      order.splice(index, 0, null)
      const next = items.value.slice()
      next.splice(index, 0, item)
      update(order, next)
    },
    remove(index) {
      check(index, items.value.length - 1)
      const order = items.value.map((_, position) => position)
      order.splice(index, 1)
      update(order, order.map(position => items.value[position]!))
    },
    move(from, to) {
      check(from, items.value.length - 1)
      check(to, items.value.length - 1)
      if (from === to)
        return
      const order = items.value.map((_, position) => position)
      order.splice(to, 0, order.splice(from, 1)[0]!)
      update(order, order.map(position => items.value[position]!))
    },
  }
}
