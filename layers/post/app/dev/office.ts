// State shared by the dev clock bar and /dev/post. Reached only from the dev
// plugin and the dev page, so none of it is in a production build.

export interface DevPerson {
  userId: string
  name: string
  city: string
  localTime: string
  nextDelivery: string | null
  lastReleaseDate: string | null
  inTransit: number
  delivered: number
}

export interface DevNotice {
  id: string
  to: string | null
  mailDate: string
  channel: string
  state: string
}

export interface DevOffice {
  now: string
  offsetMs: number
  people: DevPerson[]
  outbox: DevNotice[]
}

export type ClockMove =
  | { action: 'hour' | 'pickup' | 'reset' }
  | { action: 'mail-day'; userId: string }

export function useDevPostOffice() {
  const office = useState<DevOffice | null>('dev-post-office', () => null)
  const busy = useState('dev-post-office-busy', () => false)

  async function act(url: string, body?: ClockMove) {
    busy.value = true
    try {
      const result = await $fetch<{ office: DevOffice }>(url, { method: 'POST', body })
      office.value = result.office
    } finally {
      busy.value = false
    }
  }

  return {
    office,
    busy,
    refresh: async () => {
      office.value = await $fetch<DevOffice>('/api/dev/post')
    },
    move: (body: ClockMove) => act('/api/dev/clock', body),
    seed: () => act('/api/dev/seed'),
  }
}
