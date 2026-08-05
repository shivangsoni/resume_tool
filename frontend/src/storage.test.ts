// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyProfile, loadApplications, loadProfile, saveApplications, saveProfile } from './storage'

describe('local storage adapters', () => {
  beforeEach(() => localStorage.clear())

  it('returns a complete empty profile when no data exists', () => {
    expect(loadProfile()).toEqual(emptyProfile)
  })

  it('round-trips profile and application data', () => {
    const profile = { ...emptyProfile, firstName: 'Shivang', email: 'candidate@example.com' }
    saveProfile(profile)
    expect(loadProfile()).toEqual(profile)

    const applications = [{ id: '1', company: 'Example', role: 'Engineer', location: 'Remote', status: 'Draft' as const, updatedAt: '2026-08-04' }]
    saveApplications(applications)
    expect(loadApplications()).toEqual(applications)
  })

  it('recovers from malformed local data', () => {
    localStorage.setItem('applymate.profile', '{bad json')
    expect(loadProfile()).toEqual(emptyProfile)
  })
})
