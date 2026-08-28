## Purpose

Let applications reuse Verific's message normalisation while retaining complete ownership of validation-error markup, styling and accessibility.

## ADDED Requirements

### Requirement: Error messages are exposed through a scoped slot
`ErrorMessages` MUST flatten every supported `messages` input and invoke its default scoped slot once for each resulting string. The slot MUST receive the message string and its zero-based index.

#### Scenario: Render an array with caller-owned markup
- **WHEN** a caller supplies two messages and a default slot that renders a list item
- **THEN** `ErrorMessages` renders two list items containing the messages in input order
- **THEN** `ErrorMessages` does not add its own wrapper or message element

#### Scenario: Normalise conditional and nested messages
- **WHEN** a caller supplies nested arrays, conditional message records and false values
- **THEN** the slot receives only the enabled message strings in normalised order

### Requirement: Presentation markup is required from the caller
`ErrorMessages` MUST NOT choose an HTML element or Vue component for a message. Without a default slot, it MUST render no message markup.

#### Scenario: No scoped slot is provided
- **WHEN** messages are supplied without a default slot
- **THEN** the component renders no elements

### Requirement: Slot content updates reactively
`ErrorMessages` MUST reevaluate normalised messages when its reactive `messages` input changes.

#### Scenario: Messages change after initial render
- **WHEN** the supplied messages change from one string to another
- **THEN** the caller-owned slot content updates to the new message
