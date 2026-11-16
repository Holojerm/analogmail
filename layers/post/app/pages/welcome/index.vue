<script setup lang="ts">
// The last step of sign-up: where mail arrives, on which days, at what hour.
import { ALL_MAIL_DAYS, mailDaysFromWeekdays } from '../../../shared/utils/mail-days'
import type { CityOption } from '../../composables/usePostalProfile'

definePageMeta({ middleware: 'auth' })

const postal = usePostalProfile()

// The checkbox group's items carry string values; the weekday number is parsed back out.
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

const query = ref('')
const options = ref<CityOption[]>([])
const city = ref<CityOption | null>(null)
const days = ref(WEEKDAYS.map((day) => day.value))
const hour = ref(10)
const pending = ref(false)
const failure = ref<string | null>(null)

const place = (option: CityOption) =>
  [option.name, option.region, option.country].filter(Boolean).join(', ')

let latest = 0
watch(query, async (text) => {
  const request = (latest += 1)
  if (city.value && text !== place(city.value)) city.value = null
  if (city.value || text.trim().length < 2) {
    options.value = []
    return
  }
  const found = await $fetch<{ cities: CityOption[] }>('/api/post/cities', { query: { q: text } })
  if (request === latest) options.value = found.cities
})

function choose(option: CityOption) {
  city.value = option
  query.value = place(option)
  options.value = []
}

const mailDays = computed(() =>
  days.value.length === WEEKDAYS.length
    ? ALL_MAIL_DAYS
    : mailDaysFromWeekdays(days.value.map(Number)),
)
const ready = computed(() => Boolean(city.value) && days.value.length > 0)

async function submit() {
  if (!city.value) return
  pending.value = true
  failure.value = null
  try {
    await postal.create({
      cityId: city.value.id,
      mailDays: mailDays.value,
      deliveryHour: hour.value,
    })
    // Nobody to write to yet: the people page is where a new account starts.
    await navigateTo('/people')
  } catch {
    failure.value = 'Could not save that. Try again.'
  } finally {
    pending.value = false
  }
}

onMounted(async () => {
  if (await postal.load()) await navigateTo('/people', { replace: true })
})

useSeo({
  title: 'Where your mail arrives',
  description: 'Choose your city, your mail days and your delivery hour.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8 sm:py-12">
    <div>
      <h1 class="text-3xl text-highlighted">Where your mail arrives</h1>
      <p class="mt-2 font-serif text-lg text-toned">
        Letters take longer the farther they travel, and arrive in the morning where you are. We
        keep the city, never your location.
      </p>
    </div>

    <UCard>
      <form class="flex flex-col gap-6" @submit.prevent="submit">
        <UFormField label="Your city" name="city" help="Start typing and pick it from the list.">
          <UInput
            v-model="query"
            autocomplete="off"
            size="lg"
            class="w-full"
            placeholder="Chicago"
          />
          <ul v-if="options.length" class="mt-2 flex flex-col divide-y divide-default">
            <li v-for="option in options" :key="option.id">
              <UButton
                color="neutral"
                variant="ghost"
                block
                class="justify-start"
                @click="choose(option)"
              >
                {{ place(option) }}
              </UButton>
            </li>
          </ul>
        </UFormField>

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

        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="failure"
        />
        <UButton type="submit" size="lg" block :loading="pending" :disabled="!ready">
          Continue
        </UButton>
      </form>
    </UCard>
  </div>
</template>
