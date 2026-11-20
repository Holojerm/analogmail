<script setup lang="ts">
// A child's mantel writing back. Any keeper writes as the child, to the people
// who write to the mantel. Its drafts and sealed letters are every keeper's,
// and after sealing they see only what any sender sees.
import type { DeskLetter } from '../../../shared/utils/letter-doc'

const props = defineProps<{ mantelId: string; name: string }>()

interface Outbox {
  people: { correspondenceId: string; name: string }[]
  zone: string
  letters: DeskLetter[]
}

const outbox = ref<Outbox | null>(null)
const failure = ref<string | null>(null)

async function load() {
  try {
    outbox.value = await $fetch<Outbox>('/api/letters/kept/outbox', {
      method: 'POST',
      body: { mantelId: props.mantelId },
    })
  } catch {
    failure.value = 'That did not work. Try again.'
  }
}
onMounted(load)

const write = (query: Record<string, string>) =>
  navigateTo({ path: '/write', query: { as: props.mantelId, ...query } })

const edited = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

function describe(letter: DeskLetter): string {
  const status = letter.status
  const zone = outbox.value?.zone ?? 'UTC'
  if (status.kind === 'awaiting_pickup') {
    return `Sealed. Collected ${pickupTime(status.pickupAt, zone)}, arrives ${longDay(status.arrives)}.`
  }
  if (status.kind === 'in_transit') return `In transit, arrives ${longDay(status.arrives)}.`
  if (status.kind === 'posted') return `Postmarked ${longDay(status.postmark)}.`
  return `Draft, edited ${edited(letter.updatedAt)}.`
}

async function act(path: string, id: string) {
  failure.value = null
  try {
    await $fetch(path, { method: 'POST', body: { id, mantelId: props.mantelId } })
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    await load()
  }
}
</script>

<template>
  <section aria-labelledby="mantel-writes-heading" class="flex flex-col gap-3">
    <h3 id="mantel-writes-heading" class="text-lg text-highlighted">Letters from {{ name }}</h3>
    <p class="text-sm text-muted">
      Write as {{ name }} to someone who writes to this mantel, with {{ name }} beside you. The
      letter comes from {{ name }}'s mantel and is signed with their name. It is encrypted on this
      device, and every keeper can read it.
    </p>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />
    <template v-if="outbox">
      <p v-if="outbox.people.length === 0" class="text-muted">Nobody writes to {{ name }} yet.</p>
      <div v-else class="flex flex-wrap gap-2">
        <UButton
          v-for="person in outbox.people"
          :key="person.correspondenceId"
          variant="outline"
          color="neutral"
          @click="write({ to: person.correspondenceId })"
        >
          Write to {{ person.name }} as {{ name }}
        </UButton>
      </div>

      <ul v-if="outbox.letters.length" class="flex flex-col divide-y divide-default">
        <li
          v-for="letter in outbox.letters"
          :key="letter.id"
          class="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <div class="min-w-0">
            <p class="text-highlighted">To {{ letter.to }}</p>
            <p class="text-sm text-muted">{{ describe(letter) }}</p>
          </div>
          <div class="flex gap-2">
            <UButton
              size="sm"
              variant="outline"
              color="neutral"
              :aria-label="`Open the letter to ${letter.to}`"
              @click="write({ letter: letter.id })"
            >
              Open
            </UButton>
            <UButton
              v-if="letter.status.kind === 'awaiting_pickup'"
              size="sm"
              variant="ghost"
              color="neutral"
              :aria-label="`Recall the letter to ${letter.to}`"
              @click="act('/api/letters/recall', letter.id)"
            >
              Recall
            </UButton>
            <UButton
              v-if="letter.status.kind === 'draft'"
              size="sm"
              variant="ghost"
              color="neutral"
              :aria-label="`Throw away the draft to ${letter.to}`"
              @click="act('/api/letters/drafts/discard', letter.id)"
            >
              Throw away
            </UButton>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>
