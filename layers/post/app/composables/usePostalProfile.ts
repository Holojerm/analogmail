// The signed-in person's postal profile, fetched once and shared.

export interface PostalProfile {
  /** The city's id in the city list, for a page that offers "the city I live in". */
  cityId: number | null
  cityName: string
  country: string
  timeZone: string
  mailDays: number
  deliveryHour: number
  /** A change to mail days or hour that is waiting, and the day it starts. */
  pendingMailDays?: number | null
  pendingDeliveryHour?: number | null
  pendingFrom?: string | null
}

export interface CityOption {
  id: number
  name: string
  region: string | null
  country: string
  timeZone: string
}

export function usePostalProfile() {
  /** `undefined` until fetched; `null` when the person has not chosen a city. */
  const profile = useState<PostalProfile | null | undefined>('postal-profile', () => undefined)

  async function load(): Promise<PostalProfile | null> {
    if (profile.value === undefined) {
      const result = await $fetch<{ profile: PostalProfile | null }>('/api/post/profile')
      profile.value = result.profile
    }
    return profile.value ?? null
  }

  async function create(body: { cityId: number; mailDays: number; deliveryHour: number }) {
    const result = await $fetch<{ profile: PostalProfile }>('/api/post/profile', {
      method: 'POST',
      body,
    })
    profile.value = result.profile
  }

  return {
    profile,
    load,
    create,
    /** After a settings change: the server's answer replaces what is held. */
    set(next: PostalProfile) {
      profile.value = next
    },
    /** Sign-out: the next person's profile is fetched fresh. */
    reset: () => {
      profile.value = undefined
    },
  }
}
