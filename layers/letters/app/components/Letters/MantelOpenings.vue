<script setup lang="ts">
// How letters to a kept mantel may open, set by any of its keepers. Writers
// choose among these when they seal; they cannot pick a day of their own.
import {
  OPENING_DAYS_MAX,
  OPENING_LABEL_MAX,
  type OpeningDay,
  type OpeningsView,
} from '../../../shared/utils/openings'

const props = defineProps<{ mantelId: string; name: string; openings: OpeningsView }>()
const emit = defineEmits<{ changed: [] }>()

const onArrival = ref(props.openings.onArrival)
const days = ref<OpeningDay[]>(props.openings.days.map((day) => ({ ...day })))
const newDay = ref('')
const newLabel = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)
const saved = ref(false)

watch(
  () => props.openings,
  (openings) => {
    onArrival.value = openings.onArrival
    days.value = openings.days.map((day) => ({ ...day }))
  },
)

const changed = computed(
  () =>
    onArrival.value !== props.openings.onArrival ||
    JSON.stringify(days.value) !== JSON.stringify(props.openings.days),
)

function add() {
  if (!newDay.value || days.value.some((day) => day.on === newDay.value)) return
  days.value = [...days.value, { on: newDay.value, label: newLabel.value.trim() }].toSorted(
    (a, b) => a.on.localeCompare(b.on),
  )
  newDay.value = ''
  newLabel.value = ''
}

const remove = (on: string) => (days.value = days.value.filter((day) => day.on !== on))

async function save() {
  busy.value = true
  failure.value = null
  saved.value = false
  try {
    await $fetch('/api/letters/kept/openings', {
      method: 'PUT',
      body: { mantelId: props.mantelId, onArrival: onArrival.value, days: days.value },
    })
    saved.value = true
    emit('changed')
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    busy.value = false
  }
}

const changedOn = computed(() =>
  props.openings.changedAt
    ? new Date(props.openings.changedAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null,
)
</script>

<template>
  <section aria-labelledby="openings-heading" class="flex flex-col gap-3">
    <h3 id="openings-heading" class="text-lg text-highlighted">When letters to {{ name }} open</h3>
    <p class="text-sm text-muted">
      Everyone who writes to {{ name }} chooses from what you allow here. A letter sealed until a
      day still arrives as usual, but nobody can open it before then, its keepers included. A change
      applies to letters sealed after it; any keeper can make one.
    </p>
    <p v-if="openings.changedBy && changedOn" class="text-sm text-muted">
      Last changed by {{ openings.changedBy }} on {{ changedOn }}.
    </p>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <UCheckbox
      v-model="onArrival"
      label="A letter can open when it arrives"
      description="A keeper can read it to them straight away."
    />

    <ul v-if="days.length" class="flex flex-col divide-y divide-default">
      <li v-for="day in days" :key="day.on" class="flex items-center justify-between gap-4 py-2">
        <span>
          <span class="text-highlighted">{{ yearDay(day.on) }}</span>
          <span v-if="day.label" class="text-muted"> · {{ day.label }}</span>
        </span>
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          :aria-label="`Remove ${yearDay(day.on)}`"
          @click="remove(day.on)"
        >
          Remove
        </UButton>
      </li>
    </ul>

    <form
      v-if="days.length < OPENING_DAYS_MAX"
      class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      @submit.prevent="add"
    >
      <UFormField label="A day to seal letters until" name="opening-day">
        <UInput v-model="newDay" type="date" class="w-full" />
      </UFormField>
      <UFormField label="What the day is (optional)" name="opening-label">
        <UInput
          v-model="newLabel"
          :maxlength="OPENING_LABEL_MAX"
          placeholder="18th birthday"
          class="w-full"
        />
      </UFormField>
      <UButton type="submit" variant="outline" color="neutral" :disabled="!newDay">
        Add the day
      </UButton>
    </form>

    <div class="flex flex-wrap items-center gap-3">
      <UButton :loading="busy" :disabled="!changed" @click="save">Save how letters open</UButton>
      <p v-if="saved && !changed" class="text-sm text-muted" role="status">Saved.</p>
    </div>
  </section>
</template>
