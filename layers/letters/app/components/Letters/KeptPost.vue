<script setup lang="ts">
// Where and when a kept mantel's post arrives, and changing it. The same
// rules as a person's own post: a new city applies at once, new days and
// hour from tomorrow, and letters already on their way keep their day.
import {
  ALL_MAIL_DAYS,
  mailDaysFromWeekdays,
  weekdaysFromMailDays,
} from '#layers/post/shared/utils/mail-days'

import type { KeptPost } from '../../../shared/utils/kept'

const props = defineProps<{ mantelId: string; post: KeptPost }>()
const emit = defineEmits<{ changed: [] }>()

interface City {
  id: number
  name: string
  region: string | null
  country: string
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
  (label, index) => ({ value: String(index + 1), label }),
)
const HOURS = Array.from({ length: 16 }, (_, index) => index + 6).map((hour) => ({
  value: hour,
  label: `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`,
}))

const open = ref(false)
const days = ref<string[]>([])
const hour = ref(10)
const query = ref('')
const options = ref<City[]>([])
const busy = ref(false)
const failure = ref<string | null>(null)

watch(
  () => props.post,
  (post) => {
    days.value = weekdaysFromMailDays(post.pendingMailDays ?? post.mailDays).map(String)
    hour.value = post.pendingDeliveryHour ?? post.deliveryHour
  },
  { immediate: true },
)

const when = computed(() => {
  const on = weekdaysFromMailDays(props.post.mailDays)
  const named =
    on.length === WEEKDAYS.length
      ? 'Monday to Saturday'
      : on.map((day) => WEEKDAYS[day - 1]!.label).join(', ')
  const at = HOURS.find((option) => option.value === props.post.deliveryHour)?.label
  return at ? `${named}, at ${at}` : named
})

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

async function change(body: Record<string, number>) {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/letters/kept/post-change', {
      method: 'PUT',
      body: { mantelId: props.mantelId, ...body },
    })
    query.value = ''
    options.value = []
    emit('changed')
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'Could not save that. Try again.'
  } finally {
    busy.value = false
  }
}

const saveMail = () =>
  change({
    mailDays:
      days.value.length === WEEKDAYS.length
        ? ALL_MAIL_DAYS
        : mailDaysFromWeekdays(days.value.map(Number)),
    deliveryHour: hour.value,
  })
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted">
      Its post arrives in {{ post.city }}, {{ post.country }}, {{ when }}.
      <template v-if="post.pendingFrom">
        A change to its days and hour starts on {{ longDay(post.pendingFrom) }}.
      </template>
    </p>
    <UButton
      size="sm"
      variant="ghost"
      color="neutral"
      class="self-start"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ open ? 'Done' : 'Change its post' }}
    </UButton>

    <div v-if="open" class="flex flex-col gap-6 rounded-md border border-default p-4">
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />
      <form class="flex flex-col gap-4" @submit.prevent="saveMail">
        <UFormField
          label="Mail days"
          name="mantel-days"
          help="The days post arrives on this mantel. There is no post on Sunday."
        >
          <UCheckboxGroup v-model="days" :items="WEEKDAYS" />
        </UFormField>
        <UFormField label="Delivery hour" name="mantel-hour" help="The mantel's local time.">
          <USelect v-model="hour" :items="HOURS" size="lg" class="w-full" />
        </UFormField>
        <UButton
          type="submit"
          variant="outline"
          color="neutral"
          class="self-start"
          :loading="busy"
          :disabled="days.length === 0"
        >
          Save days and hour
        </UButton>
        <p class="text-sm text-muted">
          They start tomorrow. Letters already on their way keep the day they were given.
        </p>
      </form>
      <UFormField
        label="Move to another city"
        name="mantel-move"
        help="Start typing and pick it. The mantel's time zone changes straight away."
      >
        <UInput v-model="query" autocomplete="off" size="lg" class="w-full" />
        <ul v-if="options.length" class="mt-2 flex flex-col divide-y divide-default">
          <li v-for="city in options" :key="city.id">
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-start"
              :loading="busy"
              @click="change({ cityId: city.id })"
            >
              {{ place(city) }}
            </UButton>
          </li>
        </ul>
      </UFormField>
    </div>
  </div>
</template>
