---
title: ErrorMessages Component
---

# ErrorMessages Component

The `ErrorMessages` component is designed to display validation error messages in a user-friendly manner. It can handle various types of error messages, including strings, arrays, and objects, making it versatile for different validation scenarios.

## Usage

To use the `ErrorMessages` component, import it into your Vue component and pass the error messages as a prop. The component will render the messages based on the provided data structure.

### Props

The `ErrorMessages` component accepts the following props:

- **messages**: The error messages to display. This can be a string, an array of messages, an object with boolean values, or `false`.
- **as**: (optional) A string that specifies the HTML tag to render the messages. Defaults to `span`.

### Example

Here’s an example of how to use the `ErrorMessages` component in a form:

::: code-group

```vue [Record<{{'string'}}, boolean>]
<ErrorMessages
  :messages="{
    ['This field is required']: useError(errors.email, 'too_small'),
    ['This string is invalid']: useError(errors.email, 'invalid_string'),
  }"
/>
```

```vue [string]
<ErrorMessages :messages="This field is required" />
```

```vue [array]
<ErrorMessages :messages="['This field is required', 'This string is invalid']" />
```

:::

### How It Works

1. **Message Handling**: The `createMessageArray` utility function processes the `messages` prop. It can handle:
   - **Strings**: Directly returns the string as an array.
   - **Arrays**: Flattens nested arrays into a single array of messages.
   - **Objects**: Returns keys of the object where the value is `true`.
   - **False**: Returns an empty array.

2. **Rendering**: The component uses the `resolveDynamicComponent` function to render the messages in the specified HTML tag. If there are no messages, it renders nothing.
