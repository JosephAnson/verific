import { createI18n } from 'vue-i18n'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: {
      forms: {
        account: {
          email: {
            invalidEmail: 'Enter a valid email address',
            minLength: 'Email is required',
          },
          password: {
            maxLength: 'Use at most {maximum} characters',
            minLength: 'Use at least {minimum} characters',
          },
        },
        profile: {
          firstName: {
            maxLength: 'Use at most {maximum} characters',
            minLength: 'First name is required',
          },
          lastName: {
            maxLength: 'Use at most {maximum} characters',
            minLength: 'Use at least {minimum} characters',
          },
        },
      },
      errors: {
        invalid: 'The value is invalid',
        invalidEmail: 'Enter a valid email address',
        invalidType: 'Enter the expected value',
        maxLength: 'Use at most {maximum} characters',
        minLength: 'Use at least {minimum} characters',
        required: 'This field is required',
      },
    },
    es: {
      forms: {
        account: {
          email: {
            invalidEmail: 'Introduce un correo electrónico válido',
            minLength: 'El correo electrónico es obligatorio',
          },
          password: {
            maxLength: 'Usa como máximo {maximum} caracteres',
            minLength: 'Usa al menos {minimum} caracteres',
          },
        },
        profile: {
          firstName: {
            maxLength: 'Usa como máximo {maximum} caracteres',
            minLength: 'El nombre es obligatorio',
          },
          lastName: {
            maxLength: 'Usa como máximo {maximum} caracteres',
            minLength: 'Usa al menos {minimum} caracteres',
          },
        },
      },
      errors: {
        invalid: 'El valor no es válido',
        invalidEmail: 'Introduce un correo electrónico válido',
        invalidType: 'Introduce el valor esperado',
        maxLength: 'Usa como máximo {maximum} caracteres',
        minLength: 'Usa al menos {minimum} caracteres',
        required: 'Este campo es obligatorio',
      },
    },
  },
})
