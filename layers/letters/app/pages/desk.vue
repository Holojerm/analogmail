<script setup lang="ts">
// The writer's desk: drafts, and what has been sealed. A sealed letter shows
// when it will arrive until that day, then only its postmark.
import type { DeskLetter } from '../../shared/utils/letter-doc'

definePageMeta({ middleware: 'auth' })

const { data, refresh } = await useFetch<{ zone: string; letters: DeskLetter[] }>(
  '/api/letters/desk',
)
const zone = computed(() => data.value?.zone ?? 'UTC')
const letters = computed(() => data.value?.letters ?? [])
const drafts = computed(() => letters.value.filter((letter) => letter.status.kind === 'draft'))
const sent = computed(() => letters.value.filter((letter) => letter.status.kind !== 'draft'))
const failure = ref<string | null>(null)

const edited = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

function describe(letter: DeskLetter): string {
  const status = letter.status
  if (status.kind === 'awaiting_pickup') {
    return `Sealed. Collected ${pickupTime(status.pickupAt, zone.value)}, arrives ${longDay(status.arrives)}.`
  }
  if (status.kind === 'in_transit') return `In transit, arrives ${longDay(status.arrives)}.`
  if (status.kind === 'posted') return `Postmarked ${longDay(status.postmark)}.`
  return `Draft, edited ${edited(letter.updatedAt)}.`
}

async function act(path: string, id: string, fallback: string) {
  failure.value = null
  try {
    await $fetch(path, { method: 'POST', body: { id } })
  } catch (error) {
    failure.value = (error as { data?: { message?: string } }).data?.message ?? fallback
  } finally {
    await refresh()
  }
}
const recall = (id: string) => act('/api/letters/recall', id, 'Could not recall that letter.')
const discard = (id: string) =>
  act('/api/letters/drafts/discard', id, 'Could not throw that draft away.')

useSeo({
  title: 'Your desk',
  description: 'Your drafts and the letters you have sent.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-8 py-12">
    <div class="flex items-baseline justify-between gap-4">
      <h1 class="text-3xl text-highlighted">Your desk</h1>
      <UButton to="/people" variant="link" color="neutral" class="p-0"
        >People you write with</UButton
      >
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <section aria-labelledby="drafts-heading" class="flex flex-col gap-3">
      <h2 id="drafts-heading" class="text-xl text-highlighted">Drafts</h2>
      <p v-if="drafts.length === 0" class="text-muted">No drafts.</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li
          v-for="letter in drafts"
          :key="letter.id"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="text-highlighted">To {{ letter.to }}</p>
            <p class="text-sm text-muted">{{ describe(letter) }}</p>
          </div>
          <div class="flex shrink-0 gap-2">
            <UButton size="sm" :to="{ path: '/write', query: { letter: letter.id } }"
              >Continue</UButton
            >
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              :aria-label="`Throw away the draft to ${letter.to}`"
              @click="discard(letter.id)"
            >
              Discard
            </UButton>
          </div>
        </li>
      </ul>
    </section>

    <section aria-labelledby="sent-heading" class="flex flex-col gap-3">
      <h2 id="sent-heading" class="text-xl text-highlighted">Sent</h2>
      <p v-if="sent.length === 0" class="text-muted">Nothing sent yet.</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li
          v-for="letter in sent"
          :key="letter.id"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="text-highlighted">To {{ letter.to }}</p>
            <p class="text-sm text-muted">{{ describe(letter) }}</p>
          </div>
          <div class="flex shrink-0 gap-2">
            <UButton
              size="sm"
              variant="outline"
              color="neutral"
              :to="{ path: '/write', query: { letter: letter.id } }"
              :aria-label="`Read your letter to ${letter.to}`"
            >
              Read
            </UButton>
            <UButton
              v-if="letter.status.kind === 'awaiting_pickup'"
              size="sm"
              variant="ghost"
              color="neutral"
              :aria-label="`Recall the letter to ${letter.to}`"
              @click="recall(letter.id)"
            >
              Recall
            </UButton>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
