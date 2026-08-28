import type { PropType, SlotsType, VNodeChild } from 'vue'
import type { Messages } from '../utils/createMessageArray'
import { computed, defineComponent } from 'vue'
import { createMessageArray } from '../utils/createMessageArray'

export const ErrorMessages = /** #__PURE__ */ defineComponent({
  name: 'ErrorMessages',
  inheritAttrs: false,
  props: {
    messages: {
      type: [String, Array, Object, Boolean] as PropType<Messages>,
      required: true,
    },
  },
  slots: Object as SlotsType<{
    default: (props: { message: string, index: number }) => VNodeChild
  }>,
  setup(props, { slots }) {
    const messages = computed(() => createMessageArray(props.messages))

    return () => {
      const renderMessage = slots.default
      if (!renderMessage)
        return null

      return messages.value.flatMap((message, index) => renderMessage({ message, index }))
    }
  },
})
