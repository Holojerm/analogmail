<script setup lang="ts">
// The family's gazettes and almanacs: each past month, and each past year, of
// the room laid out to read. Nothing is sent to anyone when one comes out.
import { roomIssueLabel, type RoomIssueList } from '../../../../../shared/utils/room-issue'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const familyId = String(route.params.family)

const { data, error } = await useFetch<RoomIssueList>(`/api/room/${familyId}/issues`)

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
function about(issue: { photos: number; checkins: number }): string {
  return [
    issue.photos ? count(issue.photos, 'photo', 'photos') : '',
    issue.checkins ? count(issue.checkins, 'check-in', 'check-ins') : '',
  ]
    .filter(Boolean)
    .join(', ')
}

useSeo({
  title: 'Gazette',
  description: "A family room's past months and years, laid out to read.",
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 py-8 sm:py-12">
    <UAlert
      v-if="error || !data"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      description="You are not in that family."
    />

    <template v-else>
      <header>
        <p class="text-sm text-muted">The room of {{ data.family.name }}</p>
        <h1 class="text-3xl text-highlighted">Gazette</h1>
      </header>
      <RoomTabs :family-id="familyId" />
      <RoomNotice />
      <p class="font-serif text-lg text-toned">
        On the first of each month, the month before is laid out here as a gazette: the photos added
        and where people said they were. Each January the year becomes an almanac. Nobody is told
        when one comes out; it is here when you look.
      </p>

      <p v-if="!data.gazettes.length" class="font-serif text-lg text-toned">
        There is no gazette yet. The first one comes out on the first of the month after something
        is added to the room.
      </p>

      <section v-if="data.almanacs.length" aria-labelledby="almanacs-heading">
        <h2 id="almanacs-heading" class="text-xl text-highlighted">Almanacs</h2>
        <ul class="flex flex-col divide-y divide-default">
          <li v-for="issue in data.almanacs" :key="issue.id" class="py-3">
            <ULink
              :to="`/room/${familyId}/gazette/${issue.id}`"
              class="text-highlighted underline underline-offset-4"
            >
              The year {{ roomIssueLabel(issue.id) }}
            </ULink>
            <p class="text-sm text-muted">{{ about(issue) }}</p>
          </li>
        </ul>
      </section>

      <section v-if="data.gazettes.length" aria-labelledby="gazettes-heading">
        <h2 id="gazettes-heading" class="text-xl text-highlighted">Gazettes</h2>
        <ul class="flex flex-col divide-y divide-default">
          <li v-for="issue in data.gazettes" :key="issue.id" class="py-3">
            <ULink
              :to="`/room/${familyId}/gazette/${issue.id}`"
              class="text-highlighted underline underline-offset-4"
            >
              {{ roomIssueLabel(issue.id) }}
            </ULink>
            <p class="text-sm text-muted">{{ about(issue) }}</p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
