<script setup lang="ts">
// The mantel: what has arrived. A letter appears here on the mail day it is
// delivered, never before.
import type { MantelItem } from '../../shared/utils/mantel'

definePageMeta({ middleware: ['auth', 'keys'] })

const { data } = await useFetch<{ items: MantelItem[] }>('/api/letters/mantel')
const items = computed(() => data.value?.items ?? [])

function title(item: MantelItem): string {
  if (item.kind === 'return') {
    return item.name ? `Returned: your letter to ${item.name}` : 'Returned: your letter'
  }
  return item.name ? `From ${item.name}` : 'A letter'
}

useSeo({
  title: 'Your mantel',
  description: 'The letters that have arrived for you.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-8 py-12">
    <LetterNav />
    <h1 class="text-3xl text-highlighted">Your mantel</h1>

    <div v-if="items.length === 0" class="flex flex-col gap-3 text-muted">
      <p>Nothing has arrived yet.</p>
      <p>Letters take a few days, and come in the morning on your mail days.</p>
      <UButton to="/people" variant="outline" color="neutral" class="self-start">
        Write to someone
      </UButton>
    </div>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="item in items" :key="item.letterId">
        <NuxtLink
          :to="`/letter/${item.letterId}`"
          class="flex items-center justify-between gap-4 rounded-md border border-default bg-elevated px-5 py-4 hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div class="min-w-0">
            <p class="text-highlighted" :class="{ 'font-medium': !item.opened }">
              {{ title(item) }}
            </p>
            <p v-if="item.postmark" class="text-sm text-muted">
              Postmarked {{ longDay(item.postmark) }}
            </p>
          </div>
          <UBadge v-if="!item.opened" color="primary" variant="subtle">Unopened</UBadge>
        </NuxtLink>
      </li>
    </ul>

    <p class="text-sm text-muted">
      <ULink to="/archive" class="underline">Keep a copy of your letters</ULink> on this device.
    </p>
  </div>
</template>
