<script setup lang="ts">
// Where and when mail arrives, after sign-up. Mail days and the hour change
// from tomorrow; a new city changes the time zone at once.
import {
  ALL_MAIL_DAYS,
  mailDaysFromWeekdays,
  weekdaysFromMailDays,
} from '../../../shared/utils/mail-days'
import type { CityOption, PostalProfile } from '../../composables/usePostalProfile'

definePageMeta({ middleware: 'auth' })

const postal = usePostalProfile()
const profile = computed(() => postal.profile.value ?? null)

const WEEKDAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]
const HOURS = Array.from({ length: 16 }, (_, index) => index + 6).map((hour) => ({
  value: hour,
  label: `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`,
}))

const days = ref<string[]>([])
const hour = ref(10)
const query = ref('')
const options = ref<CityOption[]>([])
const pending = ref<'mail' | 'city' | null>(null)
const failure = ref<string | null>(null)
const saved = ref<string | null>(null)

function show(next: PostalProfile) {
  days.value = weekdaysFromMailDays(next.pendingMailDays ?? next.mailDays).map(String)
  hour.value = next.pendingDeliveryHour ?? next.deliveryHour
}

onMounted(async () => {
  const loaded = await postal.load()
  if (!loaded) return await navigateTo('/welcome', { replace: true })
  show(loaded)
})

const startsOn = computed(() =>
  profile.value?.pendingFrom
    ? new Date(`${profile.value.pendingFrom}T12:00:00Z`).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      })
    : null,
)

let latest = 0
watch(query, async (text) => {
  const request = (latest += 1)
  if (text.trim().length < 2) {
    options.value = []
    return
  }
  const found = await $fetch<{ cities: CityOption[] }>('/api/post/cities', { query: { q: text } })
  if (request === latest) options.value = found.cities
})

const place = (option: CityOption) =>
  [option.name, option.region, option.country].filter(Boolean).join(', ')

async function put(kind: 'mail' | 'city', body: Record<string, unknown>, done: string) {
  pending.value = kind
  failure.value = null
  saved.value = null
  try {
    const result = await $fetch<{ profile: PostalProfile }>(`/api/post/profile/${kind}`, {
      method: 'PUT',
      body,
    })
    postal.set(result.profile)
    show(result.profile)
    saved.value = done
  } catch {
    failure.value = 'Could not save that. Try again.'
  } finally {
    pending.value = null
  }
}

const saveMail = () =>
  put(
    'mail',
    {
      mailDays:
        days.value.length === WEEKDAYS.length
          ? ALL_MAIL_DAYS
          : mailDaysFromWeekdays(days.value.map(Number)),
      deliveryHour: hour.value,
    },
    'Saved. Changes to your days and hour start tomorrow.',
  )

async function move(option: CityOption) {
  await put('city', { cityId: option.id }, `Moved to ${option.name}.`)
  query.value = ''
  options.value = []
}

useSeo({
  title: 'Your post',
  description: 'Your city, your mail days and your delivery hour.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-12">
    <LetterNav />
    <div>
      <h1 class="text-3xl text-highlighted">Your post</h1>
      <p class="mt-2 text-muted">
        Where your letters arrive, on which days, and at what hour. Letters already on their way
        keep the arrival day they were given.
      </p>
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />
    <UAlert
      v-if="saved"
      color="success"
      variant="subtle"
      icon="i-lucide-check"
      :description="saved"
    />

    <UCard v-if="profile">
      <form class="flex flex-col gap-6" @submit.prevent="saveMail">
        <UFormField
          label="Mail days"
          name="days"
          help="The days post arrives on your mantel. There is no post on Sunday."
        >
          <UCheckboxGroup v-model="days" :items="WEEKDAYS" />
        </UFormField>
        <UFormField label="Delivery hour" name="hour" help="Your local time.">
          <USelect v-model="hour" :items="HOURS" size="lg" class="w-full" />
        </UFormField>
        <p v-if="startsOn" class="text-sm text-muted">
          A change is waiting. It starts on {{ startsOn }}.
        </p>
        <UButton
          type="submit"
          class="self-start"
          :loading="pending === 'mail'"
          :disabled="days.length === 0"
        >
          Save days and hour
        </UButton>
      </form>
    </UCard>

    <UCard v-if="profile">
      <div class="flex flex-col gap-4">
        <p>
          <span class="text-muted">Your city is </span>
          <span class="text-highlighted">{{ profile.cityName }}, {{ profile.country }}</span
          >.
        </p>
        <UFormField
          label="Move to another city"
          name="city"
          help="Start typing and pick it from the list. Your time zone changes straight away."
        >
          <UInput v-model="query" autocomplete="off" size="lg" class="w-full" />
          <ul v-if="options.length" class="mt-2 flex flex-col divide-y divide-default">
            <li v-for="option in options" :key="option.id">
              <UButton
                color="neutral"
                variant="ghost"
                block
                class="justify-start"
                :loading="pending === 'city'"
                @click="move(option)"
              >
                {{ place(option) }}
              </UButton>
            </li>
          </ul>
        </UFormField>
      </div>
    </UCard>
  </div>
</template>
