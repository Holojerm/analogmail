<script setup lang="ts">
// Invitations sent to this person's own address that they have not accepted.
// The link in the email is the usual way in; this is for someone who finished
// signing up somewhere the link was never opened, and would otherwise arrive
// to an empty page.
import type { IncomingInviteView } from '../../../shared/utils/invites'

const { data, refresh } = useFetch<{ invitations: IncomingInviteView[] }>(
  '/api/letters/invites/mine',
)
const { accept } = useAcceptInvite()

const invitations = computed(() => data.value?.invitations ?? [])
const accepting = ref<string | null>(null)
const failure = ref<string | null>(null)

const says = (invite: IncomingInviteView): string => {
  if (invite.kind === 'family') return `${invite.inviterName} invites you to ${invite.familyName}`
  if (invite.kind === 'news') {
    return `${invite.inviterName} would like to send you news of ${invite.mantelName}`
  }
  if (invite.kind === 'mantel')
    return `${invite.inviterName} asks you to write to ${invite.mantelName}`
  return `${invite.inviterName} would like to write to you`
}

async function take(invite: IncomingInviteView) {
  accepting.value = invite.id
  failure.value = null
  const refusal = await accept(
    { id: invite.id },
    { sender: invite.inviterName, mantelName: invite.mantelName, familyName: invite.familyName },
  )
  accepting.value = null
  if (!refusal) return
  failure.value =
    refusal.reason === 'needs-name' ? 'Choose your name below first, then accept.' : refusal.message
  await refresh()
}
</script>

<template>
  <section
    v-if="invitations.length"
    aria-labelledby="invited-heading"
    class="flex flex-col gap-3 rounded-md border border-default bg-elevated p-4"
  >
    <h2 id="invited-heading" class="text-xl text-highlighted">
      {{ invitations.length === 1 ? 'An invitation for you' : 'Invitations for you' }}
    </h2>
    <ul class="flex flex-col divide-y divide-default">
      <li
        v-for="invite in invitations"
        :key="invite.id"
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
      >
        <p class="min-w-0 text-default">{{ says(invite) }}</p>
        <UButton size="sm" :loading="accepting === invite.id" @click="take(invite)">Accept</UButton>
      </li>
    </ul>
    <p v-if="failure" class="text-sm text-error" role="alert">{{ failure }}</p>
  </section>
</template>
