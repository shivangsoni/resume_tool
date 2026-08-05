// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyProfile, loadProfile, saveProfile } from './storage'

describe('local storage adapters', () => {
  beforeEach(() => localStorage.clear())

  it('returns a complete empty profile when no data exists', () => {
    expect(loadProfile()).toEqual(emptyProfile)
  })

  it('round-trips profile data', () => {
    const profile = { ...emptyProfile, firstName: 'Shivang', email: 'candidate@example.com' }
    saveProfile(profile)
    expect(loadProfile()).toEqual(profile)
  })

  it('recovers from malformed local data', () => {
    localStorage.setItem('applymate.profile', '{bad json')
    expect(loadProfile()).toEqual(emptyProfile)
  })
})
