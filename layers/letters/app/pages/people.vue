<script setup lang="ts">
// The people someone writes with: who has accepted, who has been invited,
// and the form that invites one more.
import type { OpenInviteView, PersonView } from '../../shared/utils/invites'

definePageMeta({ middleware: 'auth' })

const { data: nameData, refresh: refreshName } = await useFetch<{ name: string | null }>(
  '/api/letters/name',
)
const { data, refresh } = await useFetch<{ people: PersonView[]; invites: OpenInviteView[] }>(
  '/api/letters/people',
)

const name = computed(() => nameData.value?.name ?? null)
const editingName = ref(false)
const people = computed(() => data.value?.people ?? [])
const invites = computed(() => data.value?.invites ?? [])

const email = ref('')
const pending = ref(false)
const failure = ref<string | null>(null)
const sent = ref<{ email: string; link: string; emailed: boolean } | null>(null)
const copied = ref(false)

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

async function nameSaved() {
  editingName.value = false
  await refreshName()
}

async function invite() {
  pending.value = true
  failure.value = null
  sent.value = null
  copied.value = false
  try {
    const result = await $fetch<{ link: string; emailed: boolean }>('/api/letters/invites', {
      method: 'POST',
      body: { email: email.value },
    })
    sent.value = { email: email.value.trim(), ...result }
    email.value = ''
    await refresh()
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ??
      'Could not send that invitation. Try again.'
  } finally {
    pending.value = false
  }
}

async function copyLink() {
  if (!sent.value) return
  try {
    await navigator.clipboard.writeText(sent.value.link)
    copied.value = true
  } catch {
    copied.value = false
  }
}

async function withdraw(id: string) {
  try {
    await $fetch('/api/letters/invites/withdraw', { method: 'POST', body: { id } })
  } finally {
    await refresh()
  }
}

useSeo({
  title: 'People you write with',
  description: 'The people you exchange letters with, and your invitations.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-8 py-12">
    <LetterNav />
    <div>
      <h1 class="text-3xl text-highlighted">People you write with</h1>
      <p class="mt-2 text-muted">
        Letters go between people who have agreed to write this way. Invite someone, and once they
        accept you can write to each other.
      </p>
    </div>

    <UCard v-if="!name || editingName">
      <PeopleNameForm :current="name" @saved="nameSaved" />
    </UCard>
    <p v-else class="text-sm text-muted">
      You write as <span class="text-highlighted">{{ name }}</span
      >.
      <UButton variant="link" class="p-0" @click="editingName = true">Change</UButton>
    </p>

    <section aria-labelledby="people-heading" class="flex flex-col gap-3">
      <h2 id="people-heading" class="text-xl text-highlighted">Your correspondents</h2>
      <p v-if="people.length === 0" class="text-muted">Nobody yet.</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li
          v-for="person in people"
          :key="person.correspondenceId"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="text-highlighted">{{ person.name }}</p>
            <p class="text-sm text-muted">since {{ day(person.since) }}</p>
          </div>
          <UButton
            size="sm"
            :to="{ path: '/write', query: { to: person.correspondenceId } }"
            :aria-label="`Write to ${person.name}`"
          >
            Write
          </UButton>
        </li>
      </ul>
    </section>

    <section v-if="name" aria-labelledby="invite-heading" class="flex flex-col gap-3">
      <h2 id="invite-heading" class="text-xl text-highlighted">Invite someone</h2>
      <UCard>
        <form class="flex flex-col gap-4" @submit.prevent="invite">
          <UFormField
            label="Their email"
            name="email"
            help="We send one email with your name and a link. It carries no letter and no note."
          >
            <UInput
              v-model="email"
              type="email"
              size="lg"
              class="w-full"
              autocomplete="off"
              required
            />
          </UFormField>
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="failure"
          />
          <UButton type="submit" :loading="pending" class="self-start">Send invitation</UButton>
        </form>
      </UCard>

      <UAlert
        v-if="sent"
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        :title="sent.emailed ? `Invitation sent to ${sent.email}` : 'Invitation ready'"
      >
        <template #description>
          <p>
            You can also send them this link yourself. It is shown once and is good for 30 days.
          </p>
          <p class="mt-2 break-all font-mono text-sm" data-testid="invite-link">{{ sent.link }}</p>
          <UButton size="sm" variant="outline" color="neutral" class="mt-3" @click="copyLink">
            {{ copied ? 'Copied' : 'Copy link' }}
          </UButton>
        </template>
      </UAlert>
    </section>

    <section v-if="invites.length" aria-labelledby="waiting-heading" class="flex flex-col gap-3">
      <h2 id="waiting-heading" class="text-xl text-highlighted">Invitations waiting</h2>
      <ul class="flex flex-col divide-y divide-default">
        <li
          v-for="waiting in invites"
          :key="waiting.id"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="truncate text-highlighted">{{ waiting.email }}</p>
            <p class="text-sm text-muted">Good until {{ day(waiting.expiresAt) }}</p>
          </div>
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            :aria-label="`Withdraw the invitation to ${waiting.email}`"
            @click="withdraw(waiting.id)"
          >
            Withdraw
          </UButton>
        </li>
      </ul>
    </section>
  </div>
</template>
