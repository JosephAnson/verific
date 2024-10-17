import { resolveDynamicComponent } from 'vue'
import { createMessageArray } from '../utils/createMessageArray'

export const ErrorMessages = /** #__PURE__ */ defineComponent({
  name: 'ErrorMessages',
  props: {
    as: {
      type: String as PropType<keyof HTMLElementTagNameMap>,
      default: 'span',
    },
    messages: {
      type: [String, Array, Object, Boolean] as PropType<Messages>,
      default: undefined,
    },
  },
  setup(props, { attrs }) {
    const messages = computed(() => createMessageArray(props.messages))

    return () => {
      // Renders nothing if there are no messages
      if (!messages.value?.length) {
        return undefined
      }

      const tag = (props.as ? resolveDynamicComponent(props.as) : props.as) as string

      return messages.value.map(message => h(tag, attrs, message))
    }
  },
})
