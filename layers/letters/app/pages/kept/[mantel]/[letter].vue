<script setup lang="ts">
// A letter on a kept mantel, opened by one of its keepers: this keeper's copy
// of the mantel's key opens the letter's key, and the letter is decrypted
// here. The mantel's key is held in memory only for that.
import type { KeptLetter } from '../../../../shared/utils/kept'
import { parseLetterDoc, type LetterDoc } from '../../../../shared/utils/letter-doc'
import { decryptLetter, unwrapContentKey } from '../../../utils/letter-crypto'

definePageMeta({ middleware: ['auth', 'keys'] })

const route = useRoute()
const mantelKeys = useMantelKeys()
const mantelId = String(route.params.mantel)
const letterId = String(route.params.letter)

const loading = ref(true)
const failure = ref<string | null>(null)
const mantelName = ref('')
const opened = ref<KeptLetter | null>(null)
const doc = ref<LetterDoc | null>(null)
const photoUrl = ref<string | null>(null)

onMounted(async () => {
  try {
    const mantel = await $fetch<{ id: string; name: string; wrappedKey: string | null }>(
      '/api/mantels/view',
      { method: 'POST', body: { id: mantelId } },
    )
    mantelName.value = mantel.name
    const letter = await $fetch<KeptLetter>('/api/letters/kept/open', {
      method: 'POST',
      body: { mantelId, letterId },
    })
    opened.value = letter
    if (letter.sealed) return

    const mantelKey = await mantelKeys.open(mantel)
    const privateKey = mantelKey ? await importPrivateKey(mantelKey) : null
    const key = privateKey
      ? await unwrapContentKey(privateKey, letter.wrappedKey, { letterId, readerId: mantelId })
      : null
    const text = key ? await decryptLetter(key, letterId, letter.ciphertext) : null
    doc.value = text ? parseLetterDoc(text) : null
    if (!key || !doc.value) {
      failure.value = 'This letter could not be opened on this device.'
      return
    }
    if (doc.value.photo) {
      photoUrl.value = await loadLetterPhoto(key, letterId, doc.value.photo, mantelId)
    }
  } catch {
    failure.value = 'That letter is not on this mantel.'
  } finally {
    loading.value = false
  }
})

const heading = computed(() => {
  const letter = opened.value
  if (letter && !letter.sealed && letter.name) return `To ${mantelName.value}, from ${letter.name}`
  return mantelName.value ? `A letter to ${mantelName.value}` : 'A letter'
})

useSeo({ title: 'A letter', description: 'A letter on a mantel you keep.', noindex: true })
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-6 py-12">
    <LetterNav />
    <p v-if="loading" class="text-muted" role="status">Opening…</p>

    <template v-else>
      <div>
        <h1 class="text-3xl text-highlighted">{{ heading }}</h1>
        <p v-if="opened?.postmark" class="mt-1 text-sm text-muted">
          Postmarked {{ longDay(opened.postmark) }}
        </p>
      </div>
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />
      <UAlert
        v-if="opened?.sealed"
        color="info"
        variant="subtle"
        icon="i-lucide-lock"
        :title="`Sealed until ${yearDay(opened.opensOn)}`"
        description="Nobody can open this letter before that day, its keepers included."
      />
      <LetterPaper v-if="doc" :doc="doc" :photo-url="photoUrl" />
      <UButton variant="ghost" color="neutral" class="self-start" :to="`/mantels/${mantelId}`">
        Back to the mantel
      </UButton>
    </template>
  </div>
</template>
