<script setup lang="ts">
// The dev clock. Mounted by ./clock-plugin.ts in local development only. Every jump also runs the release, as the cron would.
import { useDevPostOffice } from './office'

const { office, busy, refresh, move } = useDevPostOffice()
const person = ref('')

onMounted(refresh)
watch(
  () => office.value?.people,
  (people) => {
    if (!people?.some((entry) => entry.userId === person.value)) {
      person.value = people?.[0]?.userId ?? ''
    }
  },
)

const simulated = computed(() => {
  if (!office.value) return 'Loading'
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(office.value.now))
  return `${time} UTC`
})

const ahead = computed(() => {
  const hours = Math.round((office.value?.offsetMs ?? 0) / 3_600_000)
  if (hours === 0) return 'real time'
  return `${Math.floor(hours / 24)} d ${hours % 24} h ahead`
})
</script>

<template>
  <aside
    aria-label="Dev clock"
    class="fixed bottom-3 left-3 z-50 flex max-w-md flex-wrap items-center gap-2 rounded-md border border-default bg-elevated px-3 py-2 text-xs text-default"
  >
    <span class="font-mono">{{ simulated }}</span>
    <span class="text-muted">{{ ahead }}</span>
    <UButton
      size="xs"
      color="neutral"
      variant="soft"
      :disabled="busy"
      @click="move({ action: 'hour' })"
    >
      1 hour on
    </UButton>
    <UButton
      size="xs"
      color="neutral"
      variant="soft"
      :disabled="busy"
      @click="move({ action: 'pickup' })"
    >
      Next pickup
    </UButton>
    <select
      v-model="person"
      aria-label="Person"
      class="rounded-md border border-default bg-default px-1 py-0.5"
    >
      <option v-for="entry in office?.people ?? []" :key="entry.userId" :value="entry.userId">
        {{ entry.name }}, {{ entry.city }}
      </option>
    </select>
    <UButton
      size="xs"
      color="neutral"
      variant="soft"
      :disabled="busy || !person"
      @click="move({ action: 'mail-day', userId: person })"
    >
      Their next mail day
    </UButton>
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      :disabled="busy"
      @click="move({ action: 'reset' })"
    >
      Reset
    </UButton>
    <NuxtLink to="/dev/post" class="underline">Post office</NuxtLink>
  </aside>
</template>
