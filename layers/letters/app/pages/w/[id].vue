<script setup lang="ts">
// The page a wedding guest reaches from the card: write one letter to the
// couple, with no account. The letter is encrypted here to the mantel's key.
// That key is checked against the fingerprint in the link's fragment first,
// which the browser never sent to us, so a key swapped on the way shows.
import type { GuestLinkView } from '../../../shared/utils/guest'
import {
  DEFAULT_STATIONERY,
  LETTER_BODY_MAX,
  type LetterDoc,
} from '../../../shared/utils/letter-doc'
import {
  emptyRichDoc,
  isBlankRichDoc,
  richTextLength,
  type RichDoc,
} from '../../../shared/utils/rich-text'
import { encryptLetter, newContentKey, wrapContentKey } from '../../utils/letter-crypto'

const route = useRoute()
const link = String(route.params.id)
const challenge = useCredentialsChallenge()

type Open = Extract<GuestLinkView, { status: 'open' }>
const state = ref<'loading' | 'open' | 'closed' | 'mismatch' | 'sent'>('loading')
const mantel = ref<Open | null>(null)
const content = ref<RichDoc>(emptyRichDoc())
const from = ref('')
const sending = ref(false)
const failure = ref<string | null>(null)

async function check() {
  try {
    const view = await $fetch<GuestLinkView>('/api/letters/guest/view', {
      method: 'POST',
      body: { link },
    })
    if (view.status !== 'open') {
      state.value = 'closed'
      return
    }
    const printed = window.location.hash.slice(1)
    if (!printed || printed !== (await keyFingerprintToken(view.publicKey))) {
      state.value = 'mismatch'
      return
    }
    mantel.value = view
    state.value = 'open'
  } catch {
    state.value = 'closed'
  }
}

// Someone who mistyped the part after the # can correct it in place.
const recheck = () => {
  if (state.value === 'mismatch') void check()
}
onMounted(() => {
  window.addEventListener('hashchange', recheck)
  void check()
})
onBeforeUnmount(() => window.removeEventListener('hashchange', recheck))

const tooLong = computed(() => richTextLength(content.value) > LETTER_BODY_MAX)
const ready = computed(
  () =>
    !isBlankRichDoc(content.value) &&
    !tooLong.value &&
    from.value.trim() &&
    !challenge.blocked.value,
)

async function send() {
  const to = mantel.value
  if (!to || !ready.value) return
  sending.value = true
  failure.value = null
  try {
    const id = crypto.randomUUID()
    const key = newContentKey()
    const doc: LetterDoc = {
      v: 2,
      content: content.value,
      stationery: { ...DEFAULT_STATIONERY },
      from: from.value.trim(),
    }
    await $fetch('/api/letters/guest/post', {
      method: 'POST',
      body: {
        link,
        id,
        ciphertext: await encryptLetter(key, id, JSON.stringify(doc)),
        wrappedKey: await wrapContentKey(to.publicKey, key, {
          letterId: id,
          readerId: to.mantelId,
        }),
        turnstileToken: challenge.token.value || undefined,
      },
    })
    state.value = 'sent'
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ??
      'The letter was not sent. Check your connection and try again.'
    challenge.reset()
  } finally {
    sending.value = false
  }
}

const heading = computed(() => {
  if (state.value === 'sent') return 'Sealed'
  if (mantel.value) return `A letter to ${mantel.value.mantelName}`
  return state.value === 'loading' ? 'A letter' : 'This link cannot be used'
})

useSeo({
  title: 'Write a letter',
  description: 'Write a letter that opens on an anniversary.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-6 py-12">
    <h1 class="text-3xl text-highlighted">{{ heading }}</h1>

    <p v-if="state === 'loading'" class="text-muted" role="status">Opening…</p>

    <UAlert
      v-else-if="state === 'closed'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-mail-x"
      description="This link no longer takes letters. It may have closed, or been replaced."
    />

    <UAlert
      v-else-if="state === 'mismatch'"
      color="error"
      variant="subtle"
      icon="i-lucide-shield-alert"
      title="This link does not match its card"
      description="Nothing can be sent from here. Scan the card again, or type the whole address including the part after the # sign."
    />

    <template v-else-if="state === 'sent' && mantel">
      <p class="text-highlighted">It opens on {{ yearDay(mantel.opensOn) }}.</p>
      <p class="text-muted">
        Nobody can read it before then, {{ mantel.mantelName }} included. There is nothing more to
        do: no account was made, and you will not hear from us.
      </p>
    </template>

    <template v-else-if="mantel">
      <p class="text-muted">
        Write to {{ mantel.mantelName }} now. Your letter is sealed until
        {{ yearDay(mantel.opensOn) }}, and they open it then. It is encrypted on this device before
        it is sent, so we cannot read it. You do not need an account.
      </p>

      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />

      <div
        class="flex flex-col gap-6 rounded-md border border-default px-6 py-8 sm:px-10 sm:py-12"
        :class="stationeryClass(DEFAULT_STATIONERY)"
      >
        <LetterEditor v-model="content" />
        <UFormField
          label="Signed"
          name="from"
          class="self-end text-right"
          :ui="{ labelWrapper: 'justify-end' }"
        >
          <UInput
            v-model="from"
            variant="none"
            maxlength="60"
            placeholder="Your name"
            :ui="{ base: 'letter-signature p-0 text-right' }"
          />
        </UFormField>
      </div>

      <NuxtTurnstile
        v-if="challenge.required"
        :ref="challenge.widget"
        v-model="challenge.token.value"
      />
      <div class="flex flex-wrap items-center justify-between gap-4">
        <p class="text-sm text-muted" role="status" aria-live="polite">
          <template v-if="tooLong">This letter is too long to send. Shorten it a little.</template>
          <template v-else>Once sent it cannot be changed or taken back.</template>
        </p>
        <UButton :loading="sending" :disabled="!ready" @click="send">Seal and send</UButton>
      </div>
    </template>
  </div>
</template>
