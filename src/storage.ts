import type { Application, Profile } from './types'

export const emptyProfile: Profile = { firstName: '', lastName: '', email: '', phone: '', location: '', headline: '', summary: '', linkedin: '', portfolio: '', workAuthorization: '', sponsorship: '', skills: '' }

export function loadProfile(): Profile {
  try { return { ...emptyProfile, ...JSON.parse(localStorage.getItem('applymate.profile') || '{}') } } catch { return emptyProfile }
}
export function saveProfile(profile: Profile) { localStorage.setItem('applymate.profile', JSON.stringify(profile)) }
export function loadApplications(): Application[] {
  try { return JSON.parse(localStorage.getItem('applymate.applications') || '[]') } catch { return [] }
}
export function saveApplications(items: Application[]) { localStorage.setItem('applymate.applications', JSON.stringify(items)) }
