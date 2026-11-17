<script setup lang="ts">
// Where an invitation link lands. Anyone holding the link sees who sent it;
// accepting needs an account, a name and a city. Someone who presses the
// button without an account is brought back here when they have one, and the
// invitation is then accepted for them: they have already said yes.
import type { InviteView } from '../../../shared/utils/invites'

const route = useRoute()
const token = String(route.params.token)
const { loggedIn } = useUserSession()
const { accept: acceptAndGo } = useAcceptInvite()

const invite = ref<InviteView | null>(null)
const name = ref<string | null>(null)
const loading = ref(true)
const pending = ref(false)
const failure = ref<string | null>(null)
const needs = ref<'name' | 'city' | null>(null)

const signInPath = computed(() => `/auth/sign-in?redirect=${encodeURIComponent(route.path)}`)
const sender = computed(() => invite.value?.inviterName ?? 'Someone')
const mantelName = computed(() => invite.value?.mantelName ?? null)
const familyName = computed(() => invite.value?.familyName ?? null)
// With a mantel's name: the invitation is to read the child's news.
const news = computed(() => Boolean(invite.value?.news))
const heading = computed(() => {
  if (invite.value?.status !== 'open') return "This invitation can't be used"
  if (familyName.value) return `${sender.value} invites you to ${familyName.value}`
  if (mantelName.value && news.value) {
    return `${sender.value} would like to send you news of ${mantelName.value}`
  }
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
    const kept = pendingInvite()
    const saidYes = kept?.token === token && kept.accepting
    if (invite.value.status !== 'open') forgetInvite()
    else if (!loggedIn.value) remember(false)
    if (loggedIn.value) {
      name.value = (await $fetch<{ name: string | null }>('/api/letters/name')).name
      if (!name.value) needs.value = 'name'
      else if (saidYes && invite.value.status === 'open') return await accept()
    }
  } catch {
    failure.value = 'Could not load this invitation. Try again.'
  } finally {
    loading.value = false
  }
})

/** Kept in this browser across sign-up; `accepting` once a button was pressed. */
const remember = (accepting: boolean) =>
  rememberInvite({ token, sender: invite.value?.inviterName ?? null, accepting })

async function accept() {
  pending.value = true
  failure.value = null
  const refusal = await acceptAndGo(
    { token },
    { sender: sender.value, mantelName: mantelName.value, familyName: familyName.value },
  )
  pending.value = false
  if (!refusal) return forgetInvite()
  if (refusal.reason === 'needs-name') needs.value = 'name'
  else if (refusal.reason === 'needs-city') {
    // The welcome page ends on /people, which brings them back here.
    remember(true)
    needs.value = 'city'
  } else {
    forgetInvite()
    failure.value = refusal.message
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
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8 sm:py-12">
    <p v-if="loading" class="text-muted" role="status">Opening the invitation…</p>

    <template v-else>
      <h1 class="text-3xl text-highlighted">{{ heading }}</h1>

      <template v-if="invite?.status === 'open'">
        <div class="flex flex-col gap-2">
          <p v-if="familyName" class="text-muted">
            A letter to {{ familyName }} goes to everyone in it at once, each copy arriving by post
            in that person's own city. Accepting puts you in it: you will read what is written from
            now on, and you can leave at any time.
          </p>
          <p v-else-if="mantelName && news" class="text-muted">
            {{ sender }} keeps a mantel for {{ mantelName }}, and now and then writes a letter of
            news: a photo, a first word, a birthday. Accepting means those letters come to you too,
            a few days after each is written. You can read them and cannot write back, and you can
            stop at any time. Nobody who gets the news is told who else does.
          </p>
          <p v-else-if="mantelName" class="text-muted">
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
          <UButton to="/auth/sign-up" size="lg" block @click="remember(true)">
            Create an account to accept
          </UButton>
          <UButton
            :to="signInPath"
            size="lg"
            block
            variant="outline"
            color="neutral"
            @click="remember(true)"
          >
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
