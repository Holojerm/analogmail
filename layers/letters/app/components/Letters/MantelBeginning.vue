<script setup lang="ts">
// Under an empty mantel: the next thing this person can do, which depends on
// whether they have someone to write to, an invitation out, or neither.
import type { OpenInviteView, PersonView } from '../../../shared/utils/invites'

const { data } = useFetch<{ people: PersonView[]; invites: OpenInviteView[] }>(
  '/api/letters/people',
)
const people = computed(() => data.value?.people ?? [])
const invites = computed(() => data.value?.invites ?? [])

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="mantel-beginning">
    <template v-if="people.length">
      <p class="text-muted">A letter you write starts the post going both ways.</p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="person in people.slice(0, 3)"
          :key="person.correspondenceId"
          :to="{ path: '/write', query: { to: person.correspondenceId } }"
          variant="outline"
          color="neutral"
        >
          Write to {{ person.name }}
        </UButton>
      </div>
    </template>
    <template v-else-if="invites.length">
      <ul class="flex flex-col gap-1 text-muted">
        <li v-for="invite in invites" :key="invite.id">
          You invited <span class="text-default" data-private>{{ invite.email }}</span> on
          {{ day(invite.sentAt) }}. You can write as soon as they accept.
        </li>
      </ul>
      <UButton to="/people" variant="outline" color="neutral" class="self-start">
        Your invitations
      </UButton>
    </template>
    <UButton v-else to="/people" variant="outline" color="neutral" class="self-start">
      Invite someone to write with
    </UButton>
  </div>
</template>
