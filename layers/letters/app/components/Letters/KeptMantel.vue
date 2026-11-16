<script setup lang="ts">
// The letters side of a mantel someone keeps: where its post arrives, writing
// to it, and what has arrived. A letter sealed until a day shows that day and
// nothing else.
import { ALL_MAIL_DAYS } from '#layers/post/shared/utils/mail-days'

import type { KeptItem } from '../../../shared/utils/kept'

const props = defineProps<{ mantelId: string; name: string }>()

interface City {
  id: number
  name: string
  region: string | null
  country: string
}

const post = ref<{ city: string; country: string } | null>(null)
const letters = ref<KeptItem[]>([])
const loaded = ref(false)
const failure = ref<string | null>(null)
const busy = ref(false)
const query = ref('')
const options = ref<City[]>([])

const message = (error: unknown) =>
  (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'

async function load() {
  try {
    const view = await $fetch<{ post: typeof post.value; letters: KeptItem[] }>(
      '/api/letters/kept/list',
      { method: 'POST', body: { mantelId: props.mantelId } },
    )
    post.value = view.post
    letters.value = view.letters
  } catch (error) {
    failure.value = message(error)
  } finally {
    loaded.value = true
  }
}
onMounted(load)

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

async function choose(city: City) {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/letters/kept/post', {
      method: 'PUT',
      body: {
        mantelId: props.mantelId,
        cityId: city.id,
        mailDays: ALL_MAIL_DAYS,
        deliveryHour: 10,
      },
    })
    query.value = ''
    await load()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

async function write() {
  busy.value = true
  failure.value = null
  try {
    const made = await $fetch<{ correspondenceId: string }>('/api/letters/kept/write', {
      method: 'POST',
      body: { mantelId: props.mantelId },
    })
    await navigateTo({ path: '/write', query: { to: made.correspondenceId } })
  } catch (error) {
    failure.value = message(error)
    busy.value = false
  }
}

function describe(letter: KeptItem): string {
  if (letter.sealed && letter.opensOn) return `Sealed. Opens ${yearDay(letter.opensOn)}.`
  const postmark = letter.postmark ? `Postmarked ${longDay(letter.postmark)}.` : ''
  return letter.opened ? postmark : `Unopened. ${postmark}`.trim()
}
</script>

<template>
  <section aria-labelledby="kept-letters-heading" class="flex flex-col gap-4">
    <h2 id="kept-letters-heading" class="text-xl text-highlighted">Letters</h2>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <template v-if="loaded && !post">
      <p class="text-muted">
        Before anyone can write to {{ name }}, choose the city this mantel's post arrives in.
        Letters travel to it as they would to a person there.
      </p>
      <UFormField label="The mantel's city" name="mantel-city" help="Start typing and pick it.">
        <UInput v-model="query" autocomplete="off" size="lg" class="w-full" />
        <ul v-if="options.length" class="mt-2 flex flex-col divide-y divide-default">
          <li v-for="city in options" :key="city.id">
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-start"
              :loading="busy"
              @click="choose(city)"
            >
              {{ place(city) }}
            </UButton>
          </li>
        </ul>
      </UFormField>
    </template>

    <template v-else-if="post">
      <p class="text-sm text-muted">
        Its post arrives in {{ post.city }}, {{ post.country }}, Monday to Saturday.
      </p>
      <UButton class="self-start" :loading="busy" @click="write">Write to {{ name }}</UButton>

      <p v-if="letters.length === 0" class="text-muted">Nothing has arrived yet.</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li
          v-for="letter in letters"
          :key="letter.letterId"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="text-highlighted">
              {{ letter.name ? `From ${letter.name}` : 'A letter' }}
            </p>
            <p class="text-sm text-muted">{{ describe(letter) }}</p>
          </div>
          <UButton
            v-if="!letter.sealed"
            size="sm"
            variant="outline"
            color="neutral"
            :to="`/kept/${mantelId}/${letter.letterId}`"
            :aria-label="`Read the letter${letter.name ? ` from ${letter.name}` : ''}`"
          >
            Read
          </UButton>
          <UIcon v-else name="i-lucide-lock" class="size-5 text-dimmed" aria-hidden="true" />
        </li>
      </ul>
    </template>
  </section>
</template>
