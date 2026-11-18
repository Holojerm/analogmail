<script setup lang="ts">
// The page a wedding guest reaches from the card: write one letter to the
// couple, with no account. The letter is encrypted here to the mantel's key.
// That key is checked against the fingerprint in the link's fragment first,
// which the browser never sent to us, so a key swapped on the way shows. The
// fragment also carries the link's secret, sent with each request here: the
// path without it opens nothing.
import {
  packGuestPhotoLetter,
  parseGuestLinkFragment,
  type GuestLinkView,
} from '../../../shared/utils/guest'
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
import { PHOTO_BYTES_MAX } from '../../../shared/utils/letter-photo'
import type { HeldPhoto } from '../../components/Letters/GuestPhoto.vue'
import { guestCopy } from '../../utils/guest-copy'
import { encryptLetter, newContentKey, wrapContentKey } from '../../utils/letter-crypto'
import { encryptPhoto } from '../../utils/photo-crypto'
import { saveFile } from '#layers/post/app/utils/save-file'

const route = useRoute()
const link = String(route.params.id)
const challenge = useCredentialsChallenge()

type Open = Extract<GuestLinkView, { status: 'open' }>
const state = ref<'loading' | 'open' | 'closed' | 'mismatch' | 'sent'>('loading')
const sendOff = useSendOff()
const mantel = ref<Open | null>(null)
const content = ref<RichDoc>(emptyRichDoc())
const from = ref('')
const photo = ref<HeldPhoto | null>(null)
// What was sent, kept in memory so the guest can save the only copy they get.
const sent = shallowRef<{ doc: LetterDoc; photo: ArrayBuffer | null } | null>(null)
const sending = ref(false)
const failure = ref<string | null>(null)
// From the fragment, once it has been checked against the mantel's key.
let secret = ''

async function check() {
  try {
    const printed = parseGuestLinkFragment(window.location.hash)
    if (!printed) {
      state.value = 'mismatch'
      return
    }
    const view = await $fetch<GuestLinkView>('/api/letters/guest/view', {
      method: 'POST',
      body: { link, secret: printed.secret },
    })
    if (view.status !== 'open') {
      state.value = 'closed'
      return
    }
    if (printed.fingerprint !== (await keyFingerprintToken(view.publicKey))) {
      state.value = 'mismatch'
      return
    }
    secret = printed.secret
    mantel.value = view
    state.value = 'open'
  } catch {
    state.value = 'closed'
  }
}

// Someone who mistyped the part after the # can correct it in place.
const recheck = () => {
  if (state.value === 'mismatch' || state.value === 'closed') void check()
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
    const held = photo.value
    const photoId = held ? crypto.randomUUID() : null
    const doc: LetterDoc = {
      v: 2,
      content: content.value,
      stationery: { ...DEFAULT_STATIONERY },
      from: from.value.trim(),
      ...(held && photoId
        ? { photo: { id: photoId, width: held.width, height: held.height, alt: held.alt.trim() } }
        : {}),
    }
    const letter = {
      link,
      secret,
      id,
      ciphertext: await encryptLetter(key, id, JSON.stringify(doc)),
      wrappedKey: await wrapContentKey(to.publicKey, key, { letterId: id, readerId: to.mantelId }),
      turnstileToken: challenge.token.value || undefined,
    }
    if (held && photoId) {
      const sealed = await encryptPhoto(key, { letterId: id, photoId }, held.image)
      if (sealed.length > PHOTO_BYTES_MAX) {
        failure.value = 'That photo is too large to send. Remove it or choose another.'
        return
      }
      await $fetch('/api/letters/guest/post-photo', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: packGuestPhotoLetter({ ...letter, photoId }, sealed),
      })
    } else {
      await $fetch('/api/letters/guest/post', { method: 'POST', body: letter })
    }
    sent.value = { doc, photo: held?.image ?? null }
    await sendOff.play()
    state.value = 'sent'
    sendOff.playing.value = false
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ??
      'The letter was not sent. Check your connection and try again.'
    challenge.reset()
  } finally {
    sending.value = false
  }
}

function keepCopy() {
  if (!sent.value || !mantel.value) return
  const copy = guestCopy(
    mantel.value.mantelName,
    mantel.value.opensOn,
    sent.value.doc,
    sent.value.photo,
  )
  saveFile(copy.blob, copy.name)
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
  <div class="mx-auto flex max-w-2xl flex-col gap-6 py-8 sm:py-12">
    <LetterSendOff v-if="sendOff.playing.value" />
    <h1 class="text-3xl text-highlighted">{{ heading }}</h1>

    <p v-if="state === 'loading'" class="text-muted" role="status">Opening…</p>

    <UAlert
      v-else-if="state === 'closed'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-mail-x"
      description="This link does not take letters. It may have closed, or been replaced. If you typed the address, check all of it against the card, including the part after the # sign."
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
        Until that day it is not handed to anyone, {{ mantel.mantelName }} included: the people who
        keep the key are not given the letter. There is nothing more to do: no account was made, and
        you will not hear from us.
      </p>
      <div v-if="sent" class="flex flex-col items-start gap-2">
        <UButton variant="outline" color="neutral" icon="i-lucide-download" @click="keepCopy">
          Save a copy
        </UButton>
        <p class="text-sm text-muted">
          This is the only chance to keep one. It is saved to this device as it was written, not
          encrypted, and we cannot send it to you later.
        </p>
      </div>
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
        class="ph-no-capture flex flex-col gap-6 rounded-md border border-default px-6 py-8 sm:px-10 sm:py-12"
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

      <LettersGuestPhoto v-model="photo" />

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
