import type { SafeIdentity } from './api'
export const mobileIdentityLabel = (person?: SafeIdentity) => person?.displayName?.trim() || (person?.username ? `@${person.username}` : 'BeePlan user')
