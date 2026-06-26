export type PasswordStrength = 'Weak' | 'Medium' | 'Strong'

export type AuthErrors = Partial<{
  name: string
  email: string
  password: string
  confirmPassword: string
  form: string
}>

export type SignUpFields = {
  name: string
  email: string
  password: string
  confirmPassword: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function getPasswordChecks(password: string) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[@#$%&]/.test(password),
  }
}

export function getPasswordStrength(password: string): PasswordStrength {
  const checks = getPasswordChecks(password)
  const passed = Object.values(checks).filter(Boolean).length

  if (!password || passed <= 2) return 'Weak'
  if (passed < 5) return 'Medium'
  return 'Strong'
}

export function isValidEmail(email: string) {
  return email.includes('@') && emailPattern.test(email)
}

export function validateSignUp(fields: SignUpFields): AuthErrors {
  const errors: AuthErrors = {}

  if (!fields.name.trim()) errors.name = 'Full name is required'
  if (!fields.email.trim()) errors.email = 'Email address is required'
  else if (!isValidEmail(fields.email)) errors.email = 'Please enter a valid email address'

  if (!fields.password) {
    errors.password = 'Password is required'
  } else if (getPasswordStrength(fields.password) !== 'Strong') {
    errors.password =
      'Password must be at least 8 characters and include uppercase, lowercase, number, and @ # $ % &'
  }

  if (!fields.confirmPassword) errors.confirmPassword = 'Please confirm your password'
  else if (fields.confirmPassword !== fields.password) errors.confirmPassword = 'Passwords do not match'

  return errors
}

export function validateSignIn(email: string, password: string): AuthErrors {
  const errors: AuthErrors = {}

  if (!email.trim()) errors.email = 'Email address is required'
  else if (!isValidEmail(email)) errors.email = 'Please enter a valid email address'
  if (!password) errors.password = 'Password is required'

  return errors
}

export function hasNoErrors(errors: AuthErrors) {
  return Object.keys(errors).length === 0
}
