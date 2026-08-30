import type { ComponentOptionsMixin, DefineComponent, PropType, PublicProps, SlotsType, VNodeChild } from 'vue'
import type { Messages } from '../utils/createMessageArray'
import { computed, defineComponent } from 'vue'
import { createMessageArray } from '../utils/createMessageArray'

type ErrorMessagesSlots = SlotsType<{
  default: (props: { message: string, index: number }) => VNodeChild
}>

type ErrorMessagesComponent = DefineComponent<
  { messages: Messages },
  () => VNodeChild[] | null,
  Record<never, never>,
  Record<never, never>,
  Record<never, never>,
  ComponentOptionsMixin,
  ComponentOptionsMixin,
  Record<never, never>,
  string,
  PublicProps,
  Readonly<{ messages: Messages }>,
  Record<never, never>,
  ErrorMessagesSlots
>

export const ErrorMessages: ErrorMessagesComponent = /** #__PURE__ */ defineComponent({
  name: 'ErrorMessages',
  inheritAttrs: false,
  props: {
    messages: {
      type: [String, Array, Object, Boolean] as PropType<Messages>,
      required: true,
    },
  },
  slots: Object as ErrorMessagesSlots,
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
