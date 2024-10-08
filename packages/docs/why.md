---
outline: deep
---

# Introduction

In the journey of developing various projects, I realized the need for a robust form validation library that leverages model-based validation. After exploring existing solutions and not finding one that fully met my requirements, I decided to create my own: **Verific**.

## Why Do You Need Verific?

If you're using **Vue 3** and want a seamless way to validate your forms using your existing data models, then **Verific** is the solution. It integrates effortlessly with your Vue applications and provides a powerful validation mechanism using **Zod**.

Verific allows you to define your validation rules directly on your data models, making it intuitive and reducing the redundancy of defining validation logic separately. This model-based approach ensures that your validation logic is consistent and centralized.

Additionally, Verific offers flexibility with both the Composition API and Declarative Components, allowing you to choose the style that best fits your development needs.

## Why Not Other Validation Libraries?

While there are several validation libraries available, Verific stands out due to its model-based approach and integration with Zod. Here's why you might prefer Verific:

### Model-Based Validation

Verific allows you to define validation rules directly on your data models. This approach ensures that your validation logic is consistent and reduces the redundancy of defining validation logic separately from your data models.

### Zod Integration

By using **Zod**, Verific provides a powerful and expressive way to define validation schemas. Zod's schema definitions are type-safe and integrate seamlessly with TypeScript, providing a robust validation mechanism.

### Flexibility and Ease of Use

Verific offers two styles of integration: the Composition API and Declarative Components. This flexibility allows you to choose the style that best fits your development needs, whether you prefer a more programmatic approach or a declarative one.

### Example

Here's a simple example of how you can use Verific with the Composition API:
