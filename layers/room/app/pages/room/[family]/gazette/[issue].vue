<script setup lang="ts">
// One gazette or almanac, laid out like a small paper: a masthead, the photos
// of the period with what was written under them, and where people said they
// were. Built from the room as it stands, so a deleted photo is not in it.
import { roomIssueLabel, type RoomIssue } from '../../../../../shared/utils/room-issue'
import { roomPhotoSrc } from '../../../../../shared/utils/room-types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const familyId = String(route.params.family)
const issueId = String(route.params.issue)

const { data: issue, error } = await useFetch<RoomIssue>(`/api/room/${familyId}/issues/${issueId}`)

const almanac = computed(() => issue.value?.kind === 'almanac')
const name = computed(() => (almanac.value ? 'Almanac' : 'Gazette'))
const total = computed(() => (issue.value?.months ?? []).reduce((sum, m) => sum + m.total, 0))

const day = (at: string) =>
  new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

useSeo({
  title: () => `${name.value}, ${roomIssueLabel(issueId)}`,
  description: 'A family room, laid out to read.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 py-12">
    <LetterNav />

    <template v-if="error || !issue">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-newspaper"
        description="There is no issue for that time. One comes out when its month or year is over and something was added in it."
      />
      <ULink :to="`/room/${familyId}/gazette`" class="self-start underline underline-offset-4">
        Every issue
      </ULink>
    </template>

    <template v-else>
      <RoomTabs :family-id="familyId" />

      <header class="border-y-2 border-default py-6 text-center">
        <p class="text-sm tracking-widest text-muted uppercase">{{ issue.family.name }}</p>
        <h1 class="mt-1 text-5xl text-highlighted">{{ name }}</h1>
        <p class="mt-2 text-muted">
          {{ almanac ? `The year ${roomIssueLabel(issue.id)}` : roomIssueLabel(issue.id) }}
          <template v-if="total"> · {{ total }} {{ total === 1 ? 'photo' : 'photos' }}</template>
        </p>
      </header>

      <section
        v-for="month in issue.months"
        :key="month.id"
        :aria-labelledby="`month-${month.id}`"
        class="flex flex-col gap-4"
      >
        <h2 :id="`month-${month.id}`" class="text-2xl text-highlighted">
          {{ almanac ? roomIssueLabel(month.id) : 'Photos' }}
        </h2>
        <ul class="grid gap-6 sm:grid-cols-2">
          <li v-for="photo in month.photos" :key="photo.id">
            <figure>
              <img
                :src="roomPhotoSrc(familyId, photo.id, 'thumb')"
                :alt="photo.caption ?? ''"
                :width="photo.width"
                :height="photo.height"
                loading="lazy"
                class="h-auto w-full rounded-sm border border-default"
              />
              <figcaption class="mt-2 text-sm">
                <p v-if="photo.caption" class="text-default">{{ photo.caption }}</p>
                <p class="text-muted">
                  {{ photo.uploaderName ? `${photo.uploaderName}, ` : ''
                  }}{{ day(photo.createdAt) }}
                </p>
              </figcaption>
            </figure>
          </li>
        </ul>
        <p v-if="month.total > month.photos.length" class="text-sm text-muted">
          And {{ month.total - month.photos.length }} more in
          <ULink :to="`/room/${familyId}`" class="underline underline-offset-4">the album</ULink>.
        </p>
      </section>

      <section v-if="issue.places.length" aria-labelledby="places-heading">
        <h2 id="places-heading" class="text-2xl text-highlighted">Where people said they were</h2>
        <ul class="mt-2 flex flex-col divide-y divide-default">
          <li v-for="person in issue.places" :key="person.userId" class="py-3">
            <p class="text-highlighted">{{ person.name }}</p>
            <p class="text-sm text-muted">
              <template v-for="(stop, index) in person.stops" :key="stop.at">
                <template v-if="index">, then </template>
                <span class="text-default">{{ stop.city }}, {{ stop.country }}</span>
                from {{ day(stop.at) }}
              </template>
            </p>
          </li>
        </ul>
      </section>

      <ULink :to="`/room/${familyId}/gazette`" class="self-start underline underline-offset-4">
        Every issue
      </ULink>
    </template>
  </div>
</template>
