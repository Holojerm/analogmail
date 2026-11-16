<script setup lang="ts">
// Where an invitation link lands. Anyone holding the link sees who sent it;
// accepting needs an account, a name and a city.
import type { InviteView } from '../../../shared/utils/invites'

const route = useRoute()
const token = String(route.params.token)
const { loggedIn } = useUserSession()

const invite = ref<InviteView | null>(null)
const name = ref<string | null>(null)
const loading = ref(true)
const pending = ref(false)
const failure = ref<string | null>(null)
const needs = ref<'name' | 'city' | null>(null)

const signInPath = computed(() => `/auth/sign-in?redirect=${encodeURIComponent(route.path)}`)
const sender = computed(() => invite.value?.inviterName ?? 'Someone')
const mantelName = computed(() => invite.value?.mantelName ?? null)
const heading = computed(() => {
  if (invite.value?.status !== 'open') return "This invitation can't be used"
  return mantelName.value
    ? `${sender.value} asks you to write to ${mantelName.value}`
    : `${sender.value} would like to write to you`
})
const until = computed(() =>
  invite.value?.expiresAt
    ? new Date(invite.value.expiresAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null,
)

onMounted(async () => {
  try {
    invite.value = await $fetch<InviteView>('/api/letters/invites/view', {
      method: 'POST',
      body: { token },
    })
    if (invite.value.status !== 'open') forgetInvite()
    else if (!loggedIn.value) rememberInvite(token)
    if (loggedIn.value) {
      name.value = (await $fetch<{ name: string | null }>('/api/letters/name')).name
      if (!name.value) needs.value = 'name'
    }
  } catch {
    failure.value = 'Could not load this invitation. Try again.'
  } finally {
    loading.value = false
  }
})

async function accept() {
  pending.value = true
  failure.value = null
  try {
    await $fetch('/api/letters/invites/accept', { method: 'POST', body: { token } })
    forgetInvite()
    await navigateTo('/people')
  } catch (error) {
    const data = (error as { data?: { message?: string; data?: { reason?: string } } }).data
    const reason = data?.data?.reason
    if (reason === 'needs-name') needs.value = 'name'
    else if (reason === 'needs-city') {
      // Sign-up ends on /people, which brings them back here.
      rememberInvite(token)
      needs.value = 'city'
    } else {
      forgetInvite()
      failure.value = data?.message ?? 'Could not accept this invitation.'
    }
  } finally {
    pending.value = false
  }
}

async function nameSaved(saved: string) {
  name.value = saved
  needs.value = null
  await accept()
}

useSeo({
  title: 'An invitation to write',
  description: 'Someone has invited you to exchange letters.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-12">
    <p v-if="loading" class="text-muted" role="status">Opening the invitation…</p>

    <template v-else>
      <h1 class="text-3xl text-highlighted">{{ heading }}</h1>

      <template v-if="invite?.status === 'open'">
        <div class="flex flex-col gap-2">
          <p v-if="mantelName" class="text-muted">
            {{ sender }} keeps a mantel for {{ mantelName }}: a place for letters to someone who
            cannot keep their own yet. Accepting lets you write to it. Letters take days to arrive,
            the way post does, and you can seal one until a day you choose, such as a birthday.
          </p>
          <p v-else class="text-muted">
            Letters here take days to arrive, the way post does, so nobody has to answer quickly.
            Accepting lets the two of you write to each other. Either of you can stop at any time.
          </p>
          <p v-if="until" class="text-sm text-muted">This invitation is good until {{ until }}.</p>
        </div>

        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="failure"
        />

        <div v-if="!loggedIn" class="flex flex-col gap-3">
          <UButton to="/auth/sign-up" size="lg" block>Create an account to accept</UButton>
          <UButton :to="signInPath" size="lg" block variant="outline" color="neutral">
            I already have an account
          </UButton>
        </div>

        <UCard v-else-if="needs === 'name'">
          <PeopleNameForm submit-label="Save and accept" @saved="nameSaved" />
        </UCard>

        <UAlert
          v-else-if="needs === 'city'"
          color="info"
          variant="subtle"
          icon="i-lucide-map-pin"
          title="Choose your city first"
          description="The post needs to know where your letters arrive. You will come back here afterwards."
          :actions="[{ label: 'Choose my city', to: '/welcome' }]"
        />

        <UButton v-else size="lg" block :loading="pending" @click="accept">
          Accept the invitation
        </UButton>
      </template>

      <template v-else>
        <p class="text-muted">
          <template v-if="invite?.status === 'expired'">
            It has expired. Ask {{ sender }} to send you a new one.
          </template>
          <template v-else-if="invite?.status === 'accepted'">
            It has already been accepted.
          </template>
          <template v-else-if="failure">{{ failure }}</template>
          <template v-else>The link is not one we know. Check that you copied all of it.</template>
        </p>
        <UButton v-if="loggedIn" to="/people" variant="outline" color="neutral" class="self-start">
          People you write with
        </UButton>
      </template>
    </template>
  </div>
</template>
