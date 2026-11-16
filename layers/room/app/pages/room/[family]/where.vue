<script setup lang="ts">
// Where everyone in the family says they are. A person picks a city from the
// list; nothing reads a device's position, and nobody is reminded or asked.
import type { RoomFamily, RoomWhereabouts } from '../../../../shared/utils/room-types'

definePageMeta({ middleware: 'auth' })

interface City {
  id: number
  name: string
  region: string | null
  country: string
}
interface WhereView {
  family: RoomFamily
  me: string
  people: RoomWhereabouts[]
}

const route = useRoute()
const familyId = String(route.params.family)
const base = `/api/room/${familyId}`

const { data, refresh, error } = await useFetch<WhereView>(`${base}/whereabouts`)
const family = computed(() => data.value?.family ?? null)
const people = computed(() => data.value?.people ?? [])
const mine = computed(() => people.value.find((person) => person.userId === data.value?.me))

const query = ref('')
const options = ref<City[]>([])
const busy = ref(false)
const failure = ref<string | null>(null)

let latest = 0
watch(query, async (text) => {
  const request = (latest += 1)
  if (text.trim().length < 2) {
    options.value = []
    return
  }
  const found = await $fetch<{ cities: City[] }>('/api/post/cities', { query: { q: text } })
  if (request === latest) options.value = found.cities
})
const place = (city: City) => [city.name, city.region, city.country].filter(Boolean).join(', ')

async function act(request: () => Promise<unknown>) {
  busy.value = true
  failure.value = null
  try {
    await request()
    query.value = ''
    options.value = []
    await refresh()
  } catch (caught) {
    failure.value = apiErrorMessage(caught, 'That did not work. Try again.')
  } finally {
    busy.value = false
  }
}
const say = (city: City) =>
  act(() => $fetch(`${base}/checkins`, { method: 'POST', body: { cityId: city.id } }))
const forget = () => act(() => $fetch(`${base}/checkins/forget`, { method: 'POST' }))

const since = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

useSeo({
  title: 'Where everyone is',
  description: 'Where the people in a family say they are.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 py-12">
    <LetterNav />

    <UAlert
      v-if="error || !family"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      description="You are not in that family."
    />

    <template v-else>
      <header>
        <p class="text-sm text-muted">The room of {{ family.name }}</p>
        <h1 class="text-3xl text-highlighted">Where everyone is</h1>
      </header>
      <RoomTabs :family-id="familyId" />
      <RoomNotice />
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />

      <ul class="flex flex-col divide-y divide-default">
        <li
          v-for="person in people"
          :key="person.userId"
          class="flex items-center justify-between gap-4 py-3"
        >
          <p class="text-highlighted">
            {{ person.name }}{{ person.userId === data?.me ? ' (you)' : '' }}
          </p>
          <p v-if="person.city && person.at" class="text-right text-sm text-muted">
            <span class="text-default">{{ person.city }}, {{ person.country }}</span>
            <br />
            since {{ since(person.at) }}
          </p>
          <p v-else class="text-sm text-muted">Has not said</p>
        </li>
      </ul>

      <section
        v-if="!family.closed"
        aria-labelledby="say-heading"
        class="flex flex-col gap-3 rounded-md border border-default p-4"
      >
        <h2 id="say-heading" class="text-xl text-highlighted">Say where you are</h2>
        <p class="text-sm text-muted">
          Pick a city. Only this family sees it, it shows until you say somewhere else, and nobody
          is ever reminded to update it. We never read your device's location.
        </p>
        <UFormField label="Your city now" name="where-city" help="Start typing and pick it.">
          <UInput v-model="query" autocomplete="off" size="lg" class="w-full" />
          <ul v-if="options.length" class="mt-2 flex flex-col divide-y divide-default">
            <li v-for="city in options" :key="city.id">
              <UButton
                color="neutral"
                variant="ghost"
                block
                class="justify-start"
                :loading="busy"
                @click="say(city)"
              >
                {{ place(city) }}
              </UButton>
            </li>
          </ul>
        </UFormField>
        <UButton
          v-if="mine?.city"
          variant="ghost"
          color="neutral"
          size="sm"
          class="self-start"
          :loading="busy"
          @click="forget"
        >
          Stop showing where I am
        </UButton>
      </section>
    </template>
  </div>
</template>
