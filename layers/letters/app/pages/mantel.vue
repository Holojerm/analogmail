<script setup lang="ts">
// The mantel: what has arrived. Unopened letters stand on the shelf as
// envelopes; opened ones are filed below it. A letter appears here on the mail
// day it is delivered, never before. DESIGN.md › Component behavior › The objects.
import type { MantelItem } from '../../shared/utils/mantel'

definePageMeta({ middleware: ['auth', 'keys'] })

interface Kept {
  id: string
  kind: 'child' | 'anniversary'
  name: string
}
const KIND = { child: "A child's mantel", anniversary: 'Anniversary letters' } as const

const [{ data }, { data: keeping }] = await Promise.all([
  useFetch<{ items: MantelItem[] }>('/api/letters/mantel'),
  useFetch<{ mantels: Kept[]; offers: unknown[] }>('/api/mantels'),
])
const items = computed(() => data.value?.items ?? [])
const waiting = computed(() => items.value.filter((item) => !item.opened))
const opened = computed(() => items.value.filter((item) => item.opened))
const kept = computed(() => keeping.value?.mantels ?? [])
const asked = computed(() => (keeping.value?.offers ?? []).length > 0)

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
  <div class="mx-auto flex max-w-xl flex-col gap-10 py-8 sm:py-12">
    <h1 class="text-3xl text-highlighted">Your mantel</h1>

    <section aria-labelledby="shelf-heading" class="flex flex-col gap-4">
      <h2 id="shelf-heading" class="font-sans text-sm tracking-normal text-muted">
        {{ waiting.length ? 'Unopened' : 'On the shelf' }}
      </h2>
      <div>
        <ul v-if="waiting.length" class="grid grid-cols-2 items-end gap-3 px-3 sm:grid-cols-3">
          <li v-for="item in waiting" :key="item.letterId">
            <!-- The envelope. Its flap is the only "new" marker in the product. -->
            <NuxtLink
              :to="`/letter/${item.letterId}`"
              class="relative flex aspect-3/2 flex-col justify-end gap-1 rounded-t-sm border border-b-0 border-accented bg-elevated p-3 hover:bg-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 100 40"
                preserveAspectRatio="none"
                class="absolute inset-x-0 top-0 h-2/5 w-full text-primary"
              >
                <path
                  d="M0 0 L50 40 L100 0"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
              <span class="font-display text-lg/tight text-highlighted">{{ title(item) }}</span>
              <LetterPostmark v-if="item.postmark" :date="item.postmark" />
            </NuxtLink>
          </li>
        </ul>
        <div aria-hidden="true" class="h-1 rounded-sm bg-inverted" />
      </div>

      <div v-if="items.length === 0" class="flex flex-col gap-3">
        <p class="font-serif text-lg text-toned">Nothing has arrived yet.</p>
        <p class="text-muted">
          Letters take a few days, and come in the morning on your mail days.
        </p>
        <UButton to="/people" variant="outline" color="neutral" class="self-start">
          Write to someone
        </UButton>
      </div>
      <p v-else-if="waiting.length === 0" class="font-serif text-lg text-toned">
        Nothing is waiting to be opened.
      </p>
    </section>

    <section v-if="opened.length" aria-labelledby="opened-heading" class="flex flex-col gap-2">
      <h2 id="opened-heading" class="font-sans text-sm tracking-normal text-muted">Opened</h2>
      <ul class="flex flex-col divide-y divide-default">
        <li v-for="item in opened" :key="item.letterId">
          <NuxtLink
            :to="`/letter/${item.letterId}`"
            class="flex items-baseline justify-between gap-4 rounded-sm py-3 text-default hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span>{{ title(item) }}</span>
            <LetterPostmark v-if="item.postmark" :date="item.postmark" class="shrink-0" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section v-if="kept.length || asked" aria-labelledby="kept-heading" class="flex flex-col gap-2">
      <h2 id="kept-heading" class="font-sans text-sm tracking-normal text-muted">
        Mantels you keep
      </h2>
      <p v-if="asked">
        You have been asked to keep a mantel.
        <ULink to="/mantels" class="underline">See who asked</ULink>.
      </p>
      <ul v-if="kept.length" class="flex flex-col divide-y divide-default">
        <li v-for="mantel in kept" :key="mantel.id">
          <NuxtLink
            :to="`/mantels/${mantel.id}`"
            class="flex items-baseline justify-between gap-4 rounded-sm py-3 text-default hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span>{{ mantel.name }}</span>
            <span class="shrink-0 text-sm text-muted">{{ KIND[mantel.kind] }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <div class="flex flex-col gap-2">
      <WhoReads encrypted> Letters are opened on your device. We cannot read them. </WhoReads>
      <p class="text-sm text-muted">
        <ULink to="/archive" class="underline">Keep a copy of your letters</ULink> on this device.
      </p>
    </div>
  </div>
</template>
