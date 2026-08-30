export default function createI18nOptions() {
  return {
    legacy: false as const,
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
      en: {
        forms: {
          signup: {
            confirmPassword: {
              invalid: 'Passwords do not match',
              minLength: 'Confirm your password',
            },
            email: {
              invalidEmail: 'Enter a valid email address',
              minLength: 'Email is required',
            },
            password: {
              maxLength: 'Use at most {maximum} characters',
              minLength: 'Use at least {minimum} characters',
            },
          },
        },
        errors: {
          invalid: 'The value is invalid',
          invalidEmail: 'Enter a valid email address',
          invalidType: 'Enter the expected value',
          invalidUrl: 'Enter a valid URL',
          maximum: 'Use a value no greater than {maximum}',
          maxLength: 'Use at most {maximum} characters',
          minimum: 'Use a value of at least {minimum}',
          minLength: 'Use at least {minimum} characters',
          required: 'This field is required',
        },
      },
      es: {
        forms: {
          signup: {
            confirmPassword: {
              invalid: 'Las contraseñas no coinciden',
              minLength: 'Confirma tu contraseña',
            },
            email: {
              invalidEmail: 'Introduce un correo electrónico válido',
              minLength: 'El correo electrónico es obligatorio',
            },
            password: {
              maxLength: 'Usa como máximo {maximum} caracteres',
              minLength: 'Usa al menos {minimum} caracteres',
            },
          },
        },
        errors: {
          invalid: 'El valor no es válido',
          invalidEmail: 'Introduce un correo electrónico válido',
          invalidType: 'Introduce el valor esperado',
          invalidUrl: 'Introduce una URL válida',
          maximum: 'Usa un valor no superior a {maximum}',
          maxLength: 'Usa como máximo {maximum} caracteres',
          minimum: 'Usa un valor de al menos {minimum}',
          minLength: 'Usa al menos {minimum} caracteres',
          required: 'Este campo es obligatorio',
        },
      },
    },
  }
}
